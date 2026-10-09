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
    ) AS incompatibleFreshExactCount,
    SUM(
      CASE
        WHEN exact_address_match_state = 'NON_EXACT' THEN 1
        ELSE 0
      END
    ) AS nonExactAddressCount,
    SUM(
      CASE
        WHEN exact_address_match_state = 'AMBIGUOUS' THEN 1
        ELSE 0
      END
    ) AS ambiguousAddressCount,
    SUM(
      CASE
        WHEN
          observation_outcome = 'LISTING_FOUND'
          AND freshness_state = 'STALE'
        THEN 1
        ELSE 0
      END
    ) AS staleEvidenceCount,
    SUM(
      CASE
        WHEN
          observation_outcome = 'LISTING_FOUND'
          AND market_status = 'UNKNOWN'
        THEN 1
        ELSE 0
      END
    ) AS unknownStatusCount,
    SUM(
      CASE
        WHEN source_status LIKE '%failure=EMPTY_WEB_RESULTS%' THEN 1
        ELSE 0
      END
    ) AS emptyResultCount,
    SUM(
      CASE
        WHEN
          source_status RLIKE
            'failure=PAGE_HTTP_(401|403|429)|failure=MISSING_PAGE_STATUS'
        THEN 1
        ELSE 0
      END
    ) AS blockedOrHttpErrorCount,
    SUM(
      CASE
        WHEN source_status LIKE '%failure=MALFORMED_FIRECRAWL_ENVELOPE%'
          THEN 1
        ELSE 0
      END
    ) AS malformedEnvelopeCount,
    SUM(
      CASE
        WHEN
          source_status RLIKE
            'failure=MISSING_RAW_HTML|failure=MISSING_RAW_DOCUMENT'
        THEN 1
        ELSE 0
      END
    ) AS missingContentCount,
    SUM(
      CASE
        WHEN source_status LIKE '%failure=FIRECRAWL_SUCCESS_FALSE%' THEN 1
        ELSE 0
      END
    ) AS providerFalseCount,
    SUM(
      CASE
        WHEN observation_outcome = 'LOOKUP_FAILED' THEN 1
        ELSE 0
      END
    ) AS anyLookupFailedCount
  FROM target_listing_observations
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
        AND incompatibleFreshExactCount > 0
        THEN 'CONFLICT'
      WHEN activeConclusionCount > 0 THEN 'FOR_SALE'
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
      WHEN blockedOrHttpErrorCount > 0
        THEN ARRAY('PAGE_BLOCKED_OR_HTTP_ERROR')
      WHEN malformedEnvelopeCount > 0
        THEN ARRAY('MALFORMED_PROVIDER_RESPONSE')
      WHEN missingContentCount > 0
        THEN ARRAY('PAGE_CONTENT_UNAVAILABLE')
      WHEN providerFalseCount > 0
        THEN ARRAY('PROVIDER_RESPONSE_FAILED')
      WHEN ambiguousAddressCount > 0
        THEN ARRAY('ADDRESS_AMBIGUOUS')
      WHEN nonExactAddressCount > 0
        THEN ARRAY('NON_EXACT_MATCH')
      WHEN staleEvidenceCount > 0
        THEN ARRAY('STALE_EVIDENCE')
      WHEN emptyResultCount > 0
        THEN ARRAY('NO_WEB_RESULTS')
      WHEN unknownStatusCount > 0
        THEN ARRAY('LISTING_STATUS_UNKNOWN')
      WHEN anyLookupFailedCount > 0
        THEN ARRAY('PROVIDER_LOOKUP_FAILED')
      ELSE ARRAY('NO_EXPLICIT_ACTIVE_SIGNAL')
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
        'sale-availability-firecrawl-policy-v1',
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
    ELSE CAST(NULL AS BOOLEAN)
  END AS is_for_sale,
  listPriceAmountMinorValue AS list_price_amount_minor,
  listPriceCurrencyValue AS list_price_currency,
  'sale-availability-firecrawl-policy-v1' AS policy_version,
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
