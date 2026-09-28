import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

type ColumnSchema = {
  type: string | string[];
  const?: unknown;
  enum?: unknown[];
  format?: string;
  minimum?: number;
  maximum?: number;
};

type PipelineDataset = {
  type: string;
  properties: Record<string, ColumnSchema>;
  required: string[];
  additionalProperties: false;
};

type PipelineLanguage = {
  contractVersion: number;
  name: string;
  version: string;
  shape: string;
  datasets: PipelineDataset[];
};

type FrozenColumn = {
  name: string;
  type: string;
  nullable: boolean;
  required: boolean;
};

type PublicationEvidence = {
  connectSource: {
    repository: string;
    branch: string;
    commit: string;
    contractPath: string;
    contractSha256: string;
    schemaPath: string;
    schemaSha256: string;
  };
  transformCandidate: {
    repository: string;
    branch: string;
    commit: string;
    artifacts: Array<{ path: string; sha256: string }>;
  };
  datasets: Record<
    'run_manifest' | 'acquisition_records',
    { columns: FrozenColumn[]; required: string[] }
  >;
};

type MappingManifest = {
  contractVersion: number;
  id: string;
  version: string;
  status: string;
  engine: string;
  from: { name: string; version: string };
  to: { name: string; version: string };
  inputs: Array<{
    table: string;
    derivedDataset?: string;
    view: string;
    required: boolean;
    format: string;
    hydration?: {
      recordsTable: string;
      runManifestTable: string;
      maxArtifactBytes: number;
      maxTotalArtifactBytes: number;
      textContentTypes: string[];
      requireUtf8ForText: boolean;
      includeRoles: string[];
    };
  }>;
  documentExtraction: { configPath: string; configSha256: string };
  output: {
    shape: string;
    format: string;
    options: Record<string, unknown>;
  };
  outputs: Array<{
    dataset: string;
    dependsOn: string[];
    queryPath: string;
    querySha256: string;
    determinism: { status: string; runtimeFunctions: string[] };
  }>;
};

type ExtractionConfig = {
  contractVersion: number;
  id: string;
  version: string;
  sourceView: string;
  outputView: string;
  outputColumns: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
  rules: Array<{
    id: string;
    match: Record<string, unknown>;
    repeatSelector?: string;
    fields: Array<{
      name: string;
      value: { kind: string; name?: string };
      required: boolean;
    }>;
  }>;
  determinism: { status: string; runtimeFunctions: string[] };
};

type Scenario = {
  rawArtifactPrefix: string;
  runs: Array<{
    runId: string;
    requestId: string;
    address: string;
    recordCount: number;
  }>;
  acquisitions: Array<{
    acquisitionId: string;
    registrationId: string;
    publisherId: string;
    outcome: string;
    rawArtifacts: string[];
    robotsArtifact: string | null;
    discoveryArtifacts: string[];
  }>;
};

const transformRoot = path.resolve(process.cwd(), 'publish', 'pipelines', 'transform');
const sourceLanguagePath = path.join(
  transformRoot,
  'languages',
  'connect-http-acquisition',
  '1.0.0',
  'connect-http-acquisition.json'
);
const targetLanguagePath = path.join(
  transformRoot,
  'languages',
  'sale-availability-inference-input',
  '1.0.0',
  'sale-availability-inference-input.json'
);
const mappingRoot = path.join(
  transformRoot,
  'mappings',
  'connect-http-acquisition-to-sale-availability-inference-input',
  '1.0.0'
);
const fixturesRoot = path.join(mappingRoot, 'fixtures');
const sourceLanguage = readJson<PipelineLanguage>(sourceLanguagePath);
const targetLanguage = readJson<PipelineLanguage>(targetLanguagePath);
const manifest = readJson<MappingManifest>(path.join(mappingRoot, 'manifest.json'));
const extraction = readJson<ExtractionConfig>(
  path.join(mappingRoot, manifest.documentExtraction.configPath)
);
const evidence = readJson<PublicationEvidence>(
  path.resolve(
    process.cwd(),
    'tests',
    'fixtures',
    'pipelines',
    'connect-http-acquisition-1.0.0-publication.json'
  )
);
const scenario = readJson<Scenario>(path.join(fixturesRoot, 'scenario.json'));
const expected = readJson<Record<string, unknown>>(path.join(fixturesRoot, 'expected.json'));

