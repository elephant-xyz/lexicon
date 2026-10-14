// Resolves Transform plans from this repository's catalog with the deployed engine's own resolver.
//
// Usage (from the Transform checkout, so its dependencies resolve):
//   npx tsx <lexicon>/scripts/transform-spark/resolve-plans.ts <cases.json> > plans.json
//
// cases.json: {"transformRoot", "catalogRoot", "from", "to", "cases": [{"executionId", "outputS3Prefix",
//   "inputs": [{"table", "s3Uri", "objects": [{"bucket", "key", "path"}]}]}]}
// The catalog is served from s3://lexicon-catalog/ so artifact references are deterministic; input object
// ETags are SHA-256 hex, matching the Spark worker's LocalTransformObjectStore.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type CaseInput = {
  table: string;
  s3Uri: string;
  objects: Array<{ bucket: string; key: string; path: string }>;
};
type Case = { executionId: string; outputS3Prefix: string; inputs: CaseInput[] };
type Request = {
  transformRoot: string;
  catalogRoot: string;
  from: string;
  to: string;
  cases: Case[];
};

const CATALOG_BUCKET = 'lexicon-catalog';
const CATALOG_PARAMETER = '/lexicon/transform-catalog-uri';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function main(): Promise<void> {
  const request = JSON.parse(readFileSync(process.argv[2] as string, 'utf8')) as Request;
  const engine = (relative: string) =>
    import(pathToFileURL(path.join(request.transformRoot, relative)).href);
  const catalogModule = await engine('src/shared/governed-catalog.ts');
  const planModule = await engine('src/shared/transform-plan.ts');

  const readCatalogFile = (key: string): Uint8Array =>
    readFileSync(path.join(request.catalogRoot, key));
  const s3 = {
    send: async (command: {
      constructor: { name: string };
      input: { Bucket: string; Key: string };
    }) => {
      if (command.input.Bucket !== CATALOG_BUCKET) {
        throw new Error(`Unexpected bucket ${command.input.Bucket}`);
      }
      const bytes = readCatalogFile(command.input.Key);
      if (command.constructor.name === 'HeadObjectCommand') {
        return {
          ContentLength: bytes.byteLength,
          ETag: `"${sha256(bytes)}"`,
          VersionId: 'local-version-1',
        };
      }
      if (command.constructor.name === 'GetObjectCommand') {
        return { Body: { transformToByteArray: async () => bytes } };
      }
      throw new Error(`Unsupported S3 command ${command.constructor.name}`);
    },
  };
  const ssm = {
    send: async () => ({ Parameter: { Value: `s3://${CATALOG_BUCKET}/catalog.json` } }),
  };
  const configuration = await catalogModule.loadGovernedConfiguration(
    request.from,
    request.to,
    { s3, ssm },
    CATALOG_PARAMETER
  );
  const declared = catalogModule.governedInputs(configuration) as Array<{
    table: string;
    view: string;
    required: boolean;
    format: string;
    options: Record<string, string | number | boolean>;
    schema: unknown;
  }>;
  const mapping = configuration.mapping.document;
  const plans = request.cases.map(item => {
    const byTable = new Map(item.inputs.map(input => [input.table, input]));
    const inputs = declared.map(input => {
      const supplied = byTable.get(input.table);
      if (supplied === undefined) {
        if (input.required) throw new Error(`Required input dataset '${input.table}' is missing`);
        return {
          table: input.table,
          view: input.view,
          required: false,
          options: input.options,
          schema: input.schema,
          objects: [],
        };
      }
      return {
        table: input.table,
        view: input.view,
        sourceS3Uri: supplied.s3Uri,
        format: input.format,
        options: input.options,
        required: input.required,
        schema: input.schema,
        objects: supplied.objects.map(object => {
          const bytes = readFileSync(object.path);
          return {
            bucket: object.bucket,
            key: object.key,
            size: bytes.byteLength,
            eTag: sha256(bytes),
          };
        }),
      };
    });
    return planModule.buildResolvedTransformPlan(
      {
        executionId: item.executionId,
        requestContractVersion: 2,
        catalog: configuration.catalog,
        sourceLanguage: configuration.sourceDefinition.artifact,
        targetLanguage: configuration.targetDefinition.artifact,
        from: {
          name: configuration.sourceDefinition.document.name,
          version: configuration.sourceDefinition.document.version,
        },
        to: {
          name: configuration.targetDefinition.document.name,
          version: configuration.targetDefinition.document.version,
        },
        mapping: { id: mapping.id, version: mapping.version, rule: configuration.mapping.artifact },
        inputs,
        output: {
          s3Prefix: item.outputS3Prefix,
          executionS3Prefix: `${item.outputS3Prefix}/${item.executionId}`,
          shape: mapping.output.shape,
          format: mapping.output.format,
          options: catalogModule.effectiveOutputOptions(mapping.output),
          ...(mapping.output.delivery === undefined ? {} : { delivery: mapping.output.delivery }),
        },
        sqlOptions: { ansiEnabled: true },
        queries: configuration.queries.map(
          (query: {
            dataset: string;
            artifact: {
              s3Uri: string;
              sha256: string;
              versionId?: string;
              eTag?: string;
              size?: number;
            };
            schema: unknown;
            dependsOn: string[];
            invariantEvidence: unknown[];
          }) => ({
            dataset: query.dataset,
            queryS3Uri: query.artifact.s3Uri,
            querySha256: query.artifact.sha256,
            ...(query.artifact.versionId === undefined
              ? {}
              : { queryVersionId: query.artifact.versionId }),
            ...(query.artifact.eTag === undefined ? {} : { queryETag: query.artifact.eTag }),
            ...(query.artifact.size === undefined ? {} : { querySize: query.artifact.size }),
            schema: query.schema,
            dependsOn: query.dependsOn,
            invariantEvidence: query.invariantEvidence,
          })
        ),
        costCeilingUsd: 0.1,
      },
      '2026-10-14T00:00:00.000Z'
    );
  });
  process.stdout.write(
    JSON.stringify({
      mapping: { id: mapping.id, version: mapping.version, rule: configuration.mapping.artifact },
      plans,
    })
  );
}

main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exit(1);
});
