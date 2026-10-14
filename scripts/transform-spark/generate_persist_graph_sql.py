#!/usr/bin/env python3
"""Generates persist_graph.sql for sale-availability-persist-input-to-persist-graphson; the output is the registered artifact.

Usage: generate_persist_graph_sql.py <dir with build_graphson.py> > <mapping>/1.0.0/queries/persist_graph.sql
Suffix, directional and unit tables and the placeholder namespace are read from the executable spec.
"""
import sys

sys.path.insert(0, sys.argv[1])
import build_graphson as bg  # noqa: E402

NS = "6f1d0c1e5a1e4b7a9c555a1e5a1e5a1e"
assert NS == bg.NAMESPACE.hex


def uuid5(name):
    h = f"sha1(concat(unhex('{NS}'), encode({name}, 'UTF-8')))"
    return (
        f"concat(substr({h}, 1, 8), '-', substr({h}, 9, 4), '-5', substr({h}, 14, 3), '-', "
        f"lower(conv(cast((cast(conv(substr({h}, 17, 1), 16, 10) AS INT) & 3) | 8 AS STRING), 10, 16)), "
        f"substr({h}, 18, 3), '-', substr({h}, 21, 12))"
    )


def jstr(x):
    return f"CASE WHEN {x} IS NOT NULL THEN substr(to_json(array({x})), 2, length(to_json(array({x}))) - 2) END"


def str_list(values, indent):
    items = [f"'{v}'" for v in values]
    lines, line = [], []
    for item in items:
        if sum(len(i) + 2 for i in line) + len(item) > 104:
            lines.append(", ".join(line)); line = []
        line.append(item)
    lines.append(", ".join(line))
    return (",\n" + " " * indent).join(lines)


USPS = sorted(bg.USPS_SUFFIXES)
assert len(USPS) == 201
SUFFIX_MAP = bg.SUFFIXES
SUFFIX_WORDS = sorted(set(USPS) | set(SUFFIX_MAP))
UNIT_DESIGNATORS = sorted(bg.UNIT_DESIGNATORS)
DIRS = "N|NE|E|SE|S|SW|W|NW"
assert set(DIRS.split("|")) == bg.DIRECTIONALS
UNIT_ALT = "|".join(sorted(bg.UNIT_DESIGNATORS | {"SUITE", "APARTMENT"}))
UNIT_RE = r"(?i)^(.*?)\\s+((?:(?:" + UNIT_ALT + r")\\.?\\s*#?\\s*|#\\s*)[A-Za-z0-9-]+)$"
ZIP_RE = r"^([A-Za-z]{2})(?:\\s+([0-9]{5}(?:-[0-9]{4})?))?$"
BARE_RE = r"^\\S+(?:\\s+\\S+)+\\s+(\\S+)\\s+([0-9]+[A-Za-z]?)$"
STREET_RE = r"^([0-9]+) (?:(?i:(" + DIRS + r")) (?=\\S))?(.+?)(?: (?i:(" + DIRS + r")))?$"
TRIM = r"'^\\s+|\\s+$', ''"


def suffix_of(token):
    whens = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in SUFFIX_MAP.items())
    return (
        f"CASE {token} {whens}\n"
        f"        ELSE CASE WHEN array_contains(array(\n          {str_list(USPS, 10)}\n        ), {token}) THEN {token} END END"
    )


def word_case(x):
    return (
        f"CASE WHEN {x} RLIKE '(?i)^[0-9]+(ST|ND|RD|TH)$' THEN lower({x}) "
        f"WHEN {x} RLIKE '[0-9]' THEN upper({x}) "
        f"ELSE concat(upper(substr({x}, 1, 1)), lower(substr({x}, 2))) END"
    )


SEGS = r"filter(split(regexp_replace(canonical, " + TRIM + r"), '\\s*,\\s*'), x -> x <> '')"
ZIP_OK = f"coalesce(state_zip RLIKE '{ZIP_RE}', false)"
DESIGNATED = f"coalesce(street_text RLIKE '{UNIT_RE}', false)"
BARE = (
    f"coalesce(street_text RLIKE '{BARE_RE}' AND array_contains(array(\n          {str_list(SUFFIX_WORDS, 10)}\n        ), "
    f"regexp_replace(upper(regexp_extract(street_text, '{BARE_RE}', 1)), '\\\\.+$', '')), false)"
)
DESIGNATOR = (
    f"CASE WHEN unit_text RLIKE '\\\\s' AND array_contains(array({str_list(UNIT_DESIGNATORS, 8)}),\n"
    f"        upper(regexp_extract(unit_text, '^(\\\\S+)', 1))) THEN upper(regexp_extract(unit_text, '^(\\\\S+)', 1)) END"
)
NAME = "CASE WHEN street_suffix_type IS NOT NULL THEN regexp_replace(street_middle, ' \\\\S+$', '') ELSE street_middle END"
STREET_NAME = f"array_join(transform(split({NAME}, ' '), x -> {word_case('x')}), ' ')"
NATURAL_KEY = (
    "concat('{', array_join(transform(normalized.props, x -> concat('\"', x.k, '\": ', "
    + jstr("x.v")
    + ")), ', '), '}')"
)
TS = "\"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'\""