const rawDocumentColumns = [
  'acquisitionId',
  'artifactOrdinal',
  'artifactRole',
  'registrationId',
  'publisherId',
  'sourceUrl',
  'sourceUri',
  'sha256',
  'contentType',
  'bodyText',
  'bodyLength',
];

const normalizedEvidenceColumns = [
  'contractVersion',
  'evidenceId',
  'acquisitionId',
  'operationRequestId',
  'runId',
  'requestId',
  'lookupAddress',
  'lookupCanonicalKey',
  'registrationId',
  'registrationVersion',
  'publisherId',
  'sourceUrl',
  'retrievedAt',
  'sourcePublishedAt',
  'httpStatus',
  'retrievalOutcome',
  'evidenceKind',
  'exactPropertyMatch',
  'indexCompletenessVerified',
  'listingStatus',
  'rawStatus',
  'askingPriceAmountMinor',
  'askingPriceCurrency',
  'askingPriceParseStatus',
  'mlsId',
  'evidenceExcerpt',
  'primaryRawArtifactUri',
  'primaryRawArtifactSha256',
  'provenanceJson',
  'acquisitionRecordSha256',
  'extractionJson',
];

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function dataset(language: PipelineLanguage, name: string): PipelineDataset {
  const match = language.datasets.find(candidate => candidate.type === name);
  expect(match, `${language.name}@${language.version}:${name}`).toBeDefined();
  return match!;
}

function columnType(column: ColumnSchema): {
  type: string;
  nullable: boolean;
} {
  const types = Array.isArray(column.type) ? column.type : [column.type];
  const nonNullTypes = types.filter(type => type !== 'null');
  expect(nonNullTypes).toHaveLength(1);
  return {
    type: nonNullTypes[0]!,
    nullable: types.includes('null'),
  };
}

