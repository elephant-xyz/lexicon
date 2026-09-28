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

Pipeline tabular languages use the versioned
`transform/schemas/pipeline-language/1.0.0/schema.json` contract:
`contractVersion`, language `name` and `version`, `shape: "tabular"`, and
`datasets`. Root graph Lexicon data continues to use
`src/data/lexicon.json` with `vertices`, `edges`, and `common_patterns`; the two
models are intentionally separate.

Published language and mapping paths are immutable. Any content change after a
version reaches `main` requires a new SemVer directory and catalog identity.
Catalog and mapping digests pin every artifact and SQL query.

## Local resolution

Set `ELEPHANT_LEXICON_ROOT` to this repo checkout, or place `lexicon` as a sibling
of `connect` / `transform`. Products resolve:

`publish/pipelines/transform/catalog.json`  
`publish/pipelines/connect/catalog.json`

## Remote resolution

Raw GitHub (default `main`):

`https://raw.githubusercontent.com/elephant-xyz/lexicon/main/publish/pipelines/transform/catalog.json`