def prop(key, kind, col):
    if kind == "s":
        value = jstr(col)
    elif kind == "t":
        value = jstr(f"date_format({col}, {TS})")
    elif kind == "i":
        value = f"concat('{{\"@type\":\"g:Int64\",\"@value\":', cast({col} AS STRING), '}}')"
    elif kind == "b":
        value = f"CASE WHEN {col} THEN 'true' WHEN NOT {col} THEN 'false' END"
    elif kind == "l":
        value = f"CASE WHEN size({col}) > 0 THEN concat('{{\"@type\":\"g:List\",\"@value\":', to_json({col}), '}}') END"
    return f"named_struct('k', '{key}', 'v', {value})"


def kind_of(key):
    if key in bg.INTEGER_FIELDS:
        return "i"
    if key.endswith("_at") or key == "source_as_of":
        return "t"
    if key == "is_for_sale":
        return "b"
    if key == "reason_codes":
        return "l"
    return "s"


def props(fields, indent):
    return (",\n" + " " * indent).join(prop(k, kind_of(k), k) for k in fields)


VERTEX_PROPERTY = (
    "concat('{\"@type\":\"g:VertexProperty\",\"@value\":{\"id\":{\"@type\":\"g:UUID\",\"@value\":\"', "
    + uuid5("concat(label, '|', natural_key, '|', pkey)")
    + ", '\"},\"label\":\"', pkey, '\",\"value\":', value_json, '}}')"
)
VERTEX = (
    "concat('{\"@type\":\"g:Vertex\",\"@value\":{\"id\":{\"@type\":\"g:UUID\",\"@value\":\"', "
    + uuid5("concat(label, '|', natural_key)")
    + ", '\"},\"label\":\"', label, '\",\"properties\":{', "
    "array_join(transform(array_sort(collect_list(named_struct('pkey', pkey, 'json', property_json))), "
    "x -> concat('\"', x.pkey, '\":[', x.json, ']')), ','), '}}}')"
)
EDGE = (
    "concat('{\"@type\":\"g:Edge\",\"@value\":{\"id\":{\"@type\":\"g:UUID\",\"@value\":\"', "
    + uuid5("concat(label, '|', out_id, '|', in_id)")
    + ", '\"},\"inV\":{\"@type\":\"g:UUID\",\"@value\":\"', in_id, '\"},\"inVLabel\":\"', in_label, "
    "'\",\"label\":\"', label, '\",\"outV\":{\"@type\":\"g:UUID\",\"@value\":\"', out_id, "
    "'\"},\"outVLabel\":\"', out_label, '\",\"properties\":{}}}')"
)


def edge_branch(label, out_label, out_key, in_label, in_key, k2, k3, source):
    out_name = "concat('" + out_label + "', '|', " + out_key + ")"
    in_name = "concat('" + in_label + "', '|', " + in_key + ")"
    return (
        f"  SELECT '{label}' AS label, '{out_label}' AS out_label, '{in_label}' AS in_label,\n"
        f"    {uuid5(out_name)} AS out_id,\n"
        f"    {uuid5(in_name)} AS in_id,\n"
        f"    {k2} AS k2, {k3} AS k3\n"
        f"  {source}"
    )


A_KEY = NATURAL_KEY
FRAG_0 = edge_branch('listing_observation_has_address', 'listing_observation', 'o.observation_identifier', 'address', A_KEY, 'o.observation_identifier', '0',
  "FROM source_listing_observations o CROSS JOIN address\n  WHERE coalesce(o.relationships.listing_observation_has_address, '') <> ''")
FRAG_1 = edge_branch('listing_observation_has_file', 'listing_observation', 'observation_identifier', 'file', 'file_uri', 'observation_identifier', 'file_position + 1',
  "FROM source_listing_observations\n  LATERAL VIEW posexplode(relationships.listing_observation_has_file) files AS file_position, file_uri")
FRAG_2 = edge_branch('sale_availability_assessment_has_address', 'sale_availability_assessment', 's.assessment_identifier', 'address', A_KEY, "''", '0',
  "FROM source_sale_availability_assessments s CROSS JOIN address\n  WHERE coalesce(s.relationships.sale_availability_assessment_has_address, '') <> ''")
FRAG_3 = edge_branch('sale_availability_assessment_has_listing_observation', 'sale_availability_assessment', 'assessment_identifier', 'listing_observation', 'observation_reference', "''", 'reference_position + 1',
  "FROM source_sale_availability_assessments\n  LATERAL VIEW posexplode(relationships.sale_availability_assessment_has_listing_observation) refs\n    AS reference_position, observation_reference")