describe('generic HTTP acquisition sale-availability publication', () => {
  it('matches the frozen Connect columns, types, and nullability', () => {
    expect(evidence.connectSource).toMatchObject({
      repository: 'https://github.com/elephant-xyz/connect',
      branch: 'feat/live-public-sale-availability-source',
      commit: '6c5f5855469d731a3cd65be6dd57465a4d2b24b0',
    });
    expect(sourceLanguage).toMatchObject({
      contractVersion: 2,
      name: 'connect-http-acquisition',
      version: '1.0.0',
      shape: 'tabular',
    });
    expect(sourceLanguage.datasets.map(candidate => candidate.type)).toEqual([
      'run_manifest',
      'acquisition_records',
      'raw_documents',
    ]);

    for (const datasetName of ['run_manifest', 'acquisition_records'] as const) {
      const published = dataset(sourceLanguage, datasetName);
      const frozen = evidence.datasets[datasetName];
      expect(Object.keys(published.properties)).toEqual(frozen.columns.map(column => column.name));
      expect(published.required).toEqual(frozen.required);
      for (const expectedColumn of frozen.columns) {
        const actual = published.properties[expectedColumn.name];
        expect(actual, `${datasetName}.${expectedColumn.name}`).toBeDefined();
        expect(columnType(actual!)).toEqual({
          type: expectedColumn.type,
          nullable: expectedColumn.nullable,
        });
        expect(published.required.includes(expectedColumn.name)).toBe(expectedColumn.required);
      }
    }
    expect(evidence.datasets.acquisition_records.columns).toHaveLength(38);

    const rawDocuments = dataset(sourceLanguage, 'raw_documents');
    expect(Object.keys(rawDocuments.properties)).toEqual(rawDocumentColumns);
    expect(rawDocuments.required).toEqual(rawDocumentColumns);
  });

  it('pins every Transform candidate artifact digest', () => {
    expect(evidence.transformCandidate).toMatchObject({
      repository: 'https://github.com/elephant-xyz/transform',
      branch: 'feat/sale-availability-transform-a',
      commit: '19a010b1c8888fe6f5091f863442c86f6fc0a09b',
    });

    const expectedDigests = new Map(
      evidence.transformCandidate.artifacts.map(artifact => [artifact.path, artifact.sha256])
    );
    expect(expectedDigests).toEqual(
      new Map([
        [
          'languages/connect-http-acquisition/1.0.0/connect-http-acquisition.json',
          'aa54e5f2892529a737e181cd55f68cedafd8c5e4f66b97579cae8e737143e72b',
        ],
        [
          'languages/sale-availability-inference-input/1.0.0/sale-availability-inference-input.json',
          '2456f6afdf0ca417976337e39230753191f32f57405cb5273da6141c3fc91da6',
        ],
        [
          'mappings/connect-http-acquisition-to-sale-availability-inference-input/1.0.0/manifest.json',
          '0a66c362f06f413afa2746a818a4e395877fd921121ec3763b45174a9f51d8f7',
        ],
        [
          'mappings/connect-http-acquisition-to-sale-availability-inference-input/1.0.0/extraction/document-extraction.json',
          'c85ae7d110e7510ac85d4b23488b767754aa5349de8ea4b3138abe8283bfe659',
        ],
        [
          'mappings/connect-http-acquisition-to-sale-availability-inference-input/1.0.0/queries/normalized_evidence.sql',
          '9a804bc32f13d1e9af65dd50b74e5c92c560ad4bc85ff3d2d2e6c30d5cb64950',
        ],
        [
          'mappings/connect-http-acquisition-to-sale-availability-inference-input/1.0.0/queries/inference_candidates.sql',
          '0ca36e41b8ebfe22460ac314b0246babe6820f0b1f38ebc9b830dbec749c5833',
        ],
      ])
    );

    for (const [artifactPath, digest] of expectedDigests) {
      expect(sha256(path.join(transformRoot, artifactPath)), artifactPath).toBe(digest);
    }
  });

  it('keeps Connect generic and assigns business semantics to Transform', () => {
    const acquisitionProperties = dataset(sourceLanguage, 'acquisition_records').properties;
    for (const businessField of [
      'evidenceKind',
      'exactPropertyMatch',
      'indexCompletenessVerified',
      'listingStatus',
      'askingPriceAmountMinor',
      'askingPriceCurrency',
      'askingPriceParseStatus',
      'mlsId',
    ]) {
      expect(acquisitionProperties).not.toHaveProperty(businessField);
    }
    for (const canonicalJsonField of [
      'contextJson',
      'inputJson',
      'requestHeaderNamesJson',
      'redirectChainJson',
      'paginationUrlsJson',
      'provenanceJson',
      'sourceRecordJson',
    ]) {
      expect(acquisitionProperties[canonicalJsonField]?.format).toBe('canonical-json');
    }

    expect(manifest).toMatchObject({
      contractVersion: 2,
      id: 'connect-http-acquisition-to-sale-availability-inference-input',
      version: '1.0.0',
      status: 'ENABLED',
      engine: 'spark-sql',
      from: { name: 'connect-http-acquisition', version: '1.0.0' },
      to: { name: 'sale-availability-inference-input', version: '1.0.0' },
      output: {
        shape: 'tabular',
        format: 'jsonl',
        options: { ignoreNullFields: false },
      },
    });
    expect(manifest.inputs.map(input => input.table)).toEqual([
      'run_manifest',
      'acquisition_records',
      'raw_artifacts',
    ]);
    expect(manifest.inputs[2]).toMatchObject({
      derivedDataset: 'raw_documents',
      view: 'source_raw_documents',
      required: true,
      format: 'raw-artifacts',
      hydration: {
        recordsTable: 'acquisition_records',
        runManifestTable: 'run_manifest',
        maxArtifactBytes: 1_048_576,
        maxTotalArtifactBytes: 4_194_304,
        requireUtf8ForText: true,
        includeRoles: ['raw', 'robots', 'discovery'],
      },
    });

    expect(extraction).toMatchObject({
      contractVersion: 1,
      id: 'sale-availability-html-extraction',
      version: '1.0.0',
      sourceView: 'source_raw_documents',
      outputView: 'source_html_extracts',
      determinism: { status: 'DETERMINISTIC', runtimeFunctions: [] },
    });
    expect(extraction.outputColumns.map(column => column.name)).toEqual([
      'unit',
      'priceMajor',
      'mlsId',
      'rawStatus',
      'indexComplete',
      'listedCount',
    ]);
    expect(sha256(path.join(mappingRoot, manifest.documentExtraction.configPath))).toBe(
      manifest.documentExtraction.configSha256
    );

    const normalizedSql = readFileSync(
      path.join(mappingRoot, 'queries', 'normalized_evidence.sql'),
      'utf8'
    );
    for (const ownedLogic of [
      'GET_JSON_OBJECT',
      'REGEXP_EXTRACT',
      'exactPropertyMatchValue',
      'indexCompleteValue',
      'evidenceKindValue',
      'listingStatusValue',
      'priceMinorValue',
      'mlsId',
    ]) {
      expect(normalizedSql).toContain(ownedLogic);
    }
    expect(normalizedSql).toContain('priceMajor * 100');
    expect(normalizedSql).toContain("'complete_index_absence'");
  });

  it('publishes deterministic normalized evidence and candidate selection', () => {
    expect(targetLanguage).toMatchObject({
      name: 'sale-availability-inference-input',
      version: '1.0.0',
    });
    expect(targetLanguage.datasets.map(candidate => candidate.type)).toEqual([
      'normalized_evidence',
      'inference_candidates',
    ]);
    for (const datasetName of ['normalized_evidence', 'inference_candidates']) {
      const published = dataset(targetLanguage, datasetName);
      expect(Object.keys(published.properties)).toEqual(normalizedEvidenceColumns);
      expect(published.required).toEqual(normalizedEvidenceColumns);
    }

    expect(manifest.outputs.map(output => output.dataset)).toEqual([
      'normalized_evidence',
      'inference_candidates',
    ]);
    expect(manifest.outputs[1]?.dependsOn).toEqual(['normalized_evidence']);
    for (const output of manifest.outputs) {
      expect(output.determinism).toEqual({
        status: 'DETERMINISTIC',
        runtimeFunctions: [],
      });
      expect(sha256(path.join(mappingRoot, output.queryPath))).toBe(output.querySha256);
    }

    const candidateSql = readFileSync(
      path.join(mappingRoot, 'queries', 'inference_candidates.sql'),
      'utf8'
    );
    expect(candidateSql).toContain('FROM target_normalized_evidence');
    expect(candidateSql).toContain("retrievalOutcome = 'SUCCESS'");
    expect(candidateSql).toContain("evidenceKind = 'exact_listing'");
    expect(candidateSql).toContain('exactPropertyMatch = TRUE');
  });

  it('replaces stale fixtures with the generic acquisition scenario', () => {
    expect(scenario.rawArtifactPrefix).toMatch(/^s3:\/\//u);
    expect(scenario.runs).toHaveLength(2);
    expect(scenario.runs.reduce((total, run) => total + run.recordCount, 0)).toBe(6);
    expect(scenario.acquisitions).toHaveLength(6);
    expect(
      scenario.acquisitions.find(acquisition => acquisition.publisherId === 'blocked-publisher')
    ).toMatchObject({ outcome: 'BLOCKED' });
    expect(expected).toMatchObject({
      normalizedEvidenceCount: 6,
      inferenceCandidateCount: 2,
      candidatePublishers: ['discover-homes-miami', 'sunny-realty'],
      candidateSignal: {
        listingStatus: 'for_sale',
        askingPriceAmountMinor: 44_500_000,
        askingPriceCurrency: 'USD',
        mlsId: 'A12076063',
      },
    });

    expect(readFileSync(path.join(fixturesRoot, 'raw', 'discover-page-1.html'), 'utf8')).toContain(
      'data-index-complete="true"'
    );
    expect(readFileSync(path.join(fixturesRoot, 'raw', 'sunny-unit-901.html'), 'utf8')).toContain(
      'data-price="445000"'
    );
    expect(readFileSync(path.join(fixturesRoot, 'raw', 'brave-search-516.json'), 'utf8')).toContain(
      '"bad_results": true'
    );
  });

  it('removes every obsolete sale-specific Connect publication reference', () => {
    expect(
      existsSync(path.join(transformRoot, 'languages', 'connect-sale-availability-evidence'))
    ).toBe(false);
    expect(
      existsSync(
        path.join(
          transformRoot,
          'mappings',
          'connect-sale-availability-evidence-to-sale-availability-inference-input'
        )
      )
    ).toBe(false);
    expect(readFileSync(path.join(transformRoot, 'catalog.json'), 'utf8')).not.toContain(
      'connect-sale-availability-evidence'
    );
  });
});
