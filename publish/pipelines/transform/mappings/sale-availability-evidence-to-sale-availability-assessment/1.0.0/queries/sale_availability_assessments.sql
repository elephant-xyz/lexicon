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
    ) AS nonActiveConclusionCount,
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
    ) AS authoritativeNegativeCount
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
    CASE
      WHEN
        activeConclusionCount > 0
        AND (
          nonActiveConclusionCount > 0
          OR authoritativeNegativeCount > 0
        )
        THEN 'CONFLICT'
      WHEN activeConclusionCount > 0 THEN 'FOR_SALE'
      WHEN authoritativeNegativeCount > 0 THEN 'NOT_FOR_SALE'
      ELSE 'UNKNOWN'
    END AS availabilityStatusValue
  FROM grouped
),
reasoned AS (
  SELECT
    classified.*,
    CASE
      WHEN availabilityStatusValue = 'CONFLICT'
        THEN ARRAY('CONFLICTING_FRESH_EXACT_EVIDENCE')
      WHEN availabilityStatusValue = 'FOR_SALE'
        THEN ARRAY('FRESH_EXACT_ACTIVE_LISTING')
      WHEN availabilityStatusValue = 'NOT_FOR_SALE'
        THEN ARRAY('AUTHORITATIVE_COMPLETE_NEGATIVE')
      WHEN nonActiveConclusionCount > 0
        THEN ARRAY('NON_ACTIVE_MARKET_STATUS')
      ELSE ARRAY('INSUFFICIENT_EVIDENCE')
    END AS reasonCodesValue
  FROM classified
),
identified AS (
  SELECT
    reasoned.*,
    SHA2(
      CONCAT_WS(
        '|',
        addressReference,
        COALESCE(propertyReference, ''),
        'sale-availability-policy-v1',
        DATE_FORMAT(windowStartAtValue, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
        DATE_FORMAT(windowEndAtValue, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
        CONCAT_WS(',', observationReferences)
      ),
      256
    ) AS assessmentIdentifierValue
  FROM reasoned
)
SELECT
  '1.0.0' AS model_version,
  assessmentIdentifierValue AS assessment_identifier,
  availabilityStatusValue AS availability_status,
  CASE
    WHEN availabilityStatusValue = 'FOR_SALE' THEN TRUE
    WHEN availabilityStatusValue = 'NOT_FOR_SALE' THEN FALSE
    ELSE CAST(NULL AS BOOLEAN)
  END AS is_for_sale,
  'sale-availability-policy-v1' AS policy_version,
  windowEndAtValue AS assessed_at,
  windowStartAtValue AS window_start_at,
  windowEndAtValue AS window_end_at,
  ARRAY_SORT(ARRAY_DISTINCT(reasonCodesValue)) AS reason_codes,
  NAMED_STRUCT(
    'sale_availability_assessment_has_address',
    addressReference,
    'sale_availability_assessment_has_listing_observation',
    observationReferences,
    'sale_availability_assessment_has_property',
    propertyReference
  ) AS relationships
FROM identified