FRAG_4 = suffix_of(r"regexp_replace(upper(regexp_extract(street_middle, ' (\\S+)$', 1)), '\\.+$', '')")

TEMPLATE = f"""-- One sale-availability run -> one Persist GraphSON v3 graph (contract sections 3-6).
-- Executable spec: build_graphson.py (normalize_address, build) and scale_build.py (parse_address_text).
-- Spark resolves lambdas one nesting level per analyzer pass and the engine keeps the default limit of
-- 100 passes, so values are recomputed inside one projection instead of chained through deep CTEs.
-- Every element_at is size-guarded inside CASE (ANSI is on).
-- Placeholder ids are UUIDv5({bg.NAMESPACE}, '|'-joined natural key); Persist replaces them with
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
    CASE WHEN size({SEGS}) >= 3 THEN element_at({SEGS}, -1) END AS state_zip,
    CASE WHEN size({SEGS}) >= 3 THEN element_at({SEGS}, -2) END AS city_text,
    CASE WHEN size({SEGS}) >= 3 THEN array_join(slice({SEGS}, 1, size({SEGS}) - 2), ' ') END AS street_text
  FROM request
),
-- Structured fields win; parsed=false means rule 4a could not split the text.
raw_address AS (
  SELECT
    structured IS NOT NULL OR {ZIP_OK} AS parsed,
    CASE
      WHEN structured IS NOT NULL THEN structured.street
      WHEN NOT {ZIP_OK} THEN NULL
      WHEN {DESIGNATED} THEN regexp_replace(regexp_extract(street_text, '{UNIT_RE}', 1), {TRIM})
      WHEN {BARE} THEN regexp_replace(street_text, '\\\\s+\\\\S+$', '')
      ELSE street_text
    END AS street,
    CASE
      WHEN structured IS NOT NULL THEN structured.unit
      WHEN NOT {ZIP_OK} THEN NULL
      WHEN {DESIGNATED} THEN regexp_replace(regexp_replace(
        regexp_replace(regexp_extract(street_text, '{UNIT_RE}', 2), {TRIM}),
        '(?i)^APARTMENT\\\\b', 'APT'), '(?i)^SUITE\\\\b', 'STE')
      WHEN {BARE} THEN regexp_extract(street_text, '{BARE_RE}', 2)
    END AS unit,
    CASE WHEN structured IS NOT NULL THEN structured.city WHEN {ZIP_OK} THEN city_text END AS city,
    CASE
      WHEN structured IS NOT NULL THEN structured.state
      WHEN {ZIP_OK} THEN regexp_extract(state_zip, '{ZIP_RE}', 1)
    END AS state,
    CASE
      WHEN structured IS NOT NULL THEN structured.postalCode
      WHEN {ZIP_OK} THEN regexp_extract(state_zip, '{ZIP_RE}', 2)
    END AS postal
  FROM text_segments
),
-- Rules 1-6 (normalize_address) over the single-spaced street.
address_text AS (
  SELECT
    parsed,
    trim(regexp_replace(regexp_replace(coalesce(street, ''), ',', ' '), '\\\\s+', ' ')) AS street_text,
    regexp_replace(coalesce(unit, ''), {TRIM}) AS unit_text,
    array_join(transform(filter(split(coalesce(city, ''), '\\\\s+'), x -> x <> ''), x -> {word_case('x')}), ' ')
      AS city_name,
    upper(regexp_replace(coalesce(state, ''), {TRIM})) AS state_code,
    regexp_replace(coalesce(postal, ''), {TRIM}) AS postal_text
  FROM raw_address
),
address_tokens AS (
  SELECT
    parsed AND street_text RLIKE '^[0-9]+ \\\\S' AS numbered,
    regexp_extract(street_text, '{STREET_RE}', 1) AS sequence_number,
    nullif(upper(regexp_extract(street_text, '{STREET_RE}', 2)), '') AS street_pre_directional_text,
    regexp_extract(street_text, '{STREET_RE}', 3) AS street_middle,
    nullif(upper(regexp_extract(street_text, '{STREET_RE}', 4)), '') AS street_post_directional_text,
    unit_text,
    city_name,
    state_code,
    postal_text
  FROM address_text
),
address_suffix AS (
  SELECT
    *,
    CASE WHEN street_middle LIKE '% %' THEN {FRAG_4}
    END AS street_suffix_type
  FROM address_tokens
),
address AS (
  SELECT
    named_struct(
      'address_status', CASE
        WHEN numbered AND {STREET_NAME} <> '' AND city_name <> '' AND state_code RLIKE '^[A-Z]{{2}}$'
        THEN 'NORMALIZED' ELSE 'UNPARSEABLE'
      END,
      -- Sorted by key: the natural key is Python json.dumps(props, sort_keys=True).
      'props', filter(array(
        named_struct('k', 'address_unit_designator_type', 'v', {DESIGNATOR}),
        named_struct('k', 'city_name', 'v', city_name),
        named_struct('k', 'country_code', 'v', 'US'),
        named_struct('k', 'plus_four_postal_code', 'v',
          CASE WHEN postal_text RLIKE '^[0-9]{{5}}-[0-9]{{4}}$' THEN substr(postal_text, 7, 4) END),
        named_struct('k', 'postal_code', 'v',
          CASE WHEN postal_text RLIKE '^[0-9]{{5}}(-[0-9]{{4}})?$' THEN substr(postal_text, 1, 5) END),
        named_struct('k', 'sequence_number', 'v', CASE WHEN numbered THEN sequence_number END),
        named_struct('k', 'state_code', 'v', state_code),
        named_struct('k', 'street_name', 'v', {STREET_NAME}),
        named_struct('k', 'street_post_directional_text', 'v', street_post_directional_text),
        named_struct('k', 'street_pre_directional_text', 'v', street_pre_directional_text),
        named_struct('k', 'street_suffix_type', 'v', street_suffix_type),
        named_struct('k', 'unit_identifier', 'v', CASE
          WHEN unit_text = '' THEN NULL
          WHEN unit_text RLIKE '\\\\s' AND (regexp_extract(unit_text, '^(\\\\S+)', 1) = '#' OR ({DESIGNATOR}) IS NOT NULL)
          THEN regexp_replace(regexp_extract(unit_text, '(?s)^\\\\S+\\\\s+(.*)$', 1), {TRIM})
          ELSE regexp_replace(regexp_replace(unit_text, '^#+', ''), {TRIM})
        END)
      ), x -> x.v IS NOT NULL)
    ) AS normalized
  FROM address_suffix
),
-- One row per non-null vertex property with its GraphSON value; k1-k3 order the vertices.
vertex_properties AS (
  SELECT 'address' AS label, {A_KEY} AS natural_key, 0 AS k1, '' AS k2, 0 AS k3,
    entry.k AS pkey, {jstr('entry.v')} AS value_json
  FROM address LATERAL VIEW explode(normalized.props) p AS entry
  UNION ALL
  SELECT 'listing_observation', observation_identifier, 1, observation_identifier, 0, entry.k, entry.v
  FROM source_listing_observations LATERAL VIEW explode(array(
    {props(bg.LISTING_FIELDS, 4)}
  )) p AS entry
  WHERE entry.v IS NOT NULL
  UNION ALL
  SELECT 'file', file_uri, 1, first_seen.observation, first_seen.position + 1, 'original_url', {jstr('file_uri')}
  FROM (
    SELECT file_uri, min(named_struct('observation', observation_identifier, 'position', file_position)) AS first_seen
    FROM source_listing_observations
    LATERAL VIEW posexplode(relationships.listing_observation_has_file) files AS file_position, file_uri
    GROUP BY file_uri
  ) first_file_occurrence
  UNION ALL
  SELECT 'sale_availability_assessment', assessment_identifier, 2, '', 0, entry.k, entry.v
  FROM source_sale_availability_assessments LATERAL VIEW explode(array(
    {props(bg.ASSESSMENT_FIELDS, 4)}
  )) p AS entry
  WHERE entry.v IS NOT NULL
),
vertex_property_json AS (
  SELECT label, natural_key, k1, k2, k3, pkey, {VERTEX_PROPERTY} AS property_json
  FROM vertex_properties
),
vertex_json AS (
  SELECT k1, k2, k3, {VERTEX} AS json
  FROM vertex_property_json
  GROUP BY label, natural_key, k1, k2, k3
),
edge_endpoints AS (
{FRAG_0}
  UNION ALL
{FRAG_1}
  UNION ALL
{FRAG_2}
  UNION ALL
{FRAG_3}
),
edge_json AS (
  SELECT CASE WHEN label LIKE 'sale%' THEN 2 ELSE 1 END AS k1, k2, k3, {EDGE} AS json
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
    '{{"edges":[',
    (SELECT coalesce(array_join(transform(
      array_sort(collect_list(named_struct('k1', k1, 'k2', k2, 'k3', k3, 'json', json))), x -> x.json), ','), '')
     FROM edge_json),
    '],"vertices":[',
    (SELECT array_join(transform(
      array_sort(collect_list(named_struct('k1', k1, 'k2', k2, 'k3', k3, 'json', json))), x -> x.json), ',')
     FROM vertex_json),
    ']}}'
  ) END AS graph
FROM source_sale_availability_assessments s
CROSS JOIN address a
"""

sys.stdout.write(TEMPLATE)
