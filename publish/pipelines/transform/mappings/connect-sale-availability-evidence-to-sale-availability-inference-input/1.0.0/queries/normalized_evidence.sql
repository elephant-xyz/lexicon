WITH run_context AS (
  SELECT
    executionId,
    requestId,
    recordCount,
    COUNT(*) OVER () AS runManifestRowCount
  FROM source_run_manifest
),
evidence_with_count AS (
  SELECT
    evidence.*,
    COUNT(*) OVER () AS evidenceRowCount
  FROM source_evidence_records AS evidence
),
validated AS (
  SELECT
    evidence.*,
    CASE
      WHEN
        run.runManifestRowCount = 1
        AND run.recordCount = evidence.evidenceRowCount
        AND run.executionId = evidence.connectExecutionId
        AND run.requestId = evidence.connectRequestId
        AND (
          (
            evidence.lookupKeyType = 'address'
            AND evidence.lookupAddress IS NOT NULL
            AND LENGTH(TRIM(evidence.lookupAddress)) > 0
            AND evidence.lookupParcelId IS NULL
          )
          OR (
            evidence.lookupKeyType = 'parcelId'
            AND evidence.lookupAddress IS NULL
            AND evidence.lookupParcelId IS NOT NULL
            AND LENGTH(TRIM(evidence.lookupParcelId)) > 0
          )
        )
        AND (
          (
            evidence.primaryRawArtifactUri IS NULL
            AND evidence.primaryRawArtifactSha256 IS NULL
          )
          OR (
            evidence.primaryRawArtifactUri IS NOT NULL
            AND evidence.primaryRawArtifactSha256 IS NOT NULL
          )
        )
        AND (
          (
            evidence.askingPriceParseStatus = 'parsed'
            AND evidence.askingPriceAmountMinor BETWEEN 1 AND 9007199254740991
            AND evidence.askingPriceCurrency = 'USD'
            AND evidence.retrievalOutcome = 'SUCCESS'
            AND evidence.evidenceKind = 'exact_listing'
            AND evidence.exactPropertyMatch = TRUE
            AND evidence.listingStatus = 'for_sale'
          )
          OR (
            evidence.askingPriceParseStatus <> 'parsed'
            AND evidence.askingPriceAmountMinor IS NULL
            AND evidence.askingPriceCurrency IS NULL
          )
        )
        AND (
          (
            evidence.listingStatus = 'for_sale'
            AND evidence.exactPropertyMatch = TRUE
            AND evidence.askingPriceParseStatus IN (
              'parsed',
              'absent',
              'rejected'
            )
          )
          OR (
            (
              evidence.listingStatus <> 'for_sale'
              OR evidence.exactPropertyMatch IS NOT TRUE
            )
            AND evidence.askingPriceParseStatus = 'not_applicable'
          )
        )
        AND (
          evidence.listingStatus <> 'not_listed'
          OR (
            evidence.retrievalOutcome = 'SUCCESS'
            AND evidence.evidenceKind = 'complete_index_absence'
            AND evidence.exactPropertyMatch = FALSE
            AND evidence.indexCompletenessVerified = TRUE
            AND evidence.askingPriceParseStatus = 'not_applicable'
          )
        )
        AND (
          (
            evidence.evidenceKind = 'retrieval_failure'
            AND evidence.retrievalOutcome <> 'SUCCESS'
            AND evidence.exactPropertyMatch IS NULL
            AND evidence.indexCompletenessVerified = FALSE
            AND evidence.listingStatus = 'unknown'
            AND evidence.askingPriceParseStatus = 'not_applicable'
          )
          OR (
            evidence.evidenceKind = 'discovery_only'
            AND evidence.retrievalOutcome = 'SUCCESS'
            AND evidence.exactPropertyMatch IS NOT TRUE
            AND evidence.indexCompletenessVerified = FALSE
            AND evidence.listingStatus = 'unknown'
            AND evidence.askingPriceParseStatus = 'not_applicable'
          )
          OR (
            evidence.evidenceKind = 'complete_index_absence'
            AND evidence.retrievalOutcome = 'SUCCESS'
            AND evidence.exactPropertyMatch = FALSE
            AND evidence.indexCompletenessVerified = TRUE
            AND evidence.listingStatus = 'not_listed'
            AND evidence.askingPriceParseStatus = 'not_applicable'
          )
          OR (
            evidence.evidenceKind = 'exact_listing'
            AND evidence.retrievalOutcome = 'SUCCESS'
            AND evidence.exactPropertyMatch = TRUE
            AND evidence.listingStatus IN (
              'for_sale',
              'pending',
              'off_market',
              'unknown'
            )
          )
        )
      THEN TRUE
      ELSE RAISE_ERROR(
        'connect-sale-availability-evidence@2.0.0 invariant violation'
      )
    END AS _isValid
  FROM evidence_with_count AS evidence
  CROSS JOIN run_context AS run
)
SELECT
  CAST(contractVersion AS INT) AS contractVersion,
  evidenceId,
  sourceRequestId,
  connectExecutionId,
  connectRequestId,
  lookupKeyType,
  lookupCanonicalKey,
  lookupAddress,
  lookupParcelId,
  providerId,
  providerVersion,
  evidenceLevel,
  sourceUrl,
  sourceIdentity,
  publisherId,
  sourceDomain,
  retrievedAt,
  sourcePublishedAt,
  CAST(httpStatus AS INT) AS httpStatus,
  retrievalOutcome,
  CAST(retrievalAttempts AS INT) AS retrievalAttempts,
  contentType,
  failureCode,
  evidenceKind,
  exactPropertyMatch,
  indexCompletenessVerified,
  listingStatus,
  rawStatus,
  CAST(askingPriceAmountMinor AS BIGINT) AS askingPriceAmountMinor,
  askingPriceCurrency,
  askingPriceParseStatus,
  evidenceExcerpt,
  primaryRawArtifactUri,
  primaryRawArtifactSha256,
  evidenceFieldsJson,
  provenanceJson,
  sourceRecordJson,
  sourceRecordSha256
FROM validated
WHERE _isValid = TRUE
