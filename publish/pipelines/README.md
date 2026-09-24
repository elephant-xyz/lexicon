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

## Local resolution

Set `ELEPHANT_LEXICON_ROOT` to this repo checkout, or place `lexicon` as a sibling
of `connect` / `transform`. Products resolve:

`publish/pipelines/transform/catalog.json`  
`publish/pipelines/connect/catalog.json`

## Remote resolution

Raw GitHub (default `main`):

`https://raw.githubusercontent.com/elephant-xyz/lexicon/main/publish/pipelines/transform/catalog.json`
