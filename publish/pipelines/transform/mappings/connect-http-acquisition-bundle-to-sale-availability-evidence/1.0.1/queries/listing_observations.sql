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
    FROM_JSON(
      rentcast.rawBodyText,
      'ARRAY<STRUCT<id:STRING,formattedAddress:STRING,addressLine1:STRING,addressLine2:STRING,city:STRING,state:STRING,zipCode:STRING,status:STRING,price:STRING,lastSeenDate:STRING,listedDate:STRING,url:STRING>>'
    ) AS listings
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
classified AS (
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
projected AS (
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
  FROM classified
),
identified AS (
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
  FROM projected
)
SELECT
  '1.0.0' AS model_version,
  observationIdentifierValue AS observation_identifier,
  'rentcast' AS provider_identifier,
  operationRequestId AS source_request_identifier,
  listing.id AS source_listing_identifier,
  COALESCE(listing.url, sourceUrl) AS source_url,
  listingAsOf AS source_as_of,
  listing.status AS source_status,
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
FROM identified
