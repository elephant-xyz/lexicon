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
    OR acquisition.registrationId = 'firecrawl-review-property-page-evidence'
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
page_documents AS (
  SELECT
    expanded.*,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(expanded.page.rawHtml, ''),
        '(?is)<script[^>]*application/ld\\+json[^>]*>(.*?)</script>',
        1
      ),
      ''
    ) AS jsonLdDocument
  FROM expanded_pages AS expanded
),
page_inputs AS (
  SELECT
    page_document.*,
    COALESCE(
      page_document.requestInput.exact_address_query,
      page_document.requestInput.request_payload.exact_address_query
    ) AS exactAddressQuery,
    COALESCE(
      NULLIF(TRIM(page_document.page.metadata.sourceURL), ''),
      NULLIF(TRIM(page_document.page.metadata.url), ''),
      NULLIF(TRIM(page_document.page.url), ''),
      page_document.sourceUrl
    ) AS pageUrl,
    COALESCE(
      page_document.rawArtifactUri,
      page_document.primaryRawArtifactUri
    ) AS evidenceArtifactUriValue,
    COALESCE(
      page_document.rawArtifactSha256,
      page_document.primaryRawArtifactSha256
    ) AS evidenceArtifactSha256Value,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(page_document.jsonLdDocument, ''),
        '(?is)"availability"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS structuredAvailability,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(page_document.jsonLdDocument, ''),
        '(?is)"price"\\s*:\\s*"?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)"?',
        1
      ),
      ''
    ) AS structuredPrice,
    UPPER(
      NULLIF(
        REGEXP_EXTRACT(
          COALESCE(page_document.jsonLdDocument, ''),
          '(?is)"priceCurrency"\\s*:\\s*"([A-Za-z]{3})"',
          1
        ),
        ''
      )
    ) AS structuredCurrency,
    COALESCE(
      NULLIF(
        REGEXP_EXTRACT(
          COALESCE(page_document.jsonLdDocument, ''),
          '(?is)"dateModified"\\s*:\\s*"([^"]+)"',
          1
        ),
        ''
      ),
      NULLIF(
        REGEXP_EXTRACT(
          COALESCE(page_document.jsonLdDocument, ''),
          '(?is)"datePosted"\\s*:\\s*"([^"]+)"',
          1
        ),
        ''
      ),
      NULLIF(
        REGEXP_EXTRACT(
          COALESCE(page_document.jsonLdDocument, ''),
          '(?is)"datePublished"\\s*:\\s*"([^"]+)"',
          1
        ),
        ''
      )
    ) AS sourceAsOfText,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(page_document.jsonLdDocument, ''),
        '(?is)"startDate"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS auctionStartText,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(page_document.jsonLdDocument, ''),
        '(?is)"streetAddress"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS pageStreet,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(page_document.jsonLdDocument, ''),
        '(?is)"addressLocality"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS pageLocality,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(page_document.jsonLdDocument, ''),
        '(?is)"addressRegion"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS pageRegion,
    NULLIF(
      REGEXP_EXTRACT(
        COALESCE(page_document.jsonLdDocument, ''),
        '(?is)"postalCode"\\s*:\\s*"([^"]+)"',
        1
      ),
      ''
    ) AS pagePostalCode
  FROM page_documents AS page_document
),
normalized_pages AS (
  SELECT
    page_input.*,
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_EXTRACT(COALESCE(exactAddressQuery, ''), '^"([^"]+)"', 1),
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
              COALESCE(page.rawHtml, ''),
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
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            CONCAT_WS(
              ' ',
              pageStreet,
              pageLocality,
              pageRegion,
              pagePostalCode
            ),
            '[^A-Za-z0-9]+',
            ' '
          ),
          '\\s+',
          ' '
        )
      )
    ) AS structuredAddressKey,
    LOWER(
      REGEXP_REPLACE(
        REGEXP_EXTRACT(COALESCE(pageUrl, ''), '^https?://([^/:?#]+)', 1),
        '^www\\.',
        ''
      )
    ) AS pageDomain,
    TRY_CAST(sourceAsOfText AS TIMESTAMP) AS sourceAsOfValue,
    TRY_CAST(auctionStartText AS TIMESTAMP) AS auctionStartValue,
    TO_TIMESTAMP(governedContext.freshnessEvaluatedAt)
      AS freshnessEvaluatedAtValue,
    TRY_CAST(
      REGEXP_REPLACE(COALESCE(structuredPrice, ''), ',', '')
      AS DECIMAL(20, 2)
    ) AS parsedStructuredPrice,
    ARRAY_SORT(
      ARRAY_DISTINCT(
        TRANSFORM(
          MAP_VALUES(governedContext.artifactFileReferencesBySha256),
          reference -> COALESCE(reference, '')
        )
      )
    ) AS fileReferences
  FROM page_inputs AS page_input
),
classified_pages AS (
  SELECT
    normalized.*,
    CASE
      WHEN outcome <> 'SUCCESS' THEN CONCAT('ACQUISITION_', outcome)
      WHEN rawBodyText IS NULL THEN 'MISSING_RAW_DOCUMENT'
      WHEN firecrawlEnvelope IS NULL THEN 'MALFORMED_FIRECRAWL_ENVELOPE'
      WHEN firecrawlEnvelope.success IS NULL THEN 'MALFORMED_FIRECRAWL_ENVELOPE'
      WHEN NOT firecrawlEnvelope.success THEN 'FIRECRAWL_SUCCESS_FALSE'
      WHEN firecrawlEnvelope.data IS NULL THEN 'MALFORMED_FIRECRAWL_ENVELOPE'
      WHEN
        firecrawlEnvelope.data.web IS NULL
        OR SIZE(firecrawlEnvelope.data.web) = 0
        THEN 'EMPTY_WEB_RESULTS'
      WHEN page IS NULL THEN 'EMPTY_WEB_RESULTS'
      WHEN page.rawHtml IS NULL OR TRIM(page.rawHtml) = '' THEN 'MISSING_RAW_HTML'
      WHEN page.metadata.statusCode IS NULL THEN 'MISSING_PAGE_STATUS'
      WHEN
        page.metadata.statusCode < 200
        OR page.metadata.statusCode >= 300
        THEN CONCAT('PAGE_HTTP_', CAST(page.metadata.statusCode AS STRING))
      ELSE CAST(NULL AS STRING)
    END AS failureReason,
    CASE
      WHEN
        requestedAddressKey <> ''
        AND (
          structuredAddressKey = requestedAddressKey
          OR INSTR(
            CONCAT(' ', pageTextKey, ' '),
            CONCAT(' ', requestedAddressKey, ' ')
          ) > 0
        )
        THEN 'EXACT'
      WHEN structuredAddressKey <> '' THEN 'NON_EXACT'
      ELSE 'UNKNOWN'
    END AS exactAddressMatchStateValue,
    CASE
      WHEN
        LOWER(COALESCE(structuredAvailability, '')) RLIKE '(^|[/#])instock$'
        THEN TRUE
      WHEN
        NOT (
          COALESCE(page.rawHtml, '') RLIKE
            '(?is)(^|[^A-Za-z])not\\s+for\\s+sale([^A-Za-z]|$)'
        )
        AND COALESCE(page.rawHtml, '') RLIKE
          '(?is)(^|[^A-Za-z])for\\s+sale([^A-Za-z]|$)'
        AND COALESCE(page.metadata.title, '') RLIKE
          '(?is)(^|[^A-Za-z])for\\s+sale([^A-Za-z]|$)'
        AND requestedAddressKey <> ''
        AND INSTR(
          CONCAT(' ', pageTextKey, ' '),
          CONCAT(' ', requestedAddressKey, ' ')
        ) > 0
        THEN TRUE
      WHEN
        COALESCE(page.rawHtml, '') RLIKE '(?is)public\\s+auction'
        AND auctionStartValue IS NOT NULL
        AND freshnessEvaluatedAtValue IS NOT NULL
        AND CAST(auctionStartValue AS LONG) > CAST(freshnessEvaluatedAtValue AS LONG)
        AND CAST(auctionStartValue AS LONG)
          <= CAST(freshnessEvaluatedAtValue AS LONG) + 31536000
        THEN TRUE
      ELSE FALSE
    END AS hasExplicitActiveSignal,
    CASE
      WHEN
        LOWER(COALESCE(structuredAvailability, '')) RLIKE
          '(^|[/#])(soldout|outofstock|discontinued)$'
        THEN TRUE
      WHEN
        COALESCE(page.rawHtml, '') RLIKE
          '(?is)(^|[^A-Za-z])(not\\s+for\\s+sale|sale\\s+has\\s+ended|auction\\s+(closed|cancelled|canceled))([^A-Za-z]|$)'
        THEN TRUE
      ELSE FALSE
    END AS hasExplicitInactiveSignal,
    CASE
      WHEN
        COALESCE(page.rawHtml, '') RLIKE
          '(?is)(^|[^A-Za-z])coming\\s+soon([^A-Za-z]|$)'
        THEN 'COMING_SOON'
      WHEN
        COALESCE(page.rawHtml, '') RLIKE
          '(?is)(^|[^A-Za-z])under\\s+contract([^A-Za-z]|$)'
        THEN 'UNDER_CONTRACT'
      WHEN
        COALESCE(page.rawHtml, '') RLIKE
          '(?is)(^|[^A-Za-z])pending([^A-Za-z]|$)'
        THEN 'PENDING'
      ELSE CAST(NULL AS STRING)
    END AS explicitNonActiveStatus,
    CONCAT(
      COALESCE(NULLIF(firecrawlEnvelope.id, ''), operationRequestId),
      CASE WHEN page IS NULL THEN ':sentinel' ELSE ':web:' END,
      CASE
        WHEN page IS NULL THEN ''
        ELSE LPAD(CAST(COALESCE(pageOrdinal, 0) AS STRING), 4, '0')
      END
    ) AS sourceListingIdentifierValue,
    CONCAT(
      'firecrawl:',
      COALESCE(
        NULLIF(pageDomain, ''),
        NULLIF(LOWER(TRIM(domain)), ''),
        LOWER(publisherId)
      )
    ) AS providerIdentifierValue
  FROM normalized_pages AS normalized
),
projected_pages AS (
  SELECT
    classified.*,
    CASE
      WHEN failureReason = 'EMPTY_WEB_RESULTS' THEN 'LISTING_ABSENT'
      WHEN failureReason IS NOT NULL THEN 'LOOKUP_FAILED'
      ELSE 'LISTING_FOUND'
    END AS observationOutcomeValue,
    CASE
      WHEN failureReason IS NOT NULL THEN 'UNKNOWN'
      WHEN hasExplicitActiveSignal THEN 'ACTIVE'
      WHEN explicitNonActiveStatus IS NOT NULL THEN explicitNonActiveStatus
      WHEN hasExplicitInactiveSignal THEN 'OTHER'
      ELSE 'UNKNOWN'
    END AS marketStatusValue,
    CASE
      WHEN
        failureReason IS NOT NULL
        OR sourceAsOfValue IS NULL
        OR freshnessEvaluatedAtValue IS NULL
        THEN 'UNKNOWN'
      WHEN
        CAST(sourceAsOfValue AS LONG)
          BETWEEN CAST(freshnessEvaluatedAtValue AS LONG) - 2592000
          AND CAST(freshnessEvaluatedAtValue AS LONG) + 300
        THEN 'FRESH'
      ELSE 'STALE'
    END AS freshnessStateValue,
    CASE
      WHEN failureReason IS NOT NULL THEN 'NOT_APPLICABLE'
      WHEN structuredPrice IS NULL THEN 'ABSENT'
      WHEN
        parsedStructuredPrice IS NOT NULL
        AND parsedStructuredPrice > 0
        AND parsedStructuredPrice
          <= CAST(90071992547409.91 AS DECIMAL(20, 2))
        AND structuredCurrency RLIKE '^[A-Z]{3}$'
        THEN 'PARSED'
      ELSE 'REJECTED'
    END AS priceParseStatusValue,
    CONCAT_WS(
      '|',
      CONCAT(
        'statusCode=',
        COALESCE(
          CAST(page.metadata.statusCode AS STRING),
          CAST(httpStatus AS STRING),
          'null'
        )
      ),
      CASE
        WHEN page.metadata.cacheState IS NOT NULL
          THEN CONCAT('cacheState=', page.metadata.cacheState)
        ELSE NULL
      END,
      CASE
        WHEN page.metadata.robots IS NOT NULL
          THEN CONCAT('robots=', page.metadata.robots)
        ELSE NULL
      END,
      CASE
        WHEN structuredAvailability IS NOT NULL
          THEN CONCAT('availability=', structuredAvailability)
        ELSE NULL
      END,
      CASE
        WHEN
          COALESCE(page.rawHtml, '') RLIKE '(?is)public\\s+auction'
          AND auctionStartText IS NOT NULL
          THEN CONCAT('auctionStart=', auctionStartText)
        ELSE NULL
      END,
      CASE
        WHEN failureReason IS NOT NULL THEN CONCAT('failure=', failureReason)
        WHEN hasExplicitActiveSignal THEN 'signal=ACTIVE'
        WHEN hasExplicitInactiveSignal THEN 'signal=INACTIVE'
        WHEN explicitNonActiveStatus IS NOT NULL
          THEN CONCAT('signal=', explicitNonActiveStatus)
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
        providerIdentifierValue,
        sourceListingIdentifierValue,
        DATE_FORMAT(retrievedAt, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
        evidenceArtifactSha256Value
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
      THEN TRY_CAST(ROUND(parsedStructuredPrice * 100) AS BIGINT)
    ELSE CAST(NULL AS BIGINT)
  END AS asking_price_amount_minor,
  CASE
    WHEN priceParseStatusValue = 'PARSED' THEN structuredCurrency
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
  freshnessStateValue AS freshness_state,
  freshnessEvaluatedAtValue AS freshness_evaluated_at,
  governedContext.freshnessPolicyVersion AS freshness_policy_version,
  CASE
    WHEN failureReason IS NULL OR failureReason = 'EMPTY_WEB_RESULTS' THEN 'PARTIAL'
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
