# Persist compatibility baseline

`persist-elephant-07e2289b.json` is the exact active `elephant` extension read from
`PersistStack-review` on 2026-10-16. Its SHA-256 is
`07e2289b6eab0d55eefc229b4b34375ba8be941905e63c39d1943fb1c66882a5`;
the immutable component object is S3 version
`hkP6TF3F_aSbGd72NZMrqcmelRkONB3y`.

The Model composition generator treats this document as a compatibility floor:

- all 213 installed vertices and 292 installed relationships retain their labels,
  kinds, endpoints, properties, required fields, indexes, embeddings, and
  constraints;
- `payment` remains imported from `model-shared-base-v2.0.0`;
- the legacy `phone_call` relationship remains owned by the base and is not
  replaced by a vertex;
- only the 233 missing relationship labels are added by the extension;
- restrictive source constraints are deferred until data compliance and a
  migration are separately approved.

`contract-1.1-compatibility-report.json` is generated with the composition and is
covered by `tests/model/modelComposition.test.ts`. Regenerate from a freshly read
component only when its exact digest is expected:

```sh
PERSIST_EXTENSION_SOURCE=/path/to/exact-component.json npm run model:composition
```

This baseline is evidence, not an authorization to install it. Source review,
the shared-base release, Model validation, independent approval, and publication
remain separate gates.
