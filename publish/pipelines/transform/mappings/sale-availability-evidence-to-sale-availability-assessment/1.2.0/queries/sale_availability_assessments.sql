WITH grouped AS (
  SELECT
    relationships.listing_observation_has_address AS addressReference,
    ARRAY_SORT(
      ARRAY_DISTINCT(COLLECT_LIST(observation_identifier))
    ) AS observationReferences,
    ARRAY_SORT(
      ARRAY_DISTINCT(
        COLLECT_SET(relationships.listing_observation_has_property)
      )
    ) AS propertyReferences,
    MIN(retrieved_at) AS windowStartAtValue,
    MAX(freshness_evaluated_at) AS windowEndAtValue,
    ARRAY_SORT(
      COLLECT_SET(
        CASE
          WHEN
            observation_outcome = 'LISTING_FOUND'
            AND market_status = 'ACTIVE'
            AND exact_address_match_state = 'EXACT'
            AND freshness_state = 'FRESH'
            AND price_parse_status = 'PARSED'
            AND asking_price_amount_minor > 0
            AND asking_price_amount_minor <= 9007199254740991
            AND asking_price_currency RLIKE '^[A-Z]{3}$'
          THEN CONCAT(
            asking_price_currency,
            ':',
            CAST(asking_price_amount_minor AS STRING)
          )
          ELSE NULL
        END
      )
    ) AS eligiblePriceKeys,
    SUM(
      CASE
        WHEN
          observation_outcome = 'LISTING_FOUND'
          AND market_status = 'ACTIVE'
          AND exact_address_match_state = 'EXACT'
          AND freshness_state = 'FRESH'
        THEN 1
        ELSE 0
      END
    ) AS activeConclusionCount,
    SUM(
      CASE
        WHEN
          observation_outcome = 'LISTING_FOUND'
          AND market_status IN (
            'COMING_SOON',
            'PENDING',
            'UNDER_CONTRACT',
            'OTHER'
          )
          AND exact_address_match_state = 'EXACT'
          AND freshness_state = 'FRESH'
        THEN 1
        ELSE 0
      END
    ) AS unsupportedStatusCount,
    SUM(
      CASE
        WHEN
          observation_outcome = 'LISTING_ABSENT'
          AND exact_address_match_state = 'EXACT'
          AND freshness_state = 'FRESH'
          AND coverage_state = 'COMPLETE'
          AND authority_state = 'AUTHORITATIVE'
        THEN 1
        ELSE 0
      END
    ) AS authoritativeNegativeCount,
    SUM(
      CASE
        WHEN
          LOWER(provider_identifier) = 'rentcast'
          AND observation_outcome = 'LOOKUP_FAILED'
        THEN 1
        ELSE 0
      END
    ) AS rentcastLookupFailedCount,
    SUM(
      CASE
        WHEN observation_outcome = 'LOOKUP_FAILED' THEN 1
        ELSE 0
      END
    ) AS anyLookupFailedCount,
    SUM(
      CASE
        WHEN
          observation_outcome = 'LOOKUP_FAILED'
          AND UPPER(COALESCE(source_status, '')) RLIKE
            '(^|[^0-9])429([^0-9]|$)|RATE|THROTTL'
        THEN 1
        ELSE 0
      END
    ) AS rateLimitedFailureCount,
    SUM(
      CASE
        WHEN
          observation_outcome = 'LOOKUP_FAILED'
          AND UPPER(COALESCE(source_status, '')) RLIKE
            '(^|[^0-9])(401|403)([^0-9]|$)|AUTH|CREDENTIAL|API[_ -]?KEY'
        THEN 1
        ELSE 0
      END
    ) AS authenticationFailureCount,
    SUM(
      CASE
        WHEN
          LOWER(provider_identifier) = 'rentcast'
          AND observation_outcome = 'LISTING_FOUND'
        THEN 1
        ELSE 0
      END
    ) AS rentcastListingFoundCount,
    SUM(
      CASE
        WHEN
          LOWER(provider_identifier) = 'rentcast'
          AND observation_outcome = 'LISTING_FOUND'
          AND exact_address_match_state = 'AMBIGUOUS'
        THEN 1
        ELSE 0
      END
    ) AS ambiguousAddressCount,
    SUM(
      CASE
        WHEN
          LOWER(provider_identifier) = 'rentcast'
          AND observation_outcome = 'LISTING_FOUND'
          AND exact_address_match_state = 'NON_EXACT'
        THEN 1
        ELSE 0
      END
    ) AS nonExactAddressCount,
    SUM(
      CASE
        WHEN
          LOWER(provider_identifier) = 'rentcast'
          AND observation_outcome = 'LISTING_FOUND'
          AND exact_address_match_state = 'EXACT'
          AND freshness_state = 'STALE'
        THEN 1
        ELSE 0
      END
    ) AS staleEvidenceCount,
    SUM(
      CASE
        WHEN
          LOWER(provider_identifier) = 'rentcast'
          AND observation_outcome = 'LISTING_FOUND'
          AND exact_address_match_state = 'EXACT'
          AND freshness_state = 'FRESH'
          AND market_status = 'UNKNOWN'
        THEN 1
        ELSE 0
      END
    ) AS unknownStatusCount,
    SUM(
      CASE
        WHEN
          LOWER(provider_identifier) IN (
            'google-search-grounding',
            'brave-search'
          )
          AND observation_outcome = 'LISTING_FOUND'
        THEN 1
        ELSE 0
      END
    ) AS searchCandidateCount
  FROM source_listing_observations
  GROUP BY relationships.listing_observation_has_address
),
classified AS (
  SELECT
    grouped.*,
    CASE
      WHEN SIZE(propertyReferences) = 1 THEN ELEMENT_AT(propertyReferences, 1)
      ELSE CAST(NULL AS STRING)
    END AS propertyReference,
    SIZE(eligiblePriceKeys) AS eligiblePriceCount
  FROM grouped
),
decided AS (
  SELECT
    classified.*,
    CASE
      WHEN activeConclusionCount > 0 AND eligiblePriceCount > 1
        THEN 'CONFLICT'
      WHEN
        activeConclusionCount > 0
        AND (
          unsupportedStatusCount > 0
          OR authoritativeNegativeCount > 0
        )
        THEN 'CONFLICT'
      WHEN activeConclusionCount > 0 THEN 'FOR_SALE'
      WHEN authoritativeNegativeCount > 0 THEN 'NOT_FOR_SALE'
      ELSE 'UNKNOWN'
    END AS availabilityStatusValue
  FROM classified
),
reasoned AS (
  SELECT
    decided.*,
    CASE
      WHEN activeConclusionCount > 0 AND eligiblePriceCount > 1
        THEN ARRAY('CONFLICTING_ELIGIBLE_ACTIVE_PRICES')
      WHEN availabilityStatusValue = 'CONFLICT'
        THEN ARRAY('CONFLICTING_FRESH_EXACT_EVIDENCE')
      WHEN availabilityStatusValue = 'FOR_SALE' AND eligiblePriceCount = 1
        THEN ARRAY('ACTIVE_LISTING_PRICE_AVAILABLE')
      WHEN availabilityStatusValue = 'FOR_SALE'
        THEN ARRAY('ACTIVE_LISTING_PRICE_UNAVAILABLE')
      WHEN availabilityStatusValue = 'NOT_FOR_SALE'
        THEN ARRAY('AUTHORITATIVE_COMPLETE_NEGATIVE')
      WHEN ambiguousAddressCount > 0
        THEN ARRAY('ADDRESS_AMBIGUOUS')
      WHEN nonExactAddressCount > 0
        THEN ARRAY('NON_EXACT_MATCH')
      WHEN authenticationFailureCount > 0
        THEN ARRAY('AUTH_FAILED')
      WHEN searchCandidateCount > 0
        THEN CONCAT(
          ARRAY('SEARCH_CANDIDATE_FOUND'),
          ARRAY(
            CASE
              WHEN rateLimitedFailureCount > 0 THEN 'RATE_LIMITED'
              WHEN rentcastLookupFailedCount > 0 THEN 'PROVIDER_LOOKUP_FAILED'
              WHEN staleEvidenceCount > 0 THEN 'STALE_EVIDENCE'
              WHEN unknownStatusCount > 0 THEN 'LISTING_STATUS_UNKNOWN'
              WHEN unsupportedStatusCount > 0 THEN 'UNSUPPORTED_STATUS'
              ELSE 'NO_PROVIDER_MATCH'
            END
          )
        )
      WHEN rateLimitedFailureCount > 0
        THEN ARRAY('RATE_LIMITED')
      WHEN rentcastLookupFailedCount > 0
        THEN ARRAY('PROVIDER_LOOKUP_FAILED')
      WHEN staleEvidenceCount > 0
        THEN ARRAY('STALE_EVIDENCE')
      WHEN unknownStatusCount > 0
        THEN ARRAY('LISTING_STATUS_UNKNOWN')
      WHEN unsupportedStatusCount > 0
        THEN ARRAY('UNSUPPORTED_STATUS')
      WHEN anyLookupFailedCount > 0
        THEN ARRAY('PROVIDER_LOOKUP_FAILED')
      WHEN rentcastListingFoundCount = 0
        THEN ARRAY('NO_PROVIDER_MATCH')
      ELSE ARRAY('NO_PROVIDER_MATCH')
    END AS reasonCodesValue,
    CASE
      WHEN availabilityStatusValue = 'FOR_SALE' AND eligiblePriceCount = 1
      THEN CAST(
        ELEMENT_AT(SPLIT(ELEMENT_AT(eligiblePriceKeys, 1), ':'), 2)
        AS BIGINT
      )
      ELSE CAST(NULL AS BIGINT)
    END AS listPriceAmountMinorValue,
    CASE
      WHEN availabilityStatusValue = 'FOR_SALE' AND eligiblePriceCount = 1
      THEN ELEMENT_AT(SPLIT(ELEMENT_AT(eligiblePriceKeys, 1), ':'), 1)
      ELSE CAST(NULL AS STRING)
    END AS listPriceCurrencyValue
  FROM decided
),
identified AS (
  SELECT
    reasoned.*,
    SHA2(
      CONCAT_WS(
        '|',
        addressReference,
        COALESCE(propertyReference, ''),
        'sale-availability-policy-v2',
        DATE_FORMAT(windowStartAtValue, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
        DATE_FORMAT(windowEndAtValue, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
        CONCAT_WS(',', observationReferences)
      ),
      256
    ) AS assessmentIdentifierValue
  FROM reasoned
)
SELECT
  '1.1.0' AS model_version,
  assessmentIdentifierValue AS assessment_identifier,
  availabilityStatusValue AS availability_status,
  CASE
    WHEN availabilityStatusValue = 'FOR_SALE' THEN TRUE
    WHEN availabilityStatusValue = 'NOT_FOR_SALE' THEN FALSE
    ELSE CAST(NULL AS BOOLEAN)
  END AS is_for_sale,
  listPriceAmountMinorValue AS list_price_amount_minor,
  listPriceCurrencyValue AS list_price_currency,
  'sale-availability-policy-v2' AS policy_version,
  windowEndAtValue AS assessed_at,
  windowStartAtValue AS window_start_at,
  windowEndAtValue AS window_end_at,
  reasonCodesValue AS reason_codes,
  NAMED_STRUCT(
    'sale_availability_assessment_has_address',
    addressReference,
    'sale_availability_assessment_has_listing_observation',
    observationReferences,
    'sale_availability_assessment_has_property',
    propertyReference
  ) AS relationships
FROM identified
