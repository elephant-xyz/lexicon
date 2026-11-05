import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const semverSchema = z
  .string()
  .regex(
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
  );
const nameSchema = z.string().regex(/^[a-z][a-z0-9-]*$/u);
const releaseIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,127}$/u);
const accountIdSchema = z.string().regex(/^[0-9]{12}$/u);
const regionSchema = z.string().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-[0-9]$/u);
const revisionSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{7,79}$/u);

export const safeRelativePathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine(
    value =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..'),
    'Path must be a confined relative POSIX path'
  );

const s3UriSchema = z.string().regex(/^s3:\/\/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\/[^?#]+$/u);
const parameterNameSchema = z.string().regex(/^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/u);
const contentTypeSchema = z.enum([
  'application/json',
  'text/plain; charset=utf-8',
  'text/sql; charset=utf-8',
]);

export const artifactDeclarationSchema = z
  .object({
    sourcePath: safeRelativePathSchema,
    destinationKey: safeRelativePathSchema,
    sha256: sha256Schema,
    size: z.number().int().positive().max(1_048_576),
    contentType: contentTypeSchema,
  })
  .strict();

const pointerSchema = z
  .object({
    parameterName: parameterNameSchema,
    version: z.number().int().positive(),
    value: s3UriSchema,
    catalogSha256: sha256Schema,
    catalogVersionId: z.string().min(1).max(1_024).optional(),
  })
  .strict();

export const releaseManifestSchema = z
  .object({
    contractVersion: z.literal(1),
    releaseId: releaseIdSchema,
    stage: nameSchema,
    target: z
      .object({
        accountId: accountIdSchema,
        region: regionSchema,
      })
      .strict(),
    catalogIdentity: nameSchema,
    validationProfile: z.literal('pipeline-language-mapping@2'),
    source: z
      .object({
        repository: z.string().url(),
        revision: revisionSchema,
        pullRequest: z.number().int().positive(),
      })
      .strict(),
    allowedArtifactKeys: z.array(safeRelativePathSchema).min(2).max(256),
    catalog: artifactDeclarationSchema,
    artifacts: z.array(artifactDeclarationSchema).min(1).max(255),
    expectedPriorPointer: pointerSchema,
    requestedPointer: z
      .object({
        parameterName: parameterNameSchema,
        value: s3UriSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const declarations = [manifest.catalog, ...manifest.artifacts];
    const totalSize = declarations.reduce((sum, artifact) => sum + artifact.size, 0);
    if (totalSize > 10_485_760) {
      context.addIssue({
        code: 'custom',
        path: ['artifacts'],
        message: 'Release bundle exceeds the 10 MiB publication limit',
      });
    }
    const keys = declarations.map(artifact => artifact.destinationKey);
    const allowed = new Set(manifest.allowedArtifactKeys);
    if (allowed.size !== manifest.allowedArtifactKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['allowedArtifactKeys'],
        message: 'Allowed artifact keys must be unique',
      });
    }
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['artifacts'],
        message: 'Artifact destination keys must be unique',
      });
    }
    if (allowed.size !== keys.length || keys.some(key => !allowed.has(key))) {
      context.addIssue({
        code: 'custom',
        path: ['allowedArtifactKeys'],
        message: 'Allowed artifact keys must exactly match the declared catalog and artifacts',
      });
    }
    const sourcePaths = declarations.map(artifact => artifact.sourcePath);
    if (new Set(sourcePaths).size !== sourcePaths.length) {
      context.addIssue({
        code: 'custom',
        path: ['artifacts'],
        message: 'Artifact source paths must be unique',
      });
    }
  });

export const releaseOperationRequestSchema = z
  .object({
    contractVersion: z.literal(1),
    idempotencyKey: idempotencyKeySchema,
    manifest: releaseManifestSchema,
  })
  .strict();

export const rollbackOperationRequestSchema = z
  .object({
    contractVersion: z.literal(1),
    idempotencyKey: idempotencyKeySchema,
    stage: nameSchema,
    catalogIdentity: nameSchema,
    receipt: z
      .object({
        key: safeRelativePathSchema,
        versionId: z.string().min(1).max(1_024),
        sha256: sha256Schema,
      })
      .strict(),
    expectedPointer: z
      .object({
        parameterName: parameterNameSchema,
        version: z.number().int().positive(),
        value: s3UriSchema,
      })
      .strict(),
  })
  .strict();

