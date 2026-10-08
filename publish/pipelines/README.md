# Pipeline catalogs (Connect + Transform)

Canonical **language / mapping / source registration** digests for
[`elephant-xyz/connect`](https://github.com/elephant-xyz/connect) and
[`elephant-xyz/transform`](https://github.com/elephant-xyz/transform).

This tree is separate from the IPFS/Filebase **class schema** catalog used by
the Lexicon UI (`src/data/lexicon.json`, `/api/manifest`).

| Path | Consumer |
| --- | --- |
| `transform/catalog.json` | Transform (`TRANSFORM_CATALOG_URI` / Lexicon root) |
| `connect/catalog.json` | Connect source registrations |

## Transform language model

Pipeline tabular languages use the versioned schema selected by
`transform/catalog.json`. Scalar-only publications remain valid against immutable
`transform/schemas/pipeline-language/1.0.0/schema.json`; the catalog selects
`1.1.0` for strict nested object and array columns:
`contractVersion`, language `name` and `version`, `shape: "tabular"`, and
`datasets`. Root graph Lexicon data continues to use
`src/data/lexicon.json` with `classes`, `data_groups`, and `common_patterns`; the
two models are intentionally separate.

Published language and mapping paths are immutable. Any content change after a
version reaches `main` requires a new SemVer directory and catalog identity.
Catalog and mapping digests pin every artifact and SQL query.

## Sale availability

The governed graph model publishes `listing_observation@1.0.0` and
`sale_availability_assessment@1.0.0` in `src/data/lexicon.json`. `Sale Availability`
relationships require address and evidence endpoints, while property links are
optional and may reference only an independently established property. Address
matching never mints canonical property identity, and edges are emitted only when
both endpoints exist.

The Transform catalog publishes:

- `connect-http-acquisition-bundle@1.0.0`, reused from the generic Connect
  acquisition-bundle and digest-verified artifact hydration boundary;
- `sale-availability-evidence@1.0.0`, dataset `listing_observations`;
- `sale-availability-assessment@1.1.0`, dataset
  `sale_availability_assessments`, retaining the governed eligible list price
  as integer minor units plus ISO currency;
- enabled
  `connect-http-acquisition-bundle-to-sale-availability-evidence@1.0.1`,
  which reads `acquisition_records` and `raw_documents`, accepts a confirmed
  Google-inferred ZIP+4 suffix when RentCast matches the same street, locality,
  state, and five-digit ZIP, and remains fail-closed for other inferred address
  components; and
- enabled
  `sale-availability-evidence-to-sale-availability-assessment@1.1.0`,
  which implements `sale-availability-policy-v1`, collapses identical eligible
  prices, and emits `CONFLICTING_ELIGIBLE_ACTIVE_PRICES` rather than choosing
  among conflicting amounts or currencies.

Policy v1 accepts Google Address Validation only as address-identity evidence and
RentCast only as supporting, partial listing evidence. An exact, fresh RentCast
`ACTIVE` record may support `FOR_SALE`; `COMING_SOON`, `PENDING`, and
`UNDER_CONTRACT` remain explicit statuses but never project to `true`. Absence,
lookup failure, stale/non-exact/ambiguous evidence remains `UNKNOWN`. Only exact,
fresh, authoritative, complete negative evidence can produce `NOT_FOR_SALE`, and
the acquisition mapping never assigns those authority/coverage states to
RentCast. Conflicting fresh exact active and non-active records produce
`CONFLICT`.

Each manifest pins its SQL and independent positive/negative policy fixtures for
every producer-owned invariant. The assessment registration also requests the
engine's structured sorted/unique-array check for observation references.

Completion delivery remains pointer-only for the acquisition-to-evidence
mapping. The assessment mapping additionally requests `inline` delivery of
exactly one schema-validated `sale_availability_assessments` row, with a
deterministic JSON limit of 65,536 bytes and a required immutable object version
ID. The durable, digest-pinned result pointer remains authoritative; the inline
value is a bounded completion projection of that same validated result. Zero or
multiple assessment rows fail completion instead of selecting a row.

The current governed runtime consumes standard JSONL datasets; it does not
materialize Connect `ResultManifest` objects itself. The first mapping therefore
includes `fixtures/system-input-packaging.contract.json`, which defines the
deterministic, provider-agnostic System handoff into `acquisition_records` and
`raw_documents`. Packaging may verify and hydrate immutable artifacts but must
not parse provider status, price, or identity semantics. Those decisions remain
in mapping SQL.

Local Spark validation executes the normal Parquet chain through both mappings.
Transform tolerates parser-conservative nested Parquet nullability while keeping
definition-derived row validation fail-closed for required nulls, missing or
unexpected nested fields, and incompatible types.

### Firecrawl one-run result

`sale-availability-result@1.0.0` composes the existing
`listing_observations` and `sale_availability_assessments` dataset definitions
without changing their fields, types, relationships, model versions, or
invariants. The immutable directional mapping
`connect-http-acquisition-bundle-to-sale-availability-result@1.0.1` reads the
standard JSONL `acquisition_records` and `raw_documents` datasets and writes
Parquet.

The first output uses `POSEXPLODE` over the Firecrawl `data.web` envelope and
emits one observation per page. Per page it evaluates at most 16 JSON-LD blocks
of at most 262,144 characters each, including later blocks, top-level arrays,
nested `@graph` nodes, and nested offers. Empty, failed, malformed, over-limit,
blocked, or missing-HTML envelopes remain fail-closed. The second output
declares `dependsOn: ["listing_observations"]` and reads
`target_listing_observations`, so the observations and one bounded assessment
are produced by one Glue execution. Exactly-one inline delivery applies only to
the assessment; both datasets retain their normal durable Parquet prefixes.

The mapping is deliberately fail-closed. Only an exact-address page with a
fresh explicit JSON-LD availability or whitelisted listing-status signal can
contribute `FOR_SALE`. Positive amount and currency must occur in that same
eligible block. Visible text, title, OpenGraph, domain, search rank, future
auction prose, and unscoped embedded application state do not establish active
status. Absence never contributes `NOT_FOR_SALE`; non-exact, stale, undated,
ambiguous, blocked, failed, malformed, or over-limit evidence remains `UNKNOWN`,
and incompatible fresh exact signals or eligible prices produce `CONFLICT`.
Synthetic `.invalid` fixtures cover all policy paths and deterministic replay;
no commercial page HTML, live result URL, or customer address is checked in.

Transform callers select the pair only by `from` and `to`; wire requests contain
no language versions, mapping identity, formats, or output-dataset selectors.
The previous two-step mappings remain enabled and unchanged for compatibility.

## Local resolution

Set `ELEPHANT_LEXICON_ROOT` to this repo checkout, or place `lexicon` as a sibling
of `connect` / `transform`. Products resolve:

`publish/pipelines/transform/catalog.json`
`publish/pipelines/connect/catalog.json`

## Remote resolution

Raw GitHub (default `main`):

`https://raw.githubusercontent.com/elephant-xyz/lexicon/main/publish/pipelines/transform/catalog.json`

Version `1.0.1` is source-only and has not been published, registered, deployed,
activated, or executed in AWS. The prior `1.0.0` review publication is pinned in
`transform/deployments/review.lock.json`. Its versioned S3 catalog SHA-256 is
`98d2cefe8e6d9303e2e1b864523c5d3a1dfe10a09211bebeea76ed7111330045`;
the local file and remote readback matched, and
`/lexicon/transform-catalog-uri` points to that object key. The Firecrawl
one-run result mapping was validated and immutably registered through the
IAM-authenticated Transform API. One synthetic three-page review execution
produced three listing observations and one `CONFLICT` assessment in one Glue
run at a measured cost of `$0.05964444444444445`; it made no provider call.
Evidence mapping `1.1.2` and assessment mapping `1.2.0` remain enabled and
unchanged for their existing two-step pairs.
