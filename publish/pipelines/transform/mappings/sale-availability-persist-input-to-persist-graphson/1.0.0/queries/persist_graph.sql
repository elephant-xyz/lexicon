-- One sale-availability run -> one Persist GraphSON v3 graph (contract sections 3-6).
-- Executable spec: build_graphson.py (normalize_address, build) and scale_build.py (parse_address_text).
-- Spark resolves lambdas one nesting level per analyzer pass and the engine keeps the default limit of
-- 100 passes, so values are recomputed inside one projection instead of chained through deep CTEs.
-- Every element_at is size-guarded inside CASE (ANSI is on).
-- Placeholder ids are UUIDv5(6f1d0c1e-5a1e-4b7a-9c55-5a1e5a1e5a1e, '|'-joined natural key); Persist replaces them with
-- content hashes, so they never affect persisted identity.
WITH request AS (
  SELECT
    address.canonical AS canonical,
    address.structured AS structured,
    independentPropertyReference AS property_ref
  FROM source_request_address
),
-- Rule 4a: 'street [unit], city, ST zip' from the canonical text (used only without structured fields).
text_segments AS (
  SELECT
    structured,
    CASE WHEN size(filter(split(regexp_replace(canonical, '^\\s+|\\s+$', ''), '\\s*,\\s*'), x -> x <> '')) >= 3 THEN element_at(filter(split(regexp_replace(canonical, '^\\s+|\\s+$', ''), '\\s*,\\s*'), x -> x <> ''), -1) END AS state_zip,
    CASE WHEN size(filter(split(regexp_replace(canonical, '^\\s+|\\s+$', ''), '\\s*,\\s*'), x -> x <> '')) >= 3 THEN element_at(filter(split(regexp_replace(canonical, '^\\s+|\\s+$', ''), '\\s*,\\s*'), x -> x <> ''), -2) END AS city_text,
    CASE WHEN size(filter(split(regexp_replace(canonical, '^\\s+|\\s+$', ''), '\\s*,\\s*'), x -> x <> '')) >= 3 THEN array_join(slice(filter(split(regexp_replace(canonical, '^\\s+|\\s+$', ''), '\\s*,\\s*'), x -> x <> ''), 1, size(filter(split(regexp_replace(canonical, '^\\s+|\\s+$', ''), '\\s*,\\s*'), x -> x <> '')) - 2), ' ') END AS street_text
  FROM request
),
-- Structured fields win; parsed=false means rule 4a could not split the text.
raw_address AS (
  SELECT
    structured IS NOT NULL OR coalesce(state_zip RLIKE '^([A-Za-z]{2})(?:\\s+([0-9]{5}(?:-[0-9]{4})?))?$', false) AS parsed,
    CASE
      WHEN structured IS NOT NULL THEN structured.street
      WHEN NOT coalesce(state_zip RLIKE '^([A-Za-z]{2})(?:\\s+([0-9]{5}(?:-[0-9]{4})?))?$', false) THEN NULL
      WHEN coalesce(street_text RLIKE '(?i)^(.*?)\\s+((?:(?:APARTMENT|APT|BLDG|BSMT|DEPT|FL|FRNT|HNGR|LBBY|LOT|LOWR|OFC|PH|PIER|REAR|RM|SIDE|SLIP|SPC|STE|STOP|SUITE|TRLR|UNIT|UPPR)\\.?\\s*#?\\s*|#\\s*)[A-Za-z0-9-]+)$', false) THEN regexp_replace(regexp_extract(street_text, '(?i)^(.*?)\\s+((?:(?:APARTMENT|APT|BLDG|BSMT|DEPT|FL|FRNT|HNGR|LBBY|LOT|LOWR|OFC|PH|PIER|REAR|RM|SIDE|SLIP|SPC|STE|STOP|SUITE|TRLR|UNIT|UPPR)\\.?\\s*#?\\s*|#\\s*)[A-Za-z0-9-]+)$', 1), '^\\s+|\\s+$', '')
      WHEN coalesce(street_text RLIKE '^\\S+(?:\\s+\\S+)+\\s+(\\S+)\\s+([0-9]+[A-Za-z]?)$' AND array_contains(array(
          'ALLEY', 'ALY', 'ANX', 'ARC', 'AV', 'AVE', 'AVENUE', 'BCH', 'BG', 'BGS', 'BLF', 'BLFS', 'BLVD', 'BND',
          'BOULEVARD', 'BR', 'BRG', 'BRK', 'BRKS', 'BTM', 'BYP', 'BYU', 'CIR', 'CIRCLE', 'CIRS', 'CLB', 'CLF',
          'CLFS', 'CMN', 'CMNS', 'COR', 'CORS', 'COURT', 'CP', 'CPE', 'CRES', 'CRK', 'CRSE', 'CRST', 'CSWY', 'CT',
          'CTR', 'CTRS', 'CTS', 'CURV', 'CV', 'CVS', 'CYN', 'DL', 'DM', 'DR', 'DRIVE', 'DRS', 'DV', 'EST', 'ESTS',
          'EXPY', 'EXT', 'EXTS', 'FALL', 'FLD', 'FLDS', 'FLS', 'FLT', 'FLTS', 'FRD', 'FRDS', 'FRG', 'FRGS', 'FRK',
          'FRKS', 'FRST', 'FRY', 'FT', 'FWY', 'GDN', 'GDNS', 'GLN', 'GLNS', 'GRN', 'GRNS', 'GRV', 'GRVS', 'GTWY',
          'HBR', 'HBRS', 'HIGHWAY', 'HL', 'HLS', 'HOLW', 'HTS', 'HVN', 'HWY', 'INLT', 'IS', 'ISLE', 'ISS', 'JCT',
          'JCTS', 'KNL', 'KNLS', 'KY', 'KYS', 'LAND', 'LANE', 'LCK', 'LCKS', 'LDG', 'LF', 'LGT', 'LGTS', 'LK',
          'LKS', 'LN', 'LNDG', 'LOOP', 'MALL', 'MDW', 'MDWS', 'MEWS', 'ML', 'MLS', 'MNR', 'MNRS', 'MSN', 'MT',
          'MTN', 'MTNS', 'MTWY', 'NCK', 'OPAS', 'ORCH', 'OVAL', 'PARK', 'PARKWAY', 'PASS', 'PATH', 'PIKE', 'PKWY',
          'PL', 'PLACE', 'PLN', 'PLNS', 'PLZ', 'PNE', 'PNES', 'PR', 'PRT', 'PRTS', 'PT', 'PTS', 'RADL', 'RAMP',
          'RD', 'RDG', 'RDGS', 'RDS', 'RIV', 'RNCH', 'ROAD', 'ROW', 'RPD', 'RPDS', 'RST', 'RTE', 'RUE', 'RUN',
          'SHL', 'SHLS', 'SHR', 'SHRS', 'SKWY', 'SMT', 'SPG', 'SPGS', 'SPUR', 'SQ', 'SQS', 'SQUARE', 'ST', 'STA',
          'STRA', 'STREET', 'STRM', 'STS', 'TER', 'TERRACE', 'TPKE', 'TRAIL', 'TRAK', 'TRCE', 'TRFY', 'TRL',
          'TRLR', 'TRWY', 'TUNL', 'UN', 'UNS', 'UPAS', 'VIA', 'VIS', 'VL', 'VLG', 'VLGS', 'VLY', 'VLYS', 'VW',
          'VWS', 'WALK', 'WALL', 'WAY', 'WAYS', 'WL', 'WLS', 'XING', 'XRD', 'XRDS'
        ), regexp_replace(upper(regexp_extract(street_text, '^\\S+(?:\\s+\\S+)+\\s+(\\S+)\\s+([0-9]+[A-Za-z]?)$', 1)), '\\.+$', '')), false) THEN regexp_replace(street_text, '\\s+\\S+$', '')
      ELSE street_text
    END AS street,
    CASE
      WHEN structured IS NOT NULL THEN structured.unit
      WHEN NOT coalesce(state_zip RLIKE '^([A-Za-z]{2})(?:\\s+([0-9]{5}(?:-[0-9]{4})?))?$', false) THEN NULL
      WHEN coalesce(street_text RLIKE '(?i)^(.*?)\\s+((?:(?:APARTMENT|APT|BLDG|BSMT|DEPT|FL|FRNT|HNGR|LBBY|LOT|LOWR|OFC|PH|PIER|REAR|RM|SIDE|SLIP|SPC|STE|STOP|SUITE|TRLR|UNIT|UPPR)\\.?\\s*#?\\s*|#\\s*)[A-Za-z0-9-]+)$', false) THEN regexp_replace(regexp_replace(
        regexp_replace(regexp_extract(street_text, '(?i)^(.*?)\\s+((?:(?:APARTMENT|APT|BLDG|BSMT|DEPT|FL|FRNT|HNGR|LBBY|LOT|LOWR|OFC|PH|PIER|REAR|RM|SIDE|SLIP|SPC|STE|STOP|SUITE|TRLR|UNIT|UPPR)\\.?\\s*#?\\s*|#\\s*)[A-Za-z0-9-]+)$', 2), '^\\s+|\\s+$', ''),
        '(?i)^APARTMENT\\b', 'APT'), '(?i)^SUITE\\b', 'STE')
      WHEN coalesce(street_text RLIKE '^\\S+(?:\\s+\\S+)+\\s+(\\S+)\\s+([0-9]+[A-Za-z]?)$' AND array_contains(array(
          'ALLEY', 'ALY', 'ANX', 'ARC', 'AV', 'AVE', 'AVENUE', 'BCH', 'BG', 'BGS', 'BLF', 'BLFS', 'BLVD', 'BND',
          'BOULEVARD', 'BR', 'BRG', 'BRK', 'BRKS', 'BTM', 'BYP', 'BYU', 'CIR', 'CIRCLE', 'CIRS', 'CLB', 'CLF',
          'CLFS', 'CMN', 'CMNS', 'COR', 'CORS', 'COURT', 'CP', 'CPE', 'CRES', 'CRK', 'CRSE', 'CRST', 'CSWY', 'CT',
          'CTR', 'CTRS', 'CTS', 'CURV', 'CV', 'CVS', 'CYN', 'DL', 'DM', 'DR', 'DRIVE', 'DRS', 'DV', 'EST', 'ESTS',
          'EXPY', 'EXT', 'EXTS', 'FALL', 'FLD', 'FLDS', 'FLS', 'FLT', 'FLTS', 'FRD', 'FRDS', 'FRG', 'FRGS', 'FRK',
          'FRKS', 'FRST', 'FRY', 'FT', 'FWY', 'GDN', 'GDNS', 'GLN', 'GLNS', 'GRN', 'GRNS', 'GRV', 'GRVS', 'GTWY',
          'HBR', 'HBRS', 'HIGHWAY', 'HL', 'HLS', 'HOLW', 'HTS', 'HVN', 'HWY', 'INLT', 'IS', 'ISLE', 'ISS', 'JCT',
          'JCTS', 'KNL', 'KNLS', 'KY', 'KYS', 'LAND', 'LANE', 'LCK', 'LCKS', 'LDG', 'LF', 'LGT', 'LGTS', 'LK',
          'LKS', 'LN', 'LNDG', 'LOOP', 'MALL', 'MDW', 'MDWS', 'MEWS', 'ML', 'MLS', 'MNR', 'MNRS', 'MSN', 'MT',
          'MTN', 'MTNS', 'MTWY', 'NCK', 'OPAS', 'ORCH', 'OVAL', 'PARK', 'PARKWAY', 'PASS', 'PATH', 'PIKE', 'PKWY',
          'PL', 'PLACE', 'PLN', 'PLNS', 'PLZ', 'PNE', 'PNES', 'PR', 'PRT', 'PRTS', 'PT', 'PTS', 'RADL', 'RAMP',
          'RD', 'RDG', 'RDGS', 'RDS', 'RIV', 'RNCH', 'ROAD', 'ROW', 'RPD', 'RPDS', 'RST', 'RTE', 'RUE', 'RUN',
          'SHL', 'SHLS', 'SHR', 'SHRS', 'SKWY', 'SMT', 'SPG', 'SPGS', 'SPUR', 'SQ', 'SQS', 'SQUARE', 'ST', 'STA',
          'STRA', 'STREET', 'STRM', 'STS', 'TER', 'TERRACE', 'TPKE', 'TRAIL', 'TRAK', 'TRCE', 'TRFY', 'TRL',
          'TRLR', 'TRWY', 'TUNL', 'UN', 'UNS', 'UPAS', 'VIA', 'VIS', 'VL', 'VLG', 'VLGS', 'VLY', 'VLYS', 'VW',
          'VWS', 'WALK', 'WALL', 'WAY', 'WAYS', 'WL', 'WLS', 'XING', 'XRD', 'XRDS'
        ), regexp_replace(upper(regexp_extract(street_text, '^\\S+(?:\\s+\\S+)+\\s+(\\S+)\\s+([0-9]+[A-Za-z]?)$', 1)), '\\.+$', '')), false) THEN regexp_extract(street_text, '^\\S+(?:\\s+\\S+)+\\s+(\\S+)\\s+([0-9]+[A-Za-z]?)$', 2)
    END AS unit,
    CASE WHEN structured IS NOT NULL THEN structured.city WHEN coalesce(state_zip RLIKE '^([A-Za-z]{2})(?:\\s+([0-9]{5}(?:-[0-9]{4})?))?$', false) THEN city_text END AS city,
    CASE
      WHEN structured IS NOT NULL THEN structured.state
      WHEN coalesce(state_zip RLIKE '^([A-Za-z]{2})(?:\\s+([0-9]{5}(?:-[0-9]{4})?))?$', false) THEN regexp_extract(state_zip, '^([A-Za-z]{2})(?:\\s+([0-9]{5}(?:-[0-9]{4})?))?$', 1)
    END AS state,
    CASE
      WHEN structured IS NOT NULL THEN structured.postalCode
      WHEN coalesce(state_zip RLIKE '^([A-Za-z]{2})(?:\\s+([0-9]{5}(?:-[0-9]{4})?))?$', false) THEN regexp_extract(state_zip, '^([A-Za-z]{2})(?:\\s+([0-9]{5}(?:-[0-9]{4})?))?$', 2)
    END AS postal
  FROM text_segments
),
-- Rules 1-6 (normalize_address) over the single-spaced street.
address_text AS (
  SELECT
    parsed,
    trim(regexp_replace(regexp_replace(coalesce(street, ''), ',', ' '), '\\s+', ' ')) AS street_text,
    regexp_replace(coalesce(unit, ''), '^\\s+|\\s+$', '') AS unit_text,
    array_join(transform(filter(split(coalesce(city, ''), '\\s+'), x -> x <> ''), x -> CASE WHEN x RLIKE '(?i)^[0-9]+(ST|ND|RD|TH)$' THEN lower(x) WHEN x RLIKE '[0-9]' THEN upper(x) ELSE concat(upper(substr(x, 1, 1)), lower(substr(x, 2))) END), ' ')
      AS city_name,
    upper(regexp_replace(coalesce(state, ''), '^\\s+|\\s+$', '')) AS state_code,
    regexp_replace(coalesce(postal, ''), '^\\s+|\\s+$', '') AS postal_text
  FROM raw_address
),
address_tokens AS (
  SELECT
    parsed AND street_text RLIKE '^[0-9]+ \\S' AS numbered,
    regexp_extract(street_text, '^([0-9]+) (?:(?i:(N|NE|E|SE|S|SW|W|NW)) (?=\\S))?(.+?)(?: (?i:(N|NE|E|SE|S|SW|W|NW)))?$', 1) AS sequence_number,
    nullif(upper(regexp_extract(street_text, '^([0-9]+) (?:(?i:(N|NE|E|SE|S|SW|W|NW)) (?=\\S))?(.+?)(?: (?i:(N|NE|E|SE|S|SW|W|NW)))?$', 2)), '') AS street_pre_directional_text,
    regexp_extract(street_text, '^([0-9]+) (?:(?i:(N|NE|E|SE|S|SW|W|NW)) (?=\\S))?(.+?)(?: (?i:(N|NE|E|SE|S|SW|W|NW)))?$', 3) AS street_middle,
    nullif(upper(regexp_extract(street_text, '^([0-9]+) (?:(?i:(N|NE|E|SE|S|SW|W|NW)) (?=\\S))?(.+?)(?: (?i:(N|NE|E|SE|S|SW|W|NW)))?$', 4)), '') AS street_post_directional_text,
    unit_text,
    city_name,
    state_code,
    postal_text
  FROM address_text
),
address_suffix AS (
  SELECT
    *,
    CASE WHEN street_middle LIKE '% %' THEN CASE regexp_replace(upper(regexp_extract(street_middle, ' (\\S+)$', 1)), '\\.+$', '') WHEN 'ALLEY' THEN 'ALY' WHEN 'AVENUE' THEN 'AVE' WHEN 'AV' THEN 'AVE' WHEN 'BOULEVARD' THEN 'BLVD' WHEN 'CIRCLE' THEN 'CIR' WHEN 'COURT' THEN 'CT' WHEN 'DRIVE' THEN 'DR' WHEN 'HIGHWAY' THEN 'HWY' WHEN 'LANE' THEN 'LN' WHEN 'PARKWAY' THEN 'PKWY' WHEN 'PLACE' THEN 'PL' WHEN 'ROAD' THEN 'RD' WHEN 'SQUARE' THEN 'SQ' WHEN 'STREET' THEN 'ST' WHEN 'TERRACE' THEN 'TER' WHEN 'TRAIL' THEN 'TRL' WHEN 'WAY' THEN 'WAY'
        ELSE CASE WHEN array_contains(array(
          'ALY', 'ANX', 'ARC', 'AVE', 'BCH', 'BG', 'BGS', 'BLF', 'BLFS', 'BLVD', 'BND', 'BR', 'BRG', 'BRK', 'BRKS',
          'BTM', 'BYP', 'BYU', 'CIR', 'CIRS', 'CLB', 'CLF', 'CLFS', 'CMN', 'CMNS', 'COR', 'CORS', 'CP', 'CPE',
          'CRES', 'CRK', 'CRSE', 'CRST', 'CSWY', 'CT', 'CTR', 'CTRS', 'CTS', 'CURV', 'CV', 'CVS', 'CYN', 'DL',
          'DM', 'DR', 'DRS', 'DV', 'EST', 'ESTS', 'EXPY', 'EXT', 'EXTS', 'FALL', 'FLD', 'FLDS', 'FLS', 'FLT',
          'FLTS', 'FRD', 'FRDS', 'FRG', 'FRGS', 'FRK', 'FRKS', 'FRST', 'FRY', 'FT', 'FWY', 'GDN', 'GDNS', 'GLN',
          'GLNS', 'GRN', 'GRNS', 'GRV', 'GRVS', 'GTWY', 'HBR', 'HBRS', 'HL', 'HLS', 'HOLW', 'HTS', 'HVN', 'HWY',
          'INLT', 'IS', 'ISLE', 'ISS', 'JCT', 'JCTS', 'KNL', 'KNLS', 'KY', 'KYS', 'LAND', 'LCK', 'LCKS', 'LDG',
          'LF', 'LGT', 'LGTS', 'LK', 'LKS', 'LN', 'LNDG', 'LOOP', 'MALL', 'MDW', 'MDWS', 'MEWS', 'ML', 'MLS',
          'MNR', 'MNRS', 'MSN', 'MT', 'MTN', 'MTNS', 'MTWY', 'NCK', 'OPAS', 'ORCH', 'OVAL', 'PARK', 'PASS', 'PATH',
          'PIKE', 'PKWY', 'PL', 'PLN', 'PLNS', 'PLZ', 'PNE', 'PNES', 'PR', 'PRT', 'PRTS', 'PT', 'PTS', 'RADL',
          'RAMP', 'RD', 'RDG', 'RDGS', 'RDS', 'RIV', 'RNCH', 'ROW', 'RPD', 'RPDS', 'RST', 'RTE', 'RUE', 'RUN',
          'SHL', 'SHLS', 'SHR', 'SHRS', 'SKWY', 'SMT', 'SPG', 'SPGS', 'SPUR', 'SQ', 'SQS', 'ST', 'STA', 'STRA',
          'STRM', 'STS', 'TER', 'TPKE', 'TRAK', 'TRCE', 'TRFY', 'TRL', 'TRLR', 'TRWY', 'TUNL', 'UN', 'UNS', 'UPAS',
          'VIA', 'VIS', 'VL', 'VLG', 'VLGS', 'VLY', 'VLYS', 'VW', 'VWS', 'WALK', 'WALL', 'WAY', 'WAYS', 'WL',
          'WLS', 'XING', 'XRD', 'XRDS'
        ), regexp_replace(upper(regexp_extract(street_middle, ' (\\S+)$', 1)), '\\.+$', '')) THEN regexp_replace(upper(regexp_extract(street_middle, ' (\\S+)$', 1)), '\\.+$', '') END END
    END AS street_suffix_type
  FROM address_tokens
),
address AS (
  SELECT
    named_struct(
      'address_status', CASE
        WHEN numbered AND array_join(transform(split(CASE WHEN street_suffix_type IS NOT NULL THEN regexp_replace(street_middle, ' \\S+$', '') ELSE street_middle END, ' '), x -> CASE WHEN x RLIKE '(?i)^[0-9]+(ST|ND|RD|TH)$' THEN lower(x) WHEN x RLIKE '[0-9]' THEN upper(x) ELSE concat(upper(substr(x, 1, 1)), lower(substr(x, 2))) END), ' ') <> '' AND city_name <> '' AND state_code RLIKE '^[A-Z]{2}$'
        THEN 'NORMALIZED' ELSE 'UNPARSEABLE'
      END,
      -- Sorted by key: the natural key is Python json.dumps(props, sort_keys=True).
      'props', filter(array(
        named_struct('k', 'address_unit_designator_type', 'v', CASE WHEN unit_text RLIKE '\\s' AND array_contains(array('APT', 'BLDG', 'BSMT', 'DEPT', 'FL', 'FRNT', 'HNGR', 'LBBY', 'LOT', 'LOWR', 'OFC', 'PH', 'PIER', 'REAR',
        'RM', 'SIDE', 'SLIP', 'SPC', 'STE', 'STOP', 'TRLR', 'UNIT', 'UPPR'),
        upper(regexp_extract(unit_text, '^(\\S+)', 1))) THEN upper(regexp_extract(unit_text, '^(\\S+)', 1)) END),
        named_struct('k', 'city_name', 'v', city_name),
        named_struct('k', 'country_code', 'v', 'US'),
        named_struct('k', 'plus_four_postal_code', 'v',
          CASE WHEN postal_text RLIKE '^[0-9]{5}-[0-9]{4}$' THEN substr(postal_text, 7, 4) END),
        named_struct('k', 'postal_code', 'v',
          CASE WHEN postal_text RLIKE '^[0-9]{5}(-[0-9]{4})?$' THEN substr(postal_text, 1, 5) END),
        named_struct('k', 'sequence_number', 'v', CASE WHEN numbered THEN sequence_number END),
        named_struct('k', 'state_code', 'v', state_code),
        named_struct('k', 'street_name', 'v', array_join(transform(split(CASE WHEN street_suffix_type IS NOT NULL THEN regexp_replace(street_middle, ' \\S+$', '') ELSE street_middle END, ' '), x -> CASE WHEN x RLIKE '(?i)^[0-9]+(ST|ND|RD|TH)$' THEN lower(x) WHEN x RLIKE '[0-9]' THEN upper(x) ELSE concat(upper(substr(x, 1, 1)), lower(substr(x, 2))) END), ' ')),
        named_struct('k', 'street_post_directional_text', 'v', street_post_directional_text),
        named_struct('k', 'street_pre_directional_text', 'v', street_pre_directional_text),
        named_struct('k', 'street_suffix_type', 'v', street_suffix_type),
        named_struct('k', 'unit_identifier', 'v', CASE
          WHEN unit_text = '' THEN NULL
          WHEN unit_text RLIKE '\\s' AND (regexp_extract(unit_text, '^(\\S+)', 1) = '#' OR (CASE WHEN unit_text RLIKE '\\s' AND array_contains(array('APT', 'BLDG', 'BSMT', 'DEPT', 'FL', 'FRNT', 'HNGR', 'LBBY', 'LOT', 'LOWR', 'OFC', 'PH', 'PIER', 'REAR',
        'RM', 'SIDE', 'SLIP', 'SPC', 'STE', 'STOP', 'TRLR', 'UNIT', 'UPPR'),
        upper(regexp_extract(unit_text, '^(\\S+)', 1))) THEN upper(regexp_extract(unit_text, '^(\\S+)', 1)) END) IS NOT NULL)
          THEN regexp_replace(regexp_extract(unit_text, '(?s)^\\S+\\s+(.*)$', 1), '^\\s+|\\s+$', '')
          ELSE regexp_replace(regexp_replace(unit_text, '^#+', ''), '^\\s+|\\s+$', '')
        END)
      ), x -> x.v IS NOT NULL)
    ) AS normalized
  FROM address_suffix
),
-- One row per non-null vertex property with its GraphSON value; k1-k3 order the vertices.
vertex_properties AS (
  SELECT 'address' AS label, concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}') AS natural_key, 0 AS k1, '' AS k2, 0 AS k3,
    entry.k AS pkey, CASE WHEN entry.v IS NOT NULL THEN substr(to_json(array(entry.v)), 2, length(to_json(array(entry.v))) - 2) END AS value_json
  FROM address LATERAL VIEW explode(normalized.props) p AS entry
  UNION ALL
  SELECT 'listing_observation', observation_identifier, 1, observation_identifier, 0, entry.k, entry.v
  FROM source_listing_observations LATERAL VIEW explode(array(
    named_struct('k', 'model_version', 'v', CASE WHEN model_version IS NOT NULL THEN substr(to_json(array(model_version)), 2, length(to_json(array(model_version))) - 2) END),
    named_struct('k', 'observation_identifier', 'v', CASE WHEN observation_identifier IS NOT NULL THEN substr(to_json(array(observation_identifier)), 2, length(to_json(array(observation_identifier))) - 2) END),
    named_struct('k', 'provider_identifier', 'v', CASE WHEN provider_identifier IS NOT NULL THEN substr(to_json(array(provider_identifier)), 2, length(to_json(array(provider_identifier))) - 2) END),
    named_struct('k', 'source_request_identifier', 'v', CASE WHEN source_request_identifier IS NOT NULL THEN substr(to_json(array(source_request_identifier)), 2, length(to_json(array(source_request_identifier))) - 2) END),
    named_struct('k', 'source_listing_identifier', 'v', CASE WHEN source_listing_identifier IS NOT NULL THEN substr(to_json(array(source_listing_identifier)), 2, length(to_json(array(source_listing_identifier))) - 2) END),
    named_struct('k', 'source_url', 'v', CASE WHEN source_url IS NOT NULL THEN substr(to_json(array(source_url)), 2, length(to_json(array(source_url))) - 2) END),
    named_struct('k', 'source_as_of', 'v', CASE WHEN date_format(source_as_of, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'") IS NOT NULL THEN substr(to_json(array(date_format(source_as_of, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"))), 2, length(to_json(array(date_format(source_as_of, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")))) - 2) END),
    named_struct('k', 'source_status', 'v', CASE WHEN source_status IS NOT NULL THEN substr(to_json(array(source_status)), 2, length(to_json(array(source_status))) - 2) END),
    named_struct('k', 'retrieved_at', 'v', CASE WHEN date_format(retrieved_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'") IS NOT NULL THEN substr(to_json(array(date_format(retrieved_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"))), 2, length(to_json(array(date_format(retrieved_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")))) - 2) END),
    named_struct('k', 'observation_outcome', 'v', CASE WHEN observation_outcome IS NOT NULL THEN substr(to_json(array(observation_outcome)), 2, length(to_json(array(observation_outcome))) - 2) END),
    named_struct('k', 'market_status', 'v', CASE WHEN market_status IS NOT NULL THEN substr(to_json(array(market_status)), 2, length(to_json(array(market_status))) - 2) END),
    named_struct('k', 'asking_price_amount_minor', 'v', concat('{"@type":"g:Int64","@value":', cast(asking_price_amount_minor AS STRING), '}')),
    named_struct('k', 'asking_price_currency', 'v', CASE WHEN asking_price_currency IS NOT NULL THEN substr(to_json(array(asking_price_currency)), 2, length(to_json(array(asking_price_currency))) - 2) END),
    named_struct('k', 'price_parse_status', 'v', CASE WHEN price_parse_status IS NOT NULL THEN substr(to_json(array(price_parse_status)), 2, length(to_json(array(price_parse_status))) - 2) END),
    named_struct('k', 'evidence_artifact_uri', 'v', CASE WHEN evidence_artifact_uri IS NOT NULL THEN substr(to_json(array(evidence_artifact_uri)), 2, length(to_json(array(evidence_artifact_uri))) - 2) END),
    named_struct('k', 'evidence_artifact_sha256', 'v', CASE WHEN evidence_artifact_sha256 IS NOT NULL THEN substr(to_json(array(evidence_artifact_sha256)), 2, length(to_json(array(evidence_artifact_sha256))) - 2) END),
    named_struct('k', 'exact_address_match_state', 'v', CASE WHEN exact_address_match_state IS NOT NULL THEN substr(to_json(array(exact_address_match_state)), 2, length(to_json(array(exact_address_match_state))) - 2) END),
    named_struct('k', 'freshness_state', 'v', CASE WHEN freshness_state IS NOT NULL THEN substr(to_json(array(freshness_state)), 2, length(to_json(array(freshness_state))) - 2) END),
    named_struct('k', 'freshness_evaluated_at', 'v', CASE WHEN date_format(freshness_evaluated_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'") IS NOT NULL THEN substr(to_json(array(date_format(freshness_evaluated_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"))), 2, length(to_json(array(date_format(freshness_evaluated_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")))) - 2) END),
    named_struct('k', 'freshness_policy_version', 'v', CASE WHEN freshness_policy_version IS NOT NULL THEN substr(to_json(array(freshness_policy_version)), 2, length(to_json(array(freshness_policy_version))) - 2) END),
    named_struct('k', 'coverage_state', 'v', CASE WHEN coverage_state IS NOT NULL THEN substr(to_json(array(coverage_state)), 2, length(to_json(array(coverage_state))) - 2) END),
    named_struct('k', 'authority_state', 'v', CASE WHEN authority_state IS NOT NULL THEN substr(to_json(array(authority_state)), 2, length(to_json(array(authority_state))) - 2) END)
  )) p AS entry
  WHERE entry.v IS NOT NULL
  UNION ALL
  SELECT 'file', file_uri, 1, first_seen.observation, first_seen.position + 1, 'original_url', CASE WHEN file_uri IS NOT NULL THEN substr(to_json(array(file_uri)), 2, length(to_json(array(file_uri))) - 2) END
  FROM (
    SELECT file_uri, min(named_struct('observation', observation_identifier, 'position', file_position)) AS first_seen
    FROM source_listing_observations
    LATERAL VIEW posexplode(relationships.listing_observation_has_file) files AS file_position, file_uri
    GROUP BY file_uri
  ) first_file_occurrence
  UNION ALL
  SELECT 'sale_availability_assessment', assessment_identifier, 2, '', 0, entry.k, entry.v
  FROM source_sale_availability_assessments LATERAL VIEW explode(array(
    named_struct('k', 'model_version', 'v', CASE WHEN model_version IS NOT NULL THEN substr(to_json(array(model_version)), 2, length(to_json(array(model_version))) - 2) END),
    named_struct('k', 'assessment_identifier', 'v', CASE WHEN assessment_identifier IS NOT NULL THEN substr(to_json(array(assessment_identifier)), 2, length(to_json(array(assessment_identifier))) - 2) END),
    named_struct('k', 'availability_status', 'v', CASE WHEN availability_status IS NOT NULL THEN substr(to_json(array(availability_status)), 2, length(to_json(array(availability_status))) - 2) END),
    named_struct('k', 'is_for_sale', 'v', CASE WHEN is_for_sale THEN 'true' WHEN NOT is_for_sale THEN 'false' END),
    named_struct('k', 'list_price_amount_minor', 'v', concat('{"@type":"g:Int64","@value":', cast(list_price_amount_minor AS STRING), '}')),
    named_struct('k', 'list_price_currency', 'v', CASE WHEN list_price_currency IS NOT NULL THEN substr(to_json(array(list_price_currency)), 2, length(to_json(array(list_price_currency))) - 2) END),
    named_struct('k', 'policy_version', 'v', CASE WHEN policy_version IS NOT NULL THEN substr(to_json(array(policy_version)), 2, length(to_json(array(policy_version))) - 2) END),
    named_struct('k', 'assessed_at', 'v', CASE WHEN date_format(assessed_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'") IS NOT NULL THEN substr(to_json(array(date_format(assessed_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"))), 2, length(to_json(array(date_format(assessed_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")))) - 2) END),
    named_struct('k', 'window_start_at', 'v', CASE WHEN date_format(window_start_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'") IS NOT NULL THEN substr(to_json(array(date_format(window_start_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"))), 2, length(to_json(array(date_format(window_start_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")))) - 2) END),
    named_struct('k', 'window_end_at', 'v', CASE WHEN date_format(window_end_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'") IS NOT NULL THEN substr(to_json(array(date_format(window_end_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"))), 2, length(to_json(array(date_format(window_end_at, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")))) - 2) END),
    named_struct('k', 'reason_codes', 'v', CASE WHEN size(reason_codes) > 0 THEN concat('{"@type":"g:List","@value":', to_json(reason_codes), '}') END)
  )) p AS entry
  WHERE entry.v IS NOT NULL
),
vertex_property_json AS (
  SELECT label, natural_key, k1, k2, k3, pkey, concat('{"@type":"g:VertexProperty","@value":{"id":{"@type":"g:UUID","@value":"', concat(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key, '|', pkey), 'UTF-8'))), 1, 8), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key, '|', pkey), 'UTF-8'))), 9, 4), '-5', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key, '|', pkey), 'UTF-8'))), 14, 3), '-', lower(conv(cast((cast(conv(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key, '|', pkey), 'UTF-8'))), 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key, '|', pkey), 'UTF-8'))), 18, 3), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key, '|', pkey), 'UTF-8'))), 21, 12)), '"},"label":"', pkey, '","value":', value_json, '}}') AS property_json
  FROM vertex_properties
),
vertex_json AS (
  SELECT k1, k2, k3, concat('{"@type":"g:Vertex","@value":{"id":{"@type":"g:UUID","@value":"', concat(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key), 'UTF-8'))), 1, 8), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key), 'UTF-8'))), 9, 4), '-5', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key), 'UTF-8'))), 14, 3), '-', lower(conv(cast((cast(conv(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key), 'UTF-8'))), 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key), 'UTF-8'))), 18, 3), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', natural_key), 'UTF-8'))), 21, 12)), '"},"label":"', label, '","properties":{', array_join(transform(array_sort(collect_list(named_struct('pkey', pkey, 'json', property_json))), x -> concat('"', x.pkey, '":[', x.json, ']')), ','), '}}}') AS json
  FROM vertex_property_json
  GROUP BY label, natural_key, k1, k2, k3
),
edge_endpoints AS (
  SELECT 'listing_observation_has_address' AS label, 'listing_observation' AS out_label, 'address' AS in_label,
    concat(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', o.observation_identifier), 'UTF-8'))), 1, 8), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', o.observation_identifier), 'UTF-8'))), 9, 4), '-5', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', o.observation_identifier), 'UTF-8'))), 14, 3), '-', lower(conv(cast((cast(conv(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', o.observation_identifier), 'UTF-8'))), 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', o.observation_identifier), 'UTF-8'))), 18, 3), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', o.observation_identifier), 'UTF-8'))), 21, 12)) AS out_id,
    concat(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 1, 8), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 9, 4), '-5', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 14, 3), '-', lower(conv(cast((cast(conv(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 18, 3), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 21, 12)) AS in_id,
    o.observation_identifier AS k2, 0 AS k3
  FROM source_listing_observations o CROSS JOIN address
  WHERE coalesce(o.relationships.listing_observation_has_address, '') <> ''
  UNION ALL
  SELECT 'listing_observation_has_file' AS label, 'listing_observation' AS out_label, 'file' AS in_label,
    concat(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_identifier), 'UTF-8'))), 1, 8), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_identifier), 'UTF-8'))), 9, 4), '-5', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_identifier), 'UTF-8'))), 14, 3), '-', lower(conv(cast((cast(conv(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_identifier), 'UTF-8'))), 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_identifier), 'UTF-8'))), 18, 3), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_identifier), 'UTF-8'))), 21, 12)) AS out_id,
    concat(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('file', '|', file_uri), 'UTF-8'))), 1, 8), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('file', '|', file_uri), 'UTF-8'))), 9, 4), '-5', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('file', '|', file_uri), 'UTF-8'))), 14, 3), '-', lower(conv(cast((cast(conv(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('file', '|', file_uri), 'UTF-8'))), 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('file', '|', file_uri), 'UTF-8'))), 18, 3), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('file', '|', file_uri), 'UTF-8'))), 21, 12)) AS in_id,
    observation_identifier AS k2, file_position + 1 AS k3
  FROM source_listing_observations
  LATERAL VIEW posexplode(relationships.listing_observation_has_file) files AS file_position, file_uri
  UNION ALL
  SELECT 'sale_availability_assessment_has_address' AS label, 'sale_availability_assessment' AS out_label, 'address' AS in_label,
    concat(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', s.assessment_identifier), 'UTF-8'))), 1, 8), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', s.assessment_identifier), 'UTF-8'))), 9, 4), '-5', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', s.assessment_identifier), 'UTF-8'))), 14, 3), '-', lower(conv(cast((cast(conv(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', s.assessment_identifier), 'UTF-8'))), 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', s.assessment_identifier), 'UTF-8'))), 18, 3), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', s.assessment_identifier), 'UTF-8'))), 21, 12)) AS out_id,
    concat(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 1, 8), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 9, 4), '-5', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 14, 3), '-', lower(conv(cast((cast(conv(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 18, 3), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('address', '|', concat('{', array_join(transform(normalized.props, x -> concat('"', x.k, '": ', CASE WHEN x.v IS NOT NULL THEN substr(to_json(array(x.v)), 2, length(to_json(array(x.v))) - 2) END)), ', '), '}')), 'UTF-8'))), 21, 12)) AS in_id,
    '' AS k2, 0 AS k3
  FROM source_sale_availability_assessments s CROSS JOIN address
  WHERE coalesce(s.relationships.sale_availability_assessment_has_address, '') <> ''
  UNION ALL
  SELECT 'sale_availability_assessment_has_listing_observation' AS label, 'sale_availability_assessment' AS out_label, 'listing_observation' AS in_label,
    concat(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', assessment_identifier), 'UTF-8'))), 1, 8), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', assessment_identifier), 'UTF-8'))), 9, 4), '-5', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', assessment_identifier), 'UTF-8'))), 14, 3), '-', lower(conv(cast((cast(conv(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', assessment_identifier), 'UTF-8'))), 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', assessment_identifier), 'UTF-8'))), 18, 3), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('sale_availability_assessment', '|', assessment_identifier), 'UTF-8'))), 21, 12)) AS out_id,
    concat(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_reference), 'UTF-8'))), 1, 8), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_reference), 'UTF-8'))), 9, 4), '-5', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_reference), 'UTF-8'))), 14, 3), '-', lower(conv(cast((cast(conv(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_reference), 'UTF-8'))), 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_reference), 'UTF-8'))), 18, 3), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat('listing_observation', '|', observation_reference), 'UTF-8'))), 21, 12)) AS in_id,
    '' AS k2, reference_position + 1 AS k3
  FROM source_sale_availability_assessments
  LATERAL VIEW posexplode(relationships.sale_availability_assessment_has_listing_observation) refs
    AS reference_position, observation_reference
),
edge_json AS (
  SELECT CASE WHEN label LIKE 'sale%' THEN 2 ELSE 1 END AS k1, k2, k3, concat('{"@type":"g:Edge","@value":{"id":{"@type":"g:UUID","@value":"', concat(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', out_id, '|', in_id), 'UTF-8'))), 1, 8), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', out_id, '|', in_id), 'UTF-8'))), 9, 4), '-5', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', out_id, '|', in_id), 'UTF-8'))), 14, 3), '-', lower(conv(cast((cast(conv(substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', out_id, '|', in_id), 'UTF-8'))), 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', out_id, '|', in_id), 'UTF-8'))), 18, 3), '-', substr(sha1(concat(unhex('6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e'), encode(concat(label, '|', out_id, '|', in_id), 'UTF-8'))), 21, 12)), '"},"inV":{"@type":"g:UUID","@value":"', in_id, '"},"inVLabel":"', in_label, '","label":"', label, '","outV":{"@type":"g:UUID","@value":"', out_id, '"},"outVLabel":"', out_label, '","properties":{}}}') AS json
  FROM edge_endpoints
)
SELECT
  CASE
    WHEN (SELECT count(*) FROM request) <> 1 THEN raise_error('request_address must contain exactly one row')
    WHEN (SELECT count(property_ref) FROM request) > 0
      THEN raise_error('independentPropertyReference is not supported by this mapping version')
    WHEN (
      SELECT count(*)
      FROM (
        SELECT explode(relationships.sale_availability_assessment_has_listing_observation) AS observation_reference
        FROM source_sale_availability_assessments
      ) refs
      LEFT ANTI JOIN source_listing_observations o ON o.observation_identifier = refs.observation_reference
    ) > 0 THEN raise_error('assessment references an unknown listing_observation')
    ELSE a.normalized.address_status
  END AS address_status,
  CASE WHEN a.normalized.address_status = 'NORMALIZED' THEN concat(
    '{"edges":[',
    (SELECT coalesce(array_join(transform(
      array_sort(collect_list(named_struct('k1', k1, 'k2', k2, 'k3', k3, 'json', json))), x -> x.json), ','), '')
     FROM edge_json),
    '],"vertices":[',
    (SELECT array_join(transform(
      array_sort(collect_list(named_struct('k1', k1, 'k2', k2, 'k3', k3, 'json', json))), x -> x.json), ',')
     FROM vertex_json),
    ']}'
  ) END AS graph
FROM source_sale_availability_assessments s
CROSS JOIN address a
