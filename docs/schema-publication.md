# Filebase schema publication

`src/data/lexicon.json` is the authored source of truth. Published schemas and the
manifest are derived artifacts.

## Publication model

The `Publish schemas to Filebase` workflow:

1. Generates and uploads class schemas and examples.
2. Generates relationship schemas with the new class CIDs, then uploads them.
3. Generates data-group schemas with the new relationship CIDs, then uploads them.
4. Uploads `schema-manifest.json` only after every referenced object has a CID.
5. Atomically repoints the `elephant-lexicon-manifest` Filebase IPNS name to the new
   manifest CID.

Every object key contains the SHA-256 of its body. A publication never overwrites the
objects or manifest used by the current IPNS version; old and new graphs remain pinned
side-by-side until an explicit retention cleanup.

The site reads the stable IPNS name through `/api/manifest`. The endpoint caches for one
minute and falls back to `src/data/published-schema-manifest.json`, copied into the build,
if IPNS is unavailable or has not been configured yet.

Normal pull-request and Vercel builds perform no network writes and do not fetch the
current production site.

## One-time Filebase cutover

1. Create or select a Filebase IPFS bucket dedicated to Lexicon schemas.
2. Configure the GitHub `schema-publishing` environment:
   - Secret `FILEBASE_ACCESS_KEY`
   - Secret `FILEBASE_SECRET_KEY`
   - Variable `FILEBASE_LEXICON_BUCKET`
   - Optional variable `FILEBASE_LEXICON_IPNS_LABEL` (defaults to
     `elephant-lexicon-manifest`)
3. Run **Publish schemas to Filebase** with `workflow_dispatch`.
4. Download the `schema-publication-<sha>` receipt and copy `ipns.networkKey`.
5. Set `LEXICON_MANIFEST_IPNS=<networkKey>` in the Vercel project for Preview and
   Production, then redeploy.
6. Verify:

   ```bash
   curl -sS -D - https://lexicon.elephant.xyz/api/manifest -o /tmp/manifest.json
   ```

   The response must include `X-Lexicon-Manifest-Source: ipns`, and every entry must have
   a non-empty `ipfsCid`.

After cutover, merges that change `src/data/lexicon.json` automatically run the
publisher. `workflow_dispatch` remains the break-glass republish path.

Running `npm run schemas:publish:filebase` locally is a live remote write and is refused
unless `CONFIRM_FILEBASE_PUBLISH=publish` is set alongside the Filebase variables.

## Migration from Pinata-era objects

The first Filebase publication is a full republish. It does not reuse or trust the old
manifest CIDs: all classes, examples, relationships, data groups, and the manifest are
uploaded through Filebase's S3-compatible IPFS API. This creates a complete Filebase-owned
graph before IPNS moves.

Do not remove old pins before the IPNS verification above. Existing readers continue to
use the checked-in bootstrap manifest until Vercel receives `LEXICON_MANIFEST_IPNS`, so
the migration has no partial state.

To roll back the pointer, update the Filebase Name to the prior manifest CID from a
publication receipt. To roll back the site to the bootstrap snapshot, remove
`LEXICON_MANIFEST_IPNS` and redeploy.

The former Pinata uploader and its `PINATA_JWT`, `node-fetch`, and `form-data`
dependencies are not part of this pipeline.
