WITH firecrawl_records AS (
  SELECT
    acquisition.*,
    document.sourceUri AS rawArtifactUri,
    document.sha256 AS rawArtifactSha256,
    document.bodyText AS rawBodyText,
    FROM_JSON(
      acquisition.contextJson,
      'STRUCT<saleAvailability:STRUCT<addressReference:STRING,independentPropertyReference:STRING,freshnessEvaluatedAt:STRING,freshnessPolicyVersion:STRING,artifactFileReferencesBySha256:MAP<STRING,STRING>>>'
    ).saleAvailability AS governedContext,
    FROM_JSON(
      acquisition.inputJson,
      'STRUCT<property_reference:STRING,exact_address_query:STRING,request_payload:STRUCT<property_reference:STRING,exact_address_query:STRING>>'
    ) AS requestInput,
    FROM_JSON(
      document.bodyText,
      'STRUCT<success:BOOLEAN,id:STRING,data:STRUCT<web:ARRAY<STRUCT<url:STRING,rawHtml:STRING,metadata:STRUCT<sourceURL:STRING,url:STRING,title:STRING,description:STRING,cacheState:STRING,contentType:STRING,robots:STRING,statusCode:INT>>>>,creditsUsed:BIGINT>'
    ) AS firecrawlEnvelope
  FROM source_acquisition_records AS acquisition
  LEFT JOIN source_raw_documents AS document
    ON acquisition.acquisitionId = document.acquisitionId
    AND document.artifactRole = 'raw'
    AND document.artifactOrdinal = 0
  WHERE
    LOWER(acquisition.publisherId) = 'firecrawl'
    OR acquisition.registrationId IN (
      'firecrawl-review-property-page-evidence',
      'firecrawl-prod-property-page-evidence'
    )
),
expanded_pages AS (
  SELECT
    record.*,
    pageOrdinal,
    page
  FROM firecrawl_records AS record
  LATERAL VIEW OUTER POSEXPLODE(
    CASE
      WHEN
        record.firecrawlEnvelope.data.web IS NOT NULL
        AND SIZE(record.firecrawlEnvelope.data.web) > 0
        THEN record.firecrawlEnvelope.data.web
      ELSE ARRAY(
        CAST(
          NULL
          AS STRUCT<url:STRING,rawHtml:STRING,metadata:STRUCT<sourceURL:STRING,url:STRING,title:STRING,description:STRING,cacheState:STRING,contentType:STRING,robots:STRING,statusCode:INT>>
        )
      )
    END
  ) pages AS pageOrdinal, page
),
page_inputs AS (
  SELECT
    expanded.*,
    COALESCE(
      expanded.requestInput.exact_address_query,
      expanded.requestInput.request_payload.exact_address_query
    ) AS exactAddressQuery,
    COALESCE(
      NULLIF(TRIM(expanded.page.metadata.sourceURL), ''),
      NULLIF(TRIM(expanded.page.metadata.url), ''),
      NULLIF(TRIM(expanded.page.url), ''),
      expanded.sourceUrl
    ) AS pageUrl,
    COALESCE(
      expanded.rawArtifactUri,
      expanded.primaryRawArtifactUri
    ) AS evidenceArtifactUriValue,
    COALESCE(
      expanded.rawArtifactSha256,
      expanded.primaryRawArtifactSha256
    ) AS evidenceArtifactSha256Value,
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_EXTRACT(
                COALESCE(
                  expanded.requestInput.exact_address_query,
                  expanded.requestInput.request_payload.exact_address_query,
                  ''
                ),
                '^"([^"]+)"',
                1
              ),
              '(?i)(,|\\s)+US\\s*$',
              ''
            ),
            '[^A-Za-z0-9]+',
            ' '
          ),
          '\\s+',
          ' '
        )
      )
    ) AS requestedAddressKey,
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              COALESCE(expanded.page.rawHtml, ''),
              '(?is)<[^>]+>',
              ' '
            ),
            '[^A-Za-z0-9]+',
            ' '
          ),
          '\\s+',
          ' '
        )
      )
    ) AS pageTextKey,
    LOWER(
      REGEXP_REPLACE(
        REGEXP_EXTRACT(
          COALESCE(
            expanded.page.metadata.sourceURL,
            expanded.page.metadata.url,
            expanded.page.url,
            expanded.sourceUrl,
            ''
          ),
          '^https?://([^/:?#]+)',
          1
        ),
        '^www\\.',
        ''
      )
    ) AS pageDomain,
    TO_TIMESTAMP(expanded.governedContext.freshnessEvaluatedAt)
      AS freshnessEvaluatedAtValue,
    ARRAY_SORT(
      ARRAY_DISTINCT(
        TRANSFORM(
          MAP_VALUES(expanded.governedContext.artifactFileReferencesBySha256),
          reference -> COALESCE(reference, '')
        )
      )
    ) AS fileReferences,
    CASE
      WHEN
        expanded.page.rawHtml IS NOT NULL
        AND expanded.page.rawHtml RLIKE
          '(?is)<script\\b[^>]*application/ld\\+json[^>]*>'
        THEN SLICE(
          SPLIT(
            expanded.page.rawHtml,
            '(?is)<script\\b[^>]*application/ld\\+json[^>]*>',
            18
          ),
          2,
          16
        )
      ELSE ARRAY(CAST(NULL AS STRING))
    END AS jsonLdFragments,
    CASE
      WHEN
        expanded.page.rawHtml IS NOT NULL
        AND SIZE(
          SPLIT(
            expanded.page.rawHtml,
            '(?is)<script\\b[^>]*application/ld\\+json[^>]*>',
            18
          )
        ) = 18
        THEN TRUE
      ELSE FALSE
    END AS jsonLdBlockLimitExceeded
  FROM expanded_pages AS expanded
),
expanded_jsonld AS (
  SELECT
    page_input.*,
    jsonLdOrdinal,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(jsonLdFragment, ''),
        '(?is)^(.*?)</script\\s*>',
        1
      ),
      ''
    ) AS jsonLdDocument
  FROM page_inputs AS page_input
  LATERAL VIEW OUTER POSEXPLODE(page_input.jsonLdFragments)
    documents AS jsonLdOrdinal, jsonLdFragment
),
bounded_jsonld AS (
  SELECT
    expanded.*,
    CASE
      WHEN
        expanded.jsonLdDocument IS NOT NULL
        AND LENGTH(expanded.jsonLdDocument) <= 262144
        AND GET_JSON_OBJECT(expanded.jsonLdDocument, '$') IS NOT NULL
        THEN expanded.jsonLdDocument
      ELSE CAST(NULL AS STRING)
    END AS usableJsonLdDocument,
    CASE
      WHEN
        expanded.jsonLdDocument IS NOT NULL
        AND LENGTH(expanded.jsonLdDocument) > 262144
        THEN TRUE
      ELSE FALSE
    END AS jsonLdDocumentLimitExceeded,
    CASE
      WHEN
        expanded.jsonLdDocument IS NOT NULL
        AND LENGTH(expanded.jsonLdDocument) <= 262144
        AND GET_JSON_OBJECT(expanded.jsonLdDocument, '$') IS NULL
        THEN TRUE
      ELSE FALSE
    END AS malformedJsonLdDocument
  FROM expanded_jsonld AS expanded
),
candidate_fields AS (
  SELECT
    bounded.*,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(bounded.usableJsonLdDocument, ''),
        '(?is)"availability"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS structuredAvailability,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(bounded.usableJsonLdDocument, ''),
        '(?is)"(?:homeStatus|mlsStatus|listingStatus)"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS structuredListingStatus,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(bounded.usableJsonLdDocument, ''),
        '(?is)"price"\\s*:\\s*"?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)"?',
        1
      ),
      ''
    ) AS structuredPrice,
    UPPER(
      NULLIF(
        REGEXP_EXTRACT(
          COALESCE(bounded.usableJsonLdDocument, ''),
          '(?is)"priceCurrency"\\s*:\\s*"([A-Za-z]{3})"',
          1
        ),
        ''
      )
    ) AS structuredCurrency,
    COALESCE(
      NULLIF(
        REGEXP_EXTRACT(
          COALESCE(bounded.usableJsonLdDocument, ''),
          '(?is)"dateModified"\\s*:\\s*"([^"]+)"',
          1
        ),
        ''
      ),
      NULLIF(
        REGEXP_EXTRACT(
          COALESCE(bounded.usableJsonLdDocument, ''),
          '(?is)"datePosted"\\s*:\\s*"([^"]+)"',
          1
        ),
        ''
      ),
      NULLIF(
        REGEXP_EXTRACT(
          COALESCE(bounded.usableJsonLdDocument, ''),
          '(?is)"datePublished"\\s*:\\s*"([^"]+)"',
          1
        ),
        ''
      )
    ) AS sourceAsOfText,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(bounded.usableJsonLdDocument, ''),
        '(?is)"streetAddress"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS pageStreet,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(bounded.usableJsonLdDocument, ''),
        '(?is)"addressLocality"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS pageLocality,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(bounded.usableJsonLdDocument, ''),
        '(?is)"addressRegion"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS pageRegion,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(bounded.usableJsonLdDocument, ''),
        '(?is)"postalCode"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS pagePostalCode,
    GREATEST(
      SIZE(
        SPLIT(
          COALESCE(bounded.usableJsonLdDocument, ''),
          '(?is)"availability"\\s*:',
          3
        )
      ) - 1,
      0
    ) AS availabilityFieldCount,
    GREATEST(
      SIZE(
        SPLIT(
          COALESCE(bounded.usableJsonLdDocument, ''),
          '(?is)"price"\\s*:',
          3
        )
      ) - 1,
      0
    ) AS priceFieldCount,
    GREATEST(
      SIZE(
        SPLIT(
          COALESCE(bounded.usableJsonLdDocument, ''),
          '(?is)"priceCurrency"\\s*:',
          3
        )
      ) - 1,
      0
    ) AS currencyFieldCount
  FROM bounded_jsonld AS bounded
),
normalized_candidates AS (
  SELECT
    candidate.*,
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            CONCAT_WS(
              ' ',
              candidate.pageStreet,
              candidate.pageLocality,
              candidate.pageRegion,
              candidate.pagePostalCode
            ),
            '[^A-Za-z0-9]+',
            ' '
          ),
          '\\s+',
          ' '
        )
      )
    ) AS structuredAddressKey,
    TRY_CAST(candidate.sourceAsOfText AS TIMESTAMP) AS sourceAsOfValue,
    TRY_CAST(
      REGEXP_REPLACE(COALESCE(candidate.structuredPrice, ''), ',', '')
      AS DECIMAL(20, 2)
    ) AS parsedStructuredPrice,
    LOWER(TRIM(COALESCE(candidate.structuredListingStatus, '')))
      AS normalizedListingStatus,
    LOWER(TRIM(COALESCE(candidate.structuredAvailability, '')))
      AS normalizedAvailability
  FROM candidate_fields AS candidate
),
classified_candidates AS (
  SELECT
    normalized.*,
    CASE
      WHEN
        normalized.requestedAddressKey <> ''
        AND normalized.structuredAddressKey = normalized.requestedAddressKey
        THEN 'EXACT'
      WHEN normalized.structuredAddressKey <> '' THEN 'NON_EXACT'
      WHEN
        normalized.requestedAddressKey <> ''
        AND INSTR(
          CONCAT(' ', normalized.pageTextKey, ' '),
          CONCAT(' ', normalized.requestedAddressKey, ' ')
        ) > 0
        THEN 'EXACT'
      ELSE 'UNKNOWN'
    END AS candidateAddressState,
    CASE
      WHEN
        normalized.sourceAsOfValue IS NULL
        OR normalized.freshnessEvaluatedAtValue IS NULL
        THEN 'UNKNOWN'
      WHEN
        CAST(normalized.sourceAsOfValue AS LONG)
          BETWEEN CAST(normalized.freshnessEvaluatedAtValue AS LONG) - 2592000
          AND CAST(normalized.freshnessEvaluatedAtValue AS LONG) + 300
        THEN 'FRESH'
      ELSE 'STALE'
    END AS candidateFreshnessState,
    CASE
      WHEN
        normalized.normalizedAvailability RLIKE '(^|[/#])instock$'
        OR normalized.normalizedListingStatus IN (
          'active',
          'for sale',
          'for_sale'
        )
        THEN TRUE
      ELSE FALSE
    END AS candidateActiveSignal,
    CASE
      WHEN
        normalized.normalizedAvailability RLIKE
          '(^|[/#])(soldout|outofstock|discontinued)$'
        OR normalized.normalizedListingStatus IN (
          'coming soon',
          'coming_soon',
          'pending',
          'under contract',
          'under_contract',
          'sold',
          'off market',
          'off_market',
          'not for sale',
          'not_for_sale'
        )
        THEN TRUE
      ELSE FALSE
    END AS candidateInactiveSignal,
    CASE
      WHEN normalized.normalizedListingStatus IN ('coming soon', 'coming_soon')
        THEN 'COMING_SOON'
      WHEN
        normalized.normalizedListingStatus IN (
          'under contract',
          'under_contract'
        )
        THEN 'UNDER_CONTRACT'
      WHEN normalized.normalizedListingStatus = 'pending' THEN 'PENDING'
      ELSE 'OTHER'
    END AS candidateInactiveStatus,
    CASE
      WHEN
        normalized.parsedStructuredPrice IS NOT NULL
        AND normalized.parsedStructuredPrice > 0
        AND normalized.parsedStructuredPrice
          <= CAST(90071992547409.91 AS DECIMAL(20, 2))
        AND normalized.structuredCurrency RLIKE '^[A-Z]{3}$'
        AND normalized.priceFieldCount = 1
        AND normalized.currencyFieldCount = 1
        THEN TRUE
      ELSE FALSE
    END AS candidateValidPrice,
    CASE
      WHEN
        normalized.availabilityFieldCount > 1
        OR (
          normalized.normalizedAvailability RLIKE '(^|[/#])instock$'
          AND normalized.normalizedAvailability RLIKE
            '(^|[/#])(soldout|outofstock|discontinued)$'
        )
        THEN TRUE
      ELSE FALSE
    END AS candidateStatusAmbiguous
  FROM normalized_candidates AS normalized
),
eligible_candidates AS (
  SELECT
    classified.*,
    CASE
      WHEN
        classified.candidateActiveSignal
        AND NOT classified.candidateInactiveSignal
        AND NOT classified.candidateStatusAmbiguous
        AND classified.candidateAddressState = 'EXACT'
        AND classified.candidateFreshnessState = 'FRESH'
        THEN TRUE
      ELSE FALSE
    END AS candidateEligibleActive,
    CASE
      WHEN
        classified.candidateInactiveSignal
        AND NOT classified.candidateActiveSignal
        AND NOT classified.candidateStatusAmbiguous
        AND classified.candidateAddressState = 'EXACT'
        AND classified.candidateFreshnessState = 'FRESH'
        THEN TRUE
      ELSE FALSE
    END AS candidateEligibleInactive
  FROM classified_candidates AS classified
),
candidate_summary AS (
  SELECT
    eligible.acquisitionId,
    eligible.pageOrdinal,
    COUNT(eligible.jsonLdDocument) AS structuredBlockCount,
    MAX(CASE WHEN eligible.jsonLdBlockLimitExceeded THEN 1 ELSE 0 END)
      AS blockLimitExceededCount,
    SUM(CASE WHEN eligible.jsonLdDocumentLimitExceeded THEN 1 ELSE 0 END)
      AS documentLimitExceededCount,
    SUM(CASE WHEN eligible.malformedJsonLdDocument THEN 1 ELSE 0 END)
      AS malformedDocumentCount,
    SUM(CASE WHEN eligible.candidateActiveSignal THEN 1 ELSE 0 END)
      AS activeSignalCount,
    SUM(CASE WHEN eligible.candidateInactiveSignal THEN 1 ELSE 0 END)
      AS inactiveSignalCount,
    SUM(CASE WHEN eligible.candidateStatusAmbiguous THEN 1 ELSE 0 END)
      AS ambiguousStatusCount,
    SUM(CASE WHEN eligible.candidateEligibleActive THEN 1 ELSE 0 END)
      AS eligibleActiveCount,
    SUM(CASE WHEN eligible.candidateEligibleInactive THEN 1 ELSE 0 END)
      AS eligibleInactiveCount,
    SUM(
      CASE
        WHEN
          eligible.candidateActiveSignal
          AND eligible.candidateAddressState = 'EXACT'
          AND eligible.candidateFreshnessState = 'STALE'
          THEN 1
        ELSE 0
      END
    ) AS staleExactActiveCount,
    SUM(
      CASE
        WHEN
          eligible.candidateActiveSignal
          AND eligible.candidateAddressState = 'EXACT'
          AND eligible.candidateFreshnessState = 'UNKNOWN'
          THEN 1
        ELSE 0
      END
    ) AS unknownFreshnessExactActiveCount,
    SUM(
      CASE
        WHEN
          eligible.candidateActiveSignal
          AND eligible.candidateAddressState = 'NON_EXACT'
          THEN 1
        ELSE 0
      END
    ) AS nonExactActiveCount,
    SUM(
      CASE
        WHEN eligible.candidateAddressState = 'EXACT' THEN 1
        ELSE 0
      END
    ) AS anyExactCount,
    SUM(
      CASE
        WHEN eligible.candidateAddressState = 'NON_EXACT' THEN 1
        ELSE 0
      END
    ) AS anyNonExactCount,
    SUM(
      CASE
        WHEN eligible.candidateFreshnessState = 'FRESH' THEN 1
        ELSE 0
      END
    ) AS anyFreshCount,
    SUM(
      CASE
        WHEN eligible.candidateFreshnessState = 'STALE' THEN 1
        ELSE 0
      END
    ) AS anyStaleCount,
    SUM(
      CASE
        WHEN
          eligible.structuredPrice IS NOT NULL
          OR eligible.structuredCurrency IS NOT NULL
          THEN 1
        ELSE 0
      END
    ) AS explicitPriceFieldCount,
    ARRAY_SORT(
      COLLECT_SET(
        CASE
          WHEN
            eligible.candidateEligibleActive
            AND eligible.candidateValidPrice
            THEN CONCAT(
              eligible.structuredCurrency,
              ':',
              CAST(eligible.parsedStructuredPrice AS STRING)
            )
          ELSE NULL
        END
      )
    ) AS eligiblePriceKeys,
    MAX(
      CASE
        WHEN eligible.candidateEligibleActive THEN eligible.sourceAsOfValue
        ELSE CAST(NULL AS TIMESTAMP)
      END
    ) AS eligibleActiveSourceAsOf,
    MAX(
      CASE
        WHEN eligible.candidateActiveSignal THEN eligible.sourceAsOfValue
        ELSE CAST(NULL AS TIMESTAMP)
      END
    ) AS activeSourceAsOf,
    MAX(eligible.sourceAsOfValue) AS anySourceAsOf,
    MAX(
      CASE
        WHEN eligible.candidateEligibleInactive
          THEN eligible.candidateInactiveStatus
        ELSE CAST(NULL AS STRING)
      END
    ) AS eligibleInactiveStatus
  FROM eligible_candidates AS eligible
  GROUP BY eligible.acquisitionId, eligible.pageOrdinal
),
classified_pages AS (
  SELECT
    page.*,
    summary.structuredBlockCount,
    summary.blockLimitExceededCount,
    summary.documentLimitExceededCount,
    summary.malformedDocumentCount,
    summary.activeSignalCount,
    summary.inactiveSignalCount,
    summary.ambiguousStatusCount,
    summary.eligibleActiveCount,
    summary.eligibleInactiveCount,
    summary.staleExactActiveCount,
    summary.unknownFreshnessExactActiveCount,
    summary.nonExactActiveCount,
    summary.anyExactCount,
    summary.anyNonExactCount,
    summary.anyFreshCount,
    summary.anyStaleCount,
    summary.explicitPriceFieldCount,
    summary.eligiblePriceKeys,
    summary.eligibleActiveSourceAsOf,
    summary.activeSourceAsOf,
    summary.anySourceAsOf,
    summary.eligibleInactiveStatus,
    CASE
      WHEN page.outcome <> 'SUCCESS' THEN CONCAT('ACQUISITION_', page.outcome)
      WHEN page.rawBodyText IS NULL THEN 'MISSING_RAW_DOCUMENT'
      WHEN page.firecrawlEnvelope IS NULL THEN 'MALFORMED_FIRECRAWL_ENVELOPE'
      WHEN page.firecrawlEnvelope.success IS NULL
        THEN 'MALFORMED_FIRECRAWL_ENVELOPE'
      WHEN NOT page.firecrawlEnvelope.success THEN 'FIRECRAWL_SUCCESS_FALSE'
      WHEN page.firecrawlEnvelope.data IS NULL
        THEN 'MALFORMED_FIRECRAWL_ENVELOPE'
      WHEN
        page.firecrawlEnvelope.data.web IS NULL
        OR SIZE(page.firecrawlEnvelope.data.web) = 0
        THEN 'EMPTY_WEB_RESULTS'
      WHEN page.page IS NULL THEN 'EMPTY_WEB_RESULTS'
      WHEN page.page.rawHtml IS NULL OR TRIM(page.page.rawHtml) = ''
        THEN 'MISSING_RAW_HTML'
      WHEN page.page.metadata.statusCode IS NULL THEN 'MISSING_PAGE_STATUS'
      WHEN
        page.page.metadata.statusCode < 200
        OR page.page.metadata.statusCode >= 300
        THEN CONCAT(
          'PAGE_HTTP_',
          CAST(page.page.metadata.statusCode AS STRING)
        )
      WHEN summary.blockLimitExceededCount > 0
        THEN 'STRUCTURED_EVIDENCE_BLOCK_LIMIT_EXCEEDED'
      WHEN summary.documentLimitExceededCount > 0
        THEN 'STRUCTURED_EVIDENCE_DOCUMENT_LIMIT_EXCEEDED'
      WHEN summary.malformedDocumentCount > 0
        THEN 'MALFORMED_JSON_LD'
      ELSE CAST(NULL AS STRING)
    END AS failureReason,
    CASE
      WHEN
        summary.ambiguousStatusCount > 0
        OR (
          summary.eligibleActiveCount > 0
          AND summary.eligibleInactiveCount > 0
        )
        OR SIZE(summary.eligiblePriceKeys) > 1
        THEN TRUE
      ELSE FALSE
    END AS hasStructuredConflict,
    CASE
      WHEN summary.eligibleActiveCount > 0 THEN 'EXACT'
      WHEN summary.eligibleInactiveCount > 0 THEN 'EXACT'
      WHEN summary.activeSignalCount > 0 AND summary.nonExactActiveCount > 0
        THEN 'NON_EXACT'
      WHEN summary.activeSignalCount > 0
        AND (
          summary.staleExactActiveCount > 0
          OR summary.unknownFreshnessExactActiveCount > 0
        )
        THEN 'EXACT'
      WHEN summary.anyExactCount > 0 THEN 'EXACT'
      WHEN summary.anyNonExactCount > 0 THEN 'NON_EXACT'
      ELSE 'UNKNOWN'
    END AS exactAddressMatchStateValue,
    CASE
      WHEN summary.eligibleActiveCount > 0 THEN 'FRESH'
      WHEN summary.eligibleInactiveCount > 0 THEN 'FRESH'
      WHEN summary.staleExactActiveCount > 0 THEN 'STALE'
      WHEN summary.unknownFreshnessExactActiveCount > 0 THEN 'UNKNOWN'
      WHEN summary.anyFreshCount > 0 THEN 'FRESH'
      WHEN summary.anyStaleCount > 0 THEN 'STALE'
      ELSE 'UNKNOWN'
    END AS freshnessStateValue,
    COALESCE(
      summary.eligibleActiveSourceAsOf,
      summary.activeSourceAsOf,
      summary.anySourceAsOf
    ) AS sourceAsOfValue,
    CONCAT(
      COALESCE(
        NULLIF(page.firecrawlEnvelope.id, ''),
        page.operationRequestId
      ),
      CASE WHEN page.page IS NULL THEN ':sentinel' ELSE ':web:' END,
      CASE
        WHEN page.page IS NULL THEN ''
        ELSE LPAD(CAST(COALESCE(page.pageOrdinal, 0) AS STRING), 4, '0')
      END
    ) AS sourceListingIdentifierValue,
    CONCAT(
      'firecrawl:',
      COALESCE(
        NULLIF(page.pageDomain, ''),
        NULLIF(LOWER(TRIM(page.domain)), ''),
        LOWER(page.publisherId)
      )
    ) AS providerIdentifierValue
  FROM page_inputs AS page
  LEFT JOIN candidate_summary AS summary
    ON page.acquisitionId = summary.acquisitionId
    AND page.pageOrdinal <=> summary.pageOrdinal
),
projected_pages AS (
  SELECT
    classified.*,
    CASE
      WHEN classified.failureReason = 'EMPTY_WEB_RESULTS'
        THEN 'LISTING_ABSENT'
      WHEN classified.failureReason IS NOT NULL THEN 'LOOKUP_FAILED'
      ELSE 'LISTING_FOUND'
    END AS observationOutcomeValue,
    CASE
      WHEN classified.failureReason IS NOT NULL THEN 'UNKNOWN'
      WHEN classified.hasStructuredConflict THEN 'OTHER'
      WHEN classified.eligibleActiveCount > 0 THEN 'ACTIVE'
      WHEN classified.eligibleInactiveCount > 0
        THEN classified.eligibleInactiveStatus
      WHEN classified.activeSignalCount > 0 THEN 'ACTIVE'
      WHEN classified.inactiveSignalCount > 0 THEN 'OTHER'
      ELSE 'UNKNOWN'
    END AS marketStatusValue,
    CASE
      WHEN classified.failureReason IS NOT NULL THEN 'NOT_APPLICABLE'
      WHEN classified.hasStructuredConflict THEN 'REJECTED'
      WHEN
        classified.eligibleActiveCount > 0
        AND SIZE(classified.eligiblePriceKeys) = 1
        THEN 'PARSED'
      WHEN
        classified.eligibleActiveCount > 0
        AND classified.explicitPriceFieldCount = 0
        THEN 'ABSENT'
      WHEN classified.explicitPriceFieldCount > 0 THEN 'REJECTED'
      ELSE 'ABSENT'
    END AS priceParseStatusValue,
    CONCAT_WS(
      '|',
      CONCAT(
        'statusCode=',
        COALESCE(
          CAST(classified.page.metadata.statusCode AS STRING),
          CAST(classified.httpStatus AS STRING),
          'null'
        )
      ),
      CASE
        WHEN classified.page.metadata.cacheState IS NOT NULL
          THEN CONCAT('cacheState=', classified.page.metadata.cacheState)
        ELSE NULL
      END,
      CASE
        WHEN classified.page.metadata.robots IS NOT NULL
          THEN CONCAT('robots=', classified.page.metadata.robots)
        ELSE NULL
      END,
      CONCAT(
        'jsonLdBlocks=',
        CAST(COALESCE(classified.structuredBlockCount, 0) AS STRING)
      ),
      CASE
        WHEN classified.failureReason IS NOT NULL
          THEN CONCAT('failure=', classified.failureReason)
        WHEN classified.hasStructuredConflict THEN 'signal=CONFLICT'
        WHEN classified.eligibleActiveCount > 0
          THEN 'signal=ACTIVE_STRUCTURED'
        WHEN classified.eligibleInactiveCount > 0
          THEN CONCAT(
            'signal=',
            COALESCE(classified.eligibleInactiveStatus, 'INACTIVE_STRUCTURED')
          )
        WHEN classified.activeSignalCount > 0
          THEN 'signal=ACTIVE_INELIGIBLE'
        WHEN classified.inactiveSignalCount > 0
          THEN 'signal=INACTIVE_INELIGIBLE'
        ELSE 'signal=UNKNOWN'
      END
    ) AS sourceStatusValue
  FROM classified_pages AS classified
),
identified_pages AS (
  SELECT
    projected.*,
    SHA2(
      CONCAT_WS(
        '|',
        projected.providerIdentifierValue,
        projected.sourceListingIdentifierValue,
        DATE_FORMAT(
          projected.retrievedAt,
          "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        ),
        projected.evidenceArtifactSha256Value
      ),
      256
    ) AS observationIdentifierValue
  FROM projected_pages AS projected
)
SELECT
  '1.0.0' AS model_version,
  observationIdentifierValue AS observation_identifier,
  providerIdentifierValue AS provider_identifier,
  operationRequestId AS source_request_identifier,
  sourceListingIdentifierValue AS source_listing_identifier,
  pageUrl AS source_url,
  sourceAsOfValue AS source_as_of,
  sourceStatusValue AS source_status,
  retrievedAt AS retrieved_at,
  observationOutcomeValue AS observation_outcome,
  marketStatusValue AS market_status,
  CASE
    WHEN priceParseStatusValue = 'PARSED'
      THEN TRY_CAST(
        ROUND(
          TRY_CAST(
            ELEMENT_AT(
              SPLIT(ELEMENT_AT(eligiblePriceKeys, 1), ':'),
              2
            )
            AS DECIMAL(20, 2)
          ) * 100
        )
        AS BIGINT
      )
    ELSE CAST(NULL AS BIGINT)
  END AS asking_price_amount_minor,
  CASE
    WHEN priceParseStatusValue = 'PARSED'
      THEN ELEMENT_AT(
        SPLIT(ELEMENT_AT(eligiblePriceKeys, 1), ':'),
        1
      )
    ELSE CAST(NULL AS STRING)
  END AS asking_price_currency,
  priceParseStatusValue AS price_parse_status,
  CASE
    WHEN evidenceArtifactUriValue IS NOT NULL THEN evidenceArtifactUriValue
    ELSE RAISE_ERROR('Firecrawl evidence artifact URI is required')
  END AS evidence_artifact_uri,
  CASE
    WHEN evidenceArtifactSha256Value IS NOT NULL
      THEN evidenceArtifactSha256Value
    ELSE RAISE_ERROR('Firecrawl evidence artifact digest is required')
  END AS evidence_artifact_sha256,
  CASE
    WHEN failureReason IS NULL THEN exactAddressMatchStateValue
    ELSE 'UNKNOWN'
  END AS exact_address_match_state,
  CASE
    WHEN failureReason IS NULL THEN freshnessStateValue
    ELSE 'UNKNOWN'
  END AS freshness_state,
  freshnessEvaluatedAtValue AS freshness_evaluated_at,
  governedContext.freshnessPolicyVersion AS freshness_policy_version,
  CASE
    WHEN failureReason IS NULL OR failureReason = 'EMPTY_WEB_RESULTS'
      THEN 'PARTIAL'
    ELSE 'UNAVAILABLE'
  END AS coverage_state,
  'SUPPORTING' AS authority_state,
  NAMED_STRUCT(
    'listing_observation_has_address',
    COALESCE(governedContext.addressReference, ''),
    'listing_observation_has_file',
    COALESCE(fileReferences, ARRAY('')),
    'listing_observation_has_property',
    governedContext.independentPropertyReference
  ) AS relationships
FROM identified_pages
