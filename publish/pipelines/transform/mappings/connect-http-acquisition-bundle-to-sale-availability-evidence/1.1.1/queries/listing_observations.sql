WITH records_with_raw AS (
  SELECT
    acquisition.*,
    document.sourceUri AS rawArtifactUri,
    document.sha256 AS rawArtifactSha256,
    document.bodyText AS rawBodyText
  FROM source_acquisition_records AS acquisition
  LEFT JOIN source_raw_documents AS document
    ON acquisition.acquisitionId = document.acquisitionId
    AND document.artifactRole = 'raw'
    AND document.artifactOrdinal = 0
),
google_identity AS (
  SELECT
    requestId,
    FROM_JSON(
      contextJson,
      'STRUCT<saleAvailability:STRUCT<addressReference:STRING,independentPropertyReference:STRING,freshnessEvaluatedAt:STRING,freshnessPolicyVersion:STRING,artifactFileReferencesBySha256:MAP<STRING,STRING>>>'
    ).saleAvailability AS governedContext,
    FROM_JSON(
      rawBodyText,
      'STRUCT<result:STRUCT<verdict:STRUCT<addressComplete:BOOLEAN,hasUnconfirmedComponents:BOOLEAN,hasInferredComponents:BOOLEAN,hasReplacedComponents:BOOLEAN>,address:STRUCT<formattedAddress:STRING,postalAddress:STRUCT<regionCode:STRING,postalCode:STRING,administrativeArea:STRING,locality:STRING,addressLines:ARRAY<STRING>>,addressComponents:ARRAY<STRUCT<componentType:STRING,confirmationLevel:STRING,inferred:BOOLEAN,replaced:BOOLEAN>>>>>'
    ).result AS googleResult,
    rawArtifactUri AS googleArtifactUri,
    rawArtifactSha256 AS googleArtifactSha256
  FROM records_with_raw
  WHERE
    LOWER(publisherId) = 'google-address-validation'
    OR registrationId = 'google-address-validation-review-evidence'
),
rentcast_parsed AS (
  SELECT
    rentcast.*,
    FROM_JSON(
      rentcast.contextJson,
      'STRUCT<saleAvailability:STRUCT<addressReference:STRING,independentPropertyReference:STRING,freshnessEvaluatedAt:STRING,freshnessPolicyVersion:STRING,artifactFileReferencesBySha256:MAP<STRING,STRING>>>'
    ).saleAvailability AS governedContext,
    FROM_JSON(
      rentcast.inputJson,
      'STRUCT<property_reference:STRING,normalized_address:STRUCT<one_line:STRING,country_code:STRING,postal_code:STRING>>'
    ) AS requestInput,
    CASE
      WHEN rentcast.outcome = 'SUCCESS' AND rentcast.httpStatus = 404
        THEN CAST(
          ARRAY()
          AS ARRAY<STRUCT<id:STRING,formattedAddress:STRING,addressLine1:STRING,addressLine2:STRING,city:STRING,state:STRING,zipCode:STRING,status:STRING,price:STRING,lastSeenDate:STRING,listedDate:STRING,url:STRING>>
        )
      WHEN
        rentcast.outcome = 'SUCCESS'
        AND rentcast.httpStatus = 200
        AND JSON_ARRAY_LENGTH(rentcast.rawBodyText) IS NOT NULL
        THEN FROM_JSON(
          rentcast.rawBodyText,
          'ARRAY<STRUCT<id:STRING,formattedAddress:STRING,addressLine1:STRING,addressLine2:STRING,city:STRING,state:STRING,zipCode:STRING,status:STRING,price:STRING,lastSeenDate:STRING,listedDate:STRING,url:STRING>>'
        )
      ELSE CAST(
        NULL
        AS ARRAY<STRUCT<id:STRING,formattedAddress:STRING,addressLine1:STRING,addressLine2:STRING,city:STRING,state:STRING,zipCode:STRING,status:STRING,price:STRING,lastSeenDate:STRING,listedDate:STRING,url:STRING>>
      )
    END AS listings
  FROM records_with_raw AS rentcast
  WHERE
    LOWER(rentcast.publisherId) = 'rentcast'
    OR rentcast.registrationId = 'rentcast-review-sale-evidence'
),
rentcast_rows AS (
  SELECT
    rentcast.*,
    listing
  FROM rentcast_parsed AS rentcast
  LATERAL VIEW OUTER EXPLODE(rentcast.listings) exploded AS listing
),
rentcast_classified AS (
  SELECT
    rentcast.*,
    google.googleResult,
    google.googleArtifactUri,
    google.googleArtifactSha256,
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            COALESCE(rentcast.requestInput.normalized_address.one_line, ''),
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
            COALESCE(google.googleResult.address.formattedAddress, ''),
            '[^A-Za-z0-9]+',
            ' '
          ),
          '\\s+',
          ' '
        )
      )
    ) AS googleAddressKey,
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            COALESCE(rentcast.listing.formattedAddress, ''),
            '[^A-Za-z0-9]+',
            ' '
          ),
          '\\s+',
          ' '
        )
      )
    ) AS listingAddressKey,
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            COALESCE(ELEMENT_AT(google.googleResult.address.postalAddress.addressLines, 1), ''),
            '[^A-Za-z0-9]+',
            ' '
          ),
          '\\s+',
          ' '
        )
      )
    ) AS googleStreetKey,
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            COALESCE(rentcast.listing.addressLine1, ''),
            '[^A-Za-z0-9]+',
            ' '
          ),
          '\\s+',
          ' '
        )
      )
    ) AS listingStreetKey,
    LOWER(TRIM(COALESCE(google.googleResult.address.postalAddress.locality, '')))
      AS googleLocalityKey,
    LOWER(TRIM(COALESCE(rentcast.listing.city, ''))) AS listingLocalityKey,
    UPPER(TRIM(COALESCE(
      google.googleResult.address.postalAddress.administrativeArea,
      ''
    ))) AS googleAdministrativeAreaKey,
    UPPER(TRIM(COALESCE(rentcast.listing.state, '')))
      AS listingAdministrativeAreaKey,
    REGEXP_EXTRACT(
      TRIM(COALESCE(google.googleResult.address.postalAddress.postalCode, '')),
      '^([0-9]{5})',
      1
    ) AS googlePostalBase,
    REGEXP_EXTRACT(
      TRIM(COALESCE(rentcast.listing.zipCode, '')),
      '^([0-9]{5})',
      1
    ) AS listingPostalBase,
    CASE
      WHEN
        COALESCE(google.googleResult.verdict.hasInferredComponents, FALSE)
        AND (
          google.googleResult.address.addressComponents IS NULL
          OR EXISTS(
            google.googleResult.address.addressComponents,
            component ->
              COALESCE(component.inferred, FALSE)
              AND (
                component.componentType <> 'postal_code_suffix'
                OR component.confirmationLevel <> 'CONFIRMED'
              )
          )
        )
        THEN TRUE
      ELSE FALSE
    END AS hasDisallowedInferredComponents,
    UPPER(
      REGEXP_REPLACE(
        TRIM(COALESCE(rentcast.listing.status, '')),
        '[^A-Za-z0-9]+',
        '_'
      )
    ) AS normalizedRawStatus,
    TRY_CAST(
      REGEXP_REPLACE(TRIM(COALESCE(rentcast.listing.price, '')), '[,$ ]', '')
      AS DECIMAL(20, 2)
    ) AS parsedPrice,
    COALESCE(
      TO_TIMESTAMP(rentcast.listing.lastSeenDate),
      TO_TIMESTAMP(rentcast.listing.listedDate),
      rentcast.sourcePublishedAt
    ) AS listingAsOf,
    TO_TIMESTAMP(rentcast.governedContext.freshnessEvaluatedAt)
      AS freshnessEvaluatedAtValue
  FROM rentcast_rows AS rentcast
  LEFT JOIN google_identity AS google
    ON rentcast.requestId = google.requestId
),
rentcast_projected AS (
  SELECT
    classified.*,
    CASE
      WHEN outcome <> 'SUCCESS' THEN 'LOOKUP_FAILED'
      WHEN rawBodyText IS NULL OR listings IS NULL THEN 'LOOKUP_FAILED'
      WHEN listing IS NULL THEN 'LISTING_ABSENT'
      ELSE 'LISTING_FOUND'
    END AS observationOutcomeValue,
    CASE
      WHEN listing IS NULL THEN 'UNKNOWN'
      WHEN normalizedRawStatus IN ('ACTIVE', 'ACTIVE_FOR_SALE', 'FOR_SALE')
        THEN 'ACTIVE'
      WHEN normalizedRawStatus = 'COMING_SOON' THEN 'COMING_SOON'
      WHEN normalizedRawStatus = 'PENDING' THEN 'PENDING'
      WHEN normalizedRawStatus = 'UNDER_CONTRACT' THEN 'UNDER_CONTRACT'
      WHEN normalizedRawStatus = '' THEN 'UNKNOWN'
      ELSE 'OTHER'
    END AS marketStatusValue,
    CASE
      WHEN googleResult IS NULL THEN 'UNKNOWN'
      WHEN
        COALESCE(googleResult.verdict.hasUnconfirmedComponents, FALSE)
        OR NOT COALESCE(googleResult.verdict.addressComplete, FALSE)
        THEN 'AMBIGUOUS'
      WHEN
        requestedAddressKey = ''
        OR googleAddressKey <> requestedAddressKey
        THEN 'NON_EXACT'
      WHEN
        listing IS NOT NULL
        AND (
          CASE
            WHEN
              googleStreetKey <> ''
              AND googleLocalityKey <> ''
              AND googleAdministrativeAreaKey <> ''
              AND googlePostalBase <> ''
              AND listingStreetKey <> ''
              AND listingLocalityKey <> ''
              AND listingAdministrativeAreaKey <> ''
              AND listingPostalBase <> ''
              THEN NOT (
                googleStreetKey = listingStreetKey
                AND googleLocalityKey = listingLocalityKey
                AND googleAdministrativeAreaKey = listingAdministrativeAreaKey
                AND googlePostalBase = listingPostalBase
              )
            ELSE listingAddressKey <> requestedAddressKey
          END
        )
        THEN 'NON_EXACT'
      WHEN
        hasDisallowedInferredComponents
        OR COALESCE(googleResult.verdict.hasReplacedComponents, FALSE)
        THEN 'NON_EXACT'
      ELSE 'EXACT'
    END AS exactAddressMatchStateValue,
    CASE
      WHEN listing IS NULL OR listingAsOf IS NULL OR freshnessEvaluatedAtValue IS NULL
        THEN 'UNKNOWN'
      WHEN
        CAST(listingAsOf AS LONG)
          BETWEEN CAST(freshnessEvaluatedAtValue AS LONG) - 2592000
          AND CAST(freshnessEvaluatedAtValue AS LONG) + 300
        THEN 'FRESH'
      ELSE 'STALE'
    END AS freshnessStateValue,
    CASE
      WHEN listing IS NULL THEN 'NOT_APPLICABLE'
      WHEN
        parsedPrice IS NOT NULL
        AND parsedPrice > 0
        AND parsedPrice <= CAST(92233720368547758.07 AS DECIMAL(20, 2))
        THEN 'PARSED'
      WHEN listing.price IS NULL OR TRIM(listing.price) = '' THEN 'ABSENT'
      ELSE 'REJECTED'
    END AS priceParseStatusValue,
    COALESCE(rawArtifactUri, googleArtifactUri) AS evidenceArtifactUriValue,
    COALESCE(rawArtifactSha256, googleArtifactSha256) AS evidenceArtifactSha256Value,
    ARRAY_SORT(
      ARRAY_DISTINCT(
        TRANSFORM(
          MAP_VALUES(governedContext.artifactFileReferencesBySha256),
          reference -> COALESCE(reference, '')
        )
      )
    ) AS fileReferences
  FROM rentcast_classified AS classified
),
rentcast_identified AS (
  SELECT
    projected.*,
    SHA2(
      CONCAT_WS(
        '|',
        'rentcast',
        COALESCE(listing.id, operationRequestId),
        DATE_FORMAT(retrievedAt, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
        evidenceArtifactSha256Value
      ),
      256
    ) AS observationIdentifierValue
  FROM rentcast_projected AS projected
),
rentcast_observations AS (
  SELECT
    '1.0.0' AS model_version,
    observationIdentifierValue AS observation_identifier,
    'rentcast' AS provider_identifier,
    operationRequestId AS source_request_identifier,
    listing.id AS source_listing_identifier,
    COALESCE(listing.url, sourceUrl) AS source_url,
    listingAsOf AS source_as_of,
    CASE
      WHEN observationOutcomeValue = 'LOOKUP_FAILED'
        THEN COALESCE(failureCode, CAST(httpStatus AS STRING), outcome)
      WHEN observationOutcomeValue = 'LISTING_ABSENT'
        THEN CAST(httpStatus AS STRING)
      ELSE listing.status
    END AS source_status,
    retrievedAt AS retrieved_at,
    observationOutcomeValue AS observation_outcome,
    marketStatusValue AS market_status,
    CASE
      WHEN priceParseStatusValue = 'PARSED'
        THEN TRY_CAST(ROUND(parsedPrice * 100) AS BIGINT)
      ELSE CAST(NULL AS BIGINT)
    END AS asking_price_amount_minor,
    CASE
      WHEN priceParseStatusValue = 'PARSED' THEN 'USD'
      ELSE CAST(NULL AS STRING)
    END AS asking_price_currency,
    priceParseStatusValue AS price_parse_status,
    CASE
      WHEN evidenceArtifactUriValue IS NOT NULL THEN evidenceArtifactUriValue
      ELSE RAISE_ERROR('sale availability evidence artifact URI is required')
    END AS evidence_artifact_uri,
    CASE
      WHEN evidenceArtifactSha256Value IS NOT NULL
        THEN evidenceArtifactSha256Value
      ELSE RAISE_ERROR('sale availability evidence artifact digest is required')
    END AS evidence_artifact_sha256,
    exactAddressMatchStateValue AS exact_address_match_state,
    freshnessStateValue AS freshness_state,
    freshnessEvaluatedAtValue AS freshness_evaluated_at,
    governedContext.freshnessPolicyVersion AS freshness_policy_version,
    CASE
      WHEN observationOutcomeValue = 'LOOKUP_FAILED' THEN 'UNAVAILABLE'
      ELSE 'PARTIAL'
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
  FROM rentcast_identified
),
google_search_parsed AS (
  SELECT
    search_record.*,
    FROM_JSON(
      search_record.contextJson,
      'STRUCT<saleAvailability:STRUCT<addressReference:STRING,independentPropertyReference:STRING,freshnessEvaluatedAt:STRING,freshnessPolicyVersion:STRING,artifactFileReferencesBySha256:MAP<STRING,STRING>>>'
    ).saleAvailability AS governedContext,
    FROM_JSON(
      search_record.rawBodyText,
      'STRUCT<steps:ARRAY<STRUCT<type:STRING,content:ARRAY<STRUCT<type:STRING,text:STRING,annotations:ARRAY<STRUCT<type:STRING,start_index:BIGINT,end_index:BIGINT,title:STRING,url:STRING>>>>>>>'
    ) AS searchResponse
  FROM records_with_raw AS search_record
  WHERE
    LOWER(search_record.publisherId) = 'google-search-grounding'
    OR search_record.registrationId = 'google-search-grounding-review-evidence'
),
google_search_candidates AS (
  SELECT
    google_search.*,
    google_identity.googleArtifactUri,
    google_identity.googleArtifactSha256,
    stepOrdinal,
    contentOrdinal,
    annotationOrdinal,
    CASE
      WHEN
        LOWER(COALESCE(annotation.type, '')) = 'url_citation'
        AND TRIM(COALESCE(annotation.url, '')) RLIKE '^https?://'
        THEN CONCAT(
          'citation-',
          LPAD(CAST(stepOrdinal AS STRING), 4, '0'),
          '-',
          LPAD(CAST(contentOrdinal AS STRING), 4, '0'),
          '-',
          LPAD(CAST(annotationOrdinal AS STRING), 4, '0')
        )
      ELSE CAST(NULL AS STRING)
    END AS candidateIdentifier,
    CASE
      WHEN
        LOWER(COALESCE(annotation.type, '')) = 'url_citation'
        AND TRIM(COALESCE(annotation.url, '')) RLIKE '^https?://'
        THEN NULLIF(TRIM(annotation.url), '')
      ELSE CAST(NULL AS STRING)
    END AS candidateUrl,
    CASE
      WHEN LOWER(COALESCE(annotation.type, '')) = 'url_citation'
        THEN NULLIF(TRIM(annotation.title), '')
      ELSE CAST(NULL AS STRING)
    END AS candidateTitle,
    searchResponse IS NOT NULL AS responseParsed
  FROM google_search_parsed AS google_search
  LEFT JOIN google_identity
    ON google_search.requestId = google_identity.requestId
  LATERAL VIEW OUTER POSEXPLODE(google_search.searchResponse.steps)
    steps AS stepOrdinal, step
  LATERAL VIEW OUTER POSEXPLODE(step.content)
    contents AS contentOrdinal, content
  LATERAL VIEW OUTER POSEXPLODE(content.annotations)
    annotations AS annotationOrdinal, annotation
),
brave_search_parsed AS (
  SELECT
    search_record.*,
    FROM_JSON(
      search_record.contextJson,
      'STRUCT<saleAvailability:STRUCT<addressReference:STRING,independentPropertyReference:STRING,freshnessEvaluatedAt:STRING,freshnessPolicyVersion:STRING,artifactFileReferencesBySha256:MAP<STRING,STRING>>>'
    ).saleAvailability AS governedContext,
    FROM_JSON(
      search_record.rawBodyText,
      'STRUCT<web:STRUCT<results:ARRAY<STRUCT<title:STRING,url:STRING,description:STRING,extra_snippets:ARRAY<STRING>,age:STRING,page_age:STRING>>>>'
    ) AS searchResponse
  FROM records_with_raw AS search_record
  WHERE
    LOWER(search_record.publisherId) = 'brave-search'
    OR search_record.registrationId = 'brave-search-review-property-evidence'
),
brave_search_candidates AS (
  SELECT
    brave_search.*,
    google_identity.googleArtifactUri,
    google_identity.googleArtifactSha256,
    resultOrdinal,
    CASE
      WHEN TRIM(COALESCE(result.url, '')) RLIKE '^https?://'
        THEN CONCAT('result-', LPAD(CAST(resultOrdinal AS STRING), 4, '0'))
      ELSE CAST(NULL AS STRING)
    END AS candidateIdentifier,
    CASE
      WHEN TRIM(COALESCE(result.url, '')) RLIKE '^https?://'
        THEN NULLIF(TRIM(result.url), '')
      ELSE CAST(NULL AS STRING)
    END AS candidateUrl,
    NULLIF(TRIM(result.title), '') AS candidateTitle,
    searchResponse IS NOT NULL AS responseParsed
  FROM brave_search_parsed AS brave_search
  LEFT JOIN google_identity
    ON brave_search.requestId = google_identity.requestId
  LATERAL VIEW OUTER POSEXPLODE(brave_search.searchResponse.web.results)
    results AS resultOrdinal, result
),
google_search_bounded AS (
  SELECT *
  FROM (
    SELECT
      candidates.*,
      ROW_NUMBER() OVER (
        PARTITION BY operationRequestId
        ORDER BY
          CASE WHEN candidateUrl IS NULL THEN 1 ELSE 0 END,
          stepOrdinal,
          contentOrdinal,
          annotationOrdinal
      ) AS candidateRank
    FROM google_search_candidates AS candidates
  ) AS ranked
  WHERE candidateRank <= 3
),
brave_search_bounded AS (
  SELECT *
  FROM (
    SELECT
      candidates.*,
      ROW_NUMBER() OVER (
        PARTITION BY operationRequestId
        ORDER BY
          CASE WHEN candidateUrl IS NULL THEN 1 ELSE 0 END,
          resultOrdinal
      ) AS candidateRank
    FROM brave_search_candidates AS candidates
  ) AS ranked
  WHERE candidateRank <= 3
),
search_candidates AS (
  SELECT
    'google-search-grounding' AS providerIdentifierValue,
    operationRequestId,
    retrievedAt,
    outcome,
    failureCode,
    httpStatus,
    governedContext,
    rawArtifactUri,
    rawArtifactSha256,
    googleArtifactUri,
    googleArtifactSha256,
    candidateIdentifier,
    candidateUrl,
    candidateTitle,
    responseParsed
  FROM google_search_bounded
  UNION ALL
  SELECT
    'brave-search' AS providerIdentifierValue,
    operationRequestId,
    retrievedAt,
    outcome,
    failureCode,
    httpStatus,
    governedContext,
    rawArtifactUri,
    rawArtifactSha256,
    googleArtifactUri,
    googleArtifactSha256,
    candidateIdentifier,
    candidateUrl,
    candidateTitle,
    responseParsed
  FROM brave_search_bounded
),
search_projected AS (
  SELECT
    candidates.*,
    CASE
      WHEN outcome <> 'SUCCESS' OR NOT responseParsed THEN 'LOOKUP_FAILED'
      WHEN candidateUrl IS NULL THEN 'LISTING_ABSENT'
      ELSE 'LISTING_FOUND'
    END AS observationOutcomeValue,
    COALESCE(rawArtifactUri, googleArtifactUri) AS evidenceArtifactUriValue,
    COALESCE(rawArtifactSha256, googleArtifactSha256)
      AS evidenceArtifactSha256Value,
    TO_TIMESTAMP(governedContext.freshnessEvaluatedAt)
      AS freshnessEvaluatedAtValue,
    ARRAY_SORT(
      ARRAY_DISTINCT(
        TRANSFORM(
          MAP_VALUES(governedContext.artifactFileReferencesBySha256),
          reference -> COALESCE(reference, '')
        )
      )
    ) AS fileReferences
  FROM search_candidates AS candidates
),
search_identified AS (
  SELECT
    projected.*,
    SHA2(
      CONCAT_WS(
        '|',
        providerIdentifierValue,
        COALESCE(candidateIdentifier, operationRequestId),
        DATE_FORMAT(retrievedAt, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
        evidenceArtifactSha256Value
      ),
      256
    ) AS observationIdentifierValue
  FROM search_projected AS projected
),
search_observations AS (
  SELECT
    '1.0.0' AS model_version,
    observationIdentifierValue AS observation_identifier,
    providerIdentifierValue AS provider_identifier,
    operationRequestId AS source_request_identifier,
    candidateIdentifier AS source_listing_identifier,
    candidateUrl AS source_url,
    CAST(NULL AS TIMESTAMP) AS source_as_of,
    CASE
      WHEN observationOutcomeValue = 'LOOKUP_FAILED'
        THEN COALESCE(failureCode, CAST(httpStatus AS STRING), outcome)
      WHEN observationOutcomeValue = 'LISTING_FOUND'
        THEN COALESCE(candidateTitle, 'SEARCH_CANDIDATE')
      ELSE CAST(NULL AS STRING)
    END AS source_status,
    retrievedAt AS retrieved_at,
    observationOutcomeValue AS observation_outcome,
    'UNKNOWN' AS market_status,
    CAST(NULL AS BIGINT) AS asking_price_amount_minor,
    CAST(NULL AS STRING) AS asking_price_currency,
    'NOT_APPLICABLE' AS price_parse_status,
    CASE
      WHEN evidenceArtifactUriValue IS NOT NULL THEN evidenceArtifactUriValue
      ELSE RAISE_ERROR('search evidence artifact URI is required')
    END AS evidence_artifact_uri,
    CASE
      WHEN evidenceArtifactSha256Value IS NOT NULL
        THEN evidenceArtifactSha256Value
      ELSE RAISE_ERROR('search evidence artifact digest is required')
    END AS evidence_artifact_sha256,
    'UNKNOWN' AS exact_address_match_state,
    'UNKNOWN' AS freshness_state,
    freshnessEvaluatedAtValue AS freshness_evaluated_at,
    governedContext.freshnessPolicyVersion AS freshness_policy_version,
    CASE
      WHEN observationOutcomeValue = 'LOOKUP_FAILED' THEN 'UNAVAILABLE'
      ELSE 'PARTIAL'
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
  FROM search_identified
)
SELECT * FROM rentcast_observations
UNION ALL
SELECT * FROM search_observations