export const operationKindSchema = z.enum(['validate', 'plan', 'publish', 'rollback']);
export type OperationKind = z.infer<typeof operationKindSchema>;

export const workflowInputSchema = z
  .object({
    contractVersion: z.literal(1),
    operation: operationKindSchema,
    operationId: z.string().regex(/^[a-z]+-[a-f0-9]{32}$/u),
    requestHash: sha256Schema,
    actor: z
      .object({
        accountId: accountIdSchema,
        arn: z.string().min(1).max(2_048),
      })
      .strict(),
    submittedAt: z.string().datetime({ offset: true }),
    payload: z.union([releaseOperationRequestSchema, rollbackOperationRequestSchema]),
  })
  .strict();

const catalogLocationShape = {
  path: safeRelativePathSchema.optional(),
  s3Uri: s3UriSchema.optional(),
};

const languageEntrySchema = z
  .object({
    kind: z.literal('language'),
    name: nameSchema,
    version: semverSchema,
    current: z.boolean(),
    status: z.enum(['ENABLED', 'DISABLED']),
    shape: z.enum(['tabular', 'graph']),
    sha256: sha256Schema,
    ...catalogLocationShape,
  })
  .strict()
  .refine(
    value => Number(value.path !== undefined) + Number(value.s3Uri !== undefined) === 1,
    'Catalog entries require exactly one location'
  );

const mappingEntrySchema = z
  .object({
    kind: z.literal('mapping'),
    id: nameSchema,
    version: semverSchema,
    current: z.boolean(),
    status: z.enum(['ENABLED', 'DISABLED']),
    from: nameSchema,
    to: nameSchema,
    sha256: sha256Schema,
    querySha256: sha256Schema.optional(),
    ...catalogLocationShape,
  })
  .strict()
  .refine(
    value => Number(value.path !== undefined) + Number(value.s3Uri !== undefined) === 1,
    'Catalog entries require exactly one location'
  );

export const governedCatalogSchema = z
  .object({
    contractVersion: z.literal(2),
    publisher: z.string().trim().min(1),
    repository: z.string().url(),
    ssMPointer: parameterNameSchema,
    githubRawBase: z.string().url().optional(),
    revision: z.string().trim().min(1).optional(),
    languageSchema: z
      .object({
        version: semverSchema,
        status: z.enum(['ENABLED', 'DISABLED']),
        path: safeRelativePathSchema,
        sha256: sha256Schema,
      })
      .strict(),
    entries: z
      .array(z.union([languageEntrySchema, mappingEntrySchema]))
      .min(1)
      .max(1_024),
  })
  .strict();

const queryDeclarationSchema = z
  .object({
    queryPath: safeRelativePathSchema
      .refine(value => value.startsWith('queries/'), 'Query must be beneath queries/')
      .refine(value => value.endsWith('.sql'), 'Query must be a SQL file'),
    querySha256: sha256Schema,
  })
  .strict();

const invariantTestSchema = z
  .object({
    path: safeRelativePathSchema.refine(
      value => value.startsWith('tests/'),
      'Invariant evidence must be beneath tests/'
    ),
    sha256: sha256Schema,
    description: z.string().trim().min(1),
  })
  .strict();

const mappingOutputSchema = z
  .object({
    dataset: z.string().regex(/^[a-z][a-z0-9_]*$/u),
    dependsOn: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/u)),
    queryPath: queryDeclarationSchema.shape.queryPath.optional(),
    querySha256: sha256Schema.optional(),
    queries: z.array(queryDeclarationSchema).min(1).optional(),
    graph: z.record(z.string(), z.unknown()).optional(),
    invariantEvidence: z
      .array(
        z
          .object({
            invariant: z.string().regex(/^[a-z][a-z0-9_]*$/u),
            querySha256s: z.array(sha256Schema).min(1),
            tests: z.array(invariantTestSchema).min(1),
            engineChecks: z
              .array(
                z
                  .object({
                    kind: z.literal('array-sorted-unique'),
                    jsonPointer: z.string().startsWith('/'),
                  })
                  .strict()
              )
              .optional(),
          })
          .strict()
      )
      .optional(),
  })
  .strict()
  .superRefine((output, context) => {
    const hasSingle = output.queryPath !== undefined && output.querySha256 !== undefined;
    if (Number(hasSingle) + Number(output.queries !== undefined) !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'Output requires one queryPath/querySha256 pair or a queries array',
      });
    }
  });

