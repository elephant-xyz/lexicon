WITH run_counts AS (
  SELECT
    runId,
    COUNT(*) AS actualRecordCount
  FROM source_acquisition_records
  GROUP BY runId
),
targets AS (
  SELECT
    acquisition.*,
    GET_JSON_OBJECT(
      acquisition.contextJson,
      '$.opaqueCallerInput.address'
    ) AS lookupAddress,
    LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          GET_JSON_OBJECT(
            acquisition.contextJson,
            '$.opaqueCallerInput.address'
          ),
          '(?i)(?:apt|apartment|unit)\\.?\\s*|#\\s*',
          ' unit '
        ),
        '[,.]',
        ' '
      )
    ) AS normalizedAddress,
    LOWER(
      REGEXP_EXTRACT(
        GET_JSON_OBJECT(
          acquisition.contextJson,
          '$.opaqueCallerInput.address'
        ),
        '(?i)(?:(?:apt|apartment|unit)\\.?\\s*|#\\s*)([A-Za-z0-9-]+)',
        1
      )
    ) AS targetUnit,
    CASE
      WHEN
        manifest.recordCount = run_counts.actualRecordCount
        AND manifest.runId = acquisition.runId
        AND manifest.requestId = acquisition.requestId
      THEN TRUE
      ELSE RAISE_ERROR('connect-http-acquisition run manifest mismatch')
    END AS manifestValid
  FROM source_acquisition_records AS acquisition
  INNER JOIN source_run_manifest AS manifest
    ON manifest.runId = acquisition.runId
  INNER JOIN run_counts
    ON run_counts.runId = acquisition.runId
),
extract_rollup AS (
  SELECT
    target.acquisitionId,
    MAX(
      CASE
        WHEN extract.unit = target.targetUnit THEN 1
        ELSE 0
      END
    ) AS exactMatchCount,
    MAX(
      CASE
        WHEN extract.unit = target.targetUnit THEN extract.priceMajor
        ELSE NULL
      END
    ) AS priceMajor,
    MAX(
      CASE
        WHEN extract.unit = target.targetUnit THEN extract.mlsId
        ELSE NULL
      END
    ) AS mlsId,
    MAX(
      CASE
        WHEN extract.unit = target.targetUnit THEN extract.rawStatus
        ELSE NULL
      END
    ) AS rawStatus,
    MAX(
      CASE
        WHEN extract.indexComplete = TRUE THEN 1
        ELSE 0
      END
    ) AS indexCompleteCount,
    MAX(extract.listedCount) AS listedCount
  FROM targets AS target
  LEFT JOIN source_html_extracts AS extract
    ON extract.acquisitionId = target.acquisitionId
  GROUP BY target.acquisitionId, target.targetUnit
),
brave_rollup AS (
  SELECT
    acquisitionId,
    MAX(GET_JSON_OBJECT(bodyText, '$.web.results[0].url')) AS firstResultUrl
  FROM source_raw_documents
  WHERE
    registrationId = 'brave-search-api'
    AND artifactRole = 'raw'
    AND contentType = 'application/json'
  GROUP BY acquisitionId
),
classified AS (
  SELECT
    target.*,
    COALESCE(rollup.exactMatchCount, 0) > 0 AS exactPropertyMatchValue,
    COALESCE(rollup.indexCompleteCount, 0) > 0 AS indexCompleteValue,
    rollup.priceMajor,
    rollup.mlsId,
    rollup.rawStatus,
    rollup.listedCount,
    brave.firstResultUrl AS braveFirstResultUrl,
    CASE
      WHEN target.outcome <> 'SUCCESS' THEN 'retrieval_failure'
      WHEN target.registrationId = 'brave-search-api' THEN 'discovery_only'
      WHEN COALESCE(rollup.exactMatchCount, 0) > 0 THEN 'exact_listing'
      WHEN
        target.registrationId = 'discover-homes-webpage'
        AND COALESCE(rollup.indexCompleteCount, 0) > 0
      THEN 'complete_index_absence'
      ELSE 'discovery_only'
    END AS evidenceKindValue
  FROM targets AS target
  LEFT JOIN extract_rollup AS rollup
    ON rollup.acquisitionId = target.acquisitionId
  LEFT JOIN brave_rollup AS brave
    ON brave.acquisitionId = target.acquisitionId
  WHERE target.manifestValid = TRUE
),
projected AS (
  SELECT
    classified.*,
    CASE
      WHEN evidenceKindValue = 'exact_listing' THEN 'for_sale'
      WHEN evidenceKindValue = 'complete_index_absence' THEN 'not_listed'
      ELSE 'unknown'
    END AS listingStatusValue,
    CASE
      WHEN evidenceKindValue = 'exact_listing' AND priceMajor > 0
      THEN CAST(priceMajor * 100 AS BIGINT)
      ELSE NULL
    END AS priceMinorValue,
    CASE
      WHEN evidenceKindValue = 'exact_listing' AND priceMajor > 0
      THEN 'parsed'
      WHEN evidenceKindValue = 'exact_listing' AND priceMajor IS NULL
      THEN 'absent'
      WHEN evidenceKindValue = 'exact_listing'
      THEN 'rejected'
      ELSE 'not_applicable'
    END AS priceParseStatusValue
  FROM classified
)
SELECT
  CAST(2 AS BIGINT) AS contractVersion,
  CONCAT(
    'ev_',
    SHA2(
      CONCAT_WS(
        '|',
        acquisitionId,
        targetUnit,
        evidenceKindValue,
        COALESCE(primaryRawArtifactSha256, '')
      ),
      256
    )
  ) AS evidenceId,
  acquisitionId,
  operationRequestId,
  runId,
  requestId,
  lookupAddress,
  CONCAT(
    'address:',
    TRIM(REGEXP_REPLACE(normalizedAddress, '\\s+', ' '))
  ) AS lookupCanonicalKey,
  registrationId,
  registrationVersion,
  publisherId,
  sourceUrl,
  retrievedAt,
  sourcePublishedAt,
  httpStatus,
  outcome AS retrievalOutcome,
  evidenceKindValue AS evidenceKind,
  CASE
    WHEN evidenceKindValue = 'retrieval_failure' THEN CAST(NULL AS BOOLEAN)
    WHEN evidenceKindValue = 'exact_listing' THEN TRUE
    ELSE FALSE
  END AS exactPropertyMatch,
  evidenceKindValue = 'complete_index_absence' AS indexCompletenessVerified,
  listingStatusValue AS listingStatus,
  rawStatus,
  priceMinorValue AS askingPriceAmountMinor,
  CASE
    WHEN priceMinorValue IS NOT NULL THEN 'USD'
    ELSE NULL
  END AS askingPriceCurrency,
  priceParseStatusValue AS askingPriceParseStatus,
  CASE
    WHEN evidenceKindValue = 'exact_listing' THEN mlsId
    ELSE NULL
  END AS mlsId,
  CASE
    WHEN registrationId = 'brave-search-api'
    THEN CONCAT(
      'registration=brave-search-api; firstResultUrl=',
      COALESCE(braveFirstResultUrl, 'none')
    )
    ELSE CONCAT(
      'registration=',
      registrationId,
      '; unit=',
      targetUnit,
      '; exact=',
      CAST(exactPropertyMatchValue AS STRING),
      '; listedCount=',
      COALESCE(CAST(listedCount AS STRING), 'unknown')
    )
  END AS evidenceExcerpt,
  primaryRawArtifactUri,
  primaryRawArtifactSha256,
  provenanceJson,
  sourceRecordSha256 AS acquisitionRecordSha256,
  TO_JSON(
    NAMED_STRUCT(
      'braveFirstResultUrl',
      braveFirstResultUrl,
      'exactPropertyMatch',
      exactPropertyMatchValue,
      'indexComplete',
      indexCompleteValue,
      'mlsId',
      mlsId,
      'priceMajor',
      priceMajor,
      'unit',
      targetUnit
    )
  ) AS extractionJson
FROM projected