export const governedMappingManifestSchema = z
  .object({
    contractVersion: z.literal(2),
    id: nameSchema,
    version: semverSchema,
    status: z.enum(['ENABLED', 'DISABLED']),
    engine: z.literal('spark-sql'),
    from: z.object({ name: nameSchema, version: semverSchema }).strict(),
    to: z.object({ name: nameSchema, version: semverSchema }).strict(),
    inputs: z
      .array(
        z
          .object({
            table: z.string().regex(/^[a-z][a-z0-9_]*$/u),
            view: z.string().regex(/^source_[A-Za-z0-9_]+$/u),
            required: z.boolean(),
            format: z.enum(['parquet', 'jsonl', 'csv', 'xlsx']),
            options: z.record(z.string(), z.unknown()).optional(),
            sheet: z.string().min(1).max(31).optional(),
            graph: z.record(z.string(), z.unknown()).optional(),
          })
          .strict()
      )
      .min(1),
    output: z
      .object({
        shape: z.enum(['tabular', 'graph']),
        format: z.enum(['parquet', 'jsonl', 'csv', 'xlsx']),
        options: z.record(z.string(), z.unknown()).optional(),
        profile: z.literal('neptune').optional(),
        delivery: z
          .object({
            mode: z.literal('inline'),
            dataset: z.string().regex(/^[a-z][a-z0-9_]*$/u),
            cardinality: z.literal('exactly-one'),
            maxBytes: z.number().int().positive().max(1_048_576),
            requireVersionId: z.boolean(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    outputs: z.array(mappingOutputSchema).min(1),
  })
  .strict();

export const publicationReceiptSchema = z
  .object({
    contractVersion: z.literal(1),
    releaseId: releaseIdSchema,
    stage: nameSchema,
    catalogIdentity: nameSchema,
    actor: z.object({ accountId: accountIdSchema, arn: z.string().min(1) }).strict(),
    submittedAt: z.string().datetime({ offset: true }),
    publishedAt: z.string().datetime({ offset: true }),
    source: z
      .object({
        repository: z.string().url(),
        revision: revisionSchema,
        pullRequest: z.number().int().positive(),
        approvals: z.number().int().nonnegative(),
        checks: z.number().int().nonnegative(),
      })
      .strict(),
    objects: z
      .array(
        z
          .object({
            key: safeRelativePathSchema,
            versionId: z.string().min(1),
            sha256: sha256Schema,
            size: z.number().int().positive(),
            contentType: contentTypeSchema,
          })
          .strict()
      )
      .min(1),
    pointer: z
      .object({
        name: parameterNameSchema,
        priorVersion: z.number().int().positive(),
        version: z.number().int().positive(),
        value: s3UriSchema,
      })
      .strict(),
    rollbackTarget: z
      .object({
        pointerValue: s3UriSchema,
        pointerVersion: z.number().int().positive(),
        catalogSha256: sha256Schema,
        catalogVersionId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ArtifactDeclaration = z.infer<typeof artifactDeclarationSchema>;
export type GovernedCatalog = z.infer<typeof governedCatalogSchema>;
export type GovernedMappingManifest = z.infer<typeof governedMappingManifestSchema>;
export type PublicationReceipt = z.infer<typeof publicationReceiptSchema>;
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export type ReleaseOperationRequest = z.infer<typeof releaseOperationRequestSchema>;
export type RollbackOperationRequest = z.infer<typeof rollbackOperationRequestSchema>;
export type WorkflowInput = z.infer<typeof workflowInputSchema>;
