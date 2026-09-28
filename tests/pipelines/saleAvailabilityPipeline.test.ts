import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { canonicalize } from 'json-canonicalize';
import { describe, expect, it } from 'vitest';

type ColumnSchema = {
  type: string | string[];
  const?: unknown;
  enum?: unknown[];
  format?: string;
  properties?: Record<string, ColumnSchema>;
  required?: string[];
  additionalProperties?: false | ColumnSchema;
  items?: ColumnSchema;
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

type PublicationEvidence = {
  connectSource: {
    repository: string;
    branch: string;
    commit: string;
    files: Array<{ path: string; sha256: string }>;
  };
  transformCandidate: {
    repository: string;
    branch: string;
    commit: string;
    catalogSha256: string;
    artifacts: Array<{ path: string; sha256: string }>;
  };
  bundleFixture: {
    path: string;
    sha256: string;
    contentSha256: string;
    acquisitionCount: number;
  };
};

type BundleAdapter = {
  bundleDataset: string;
  runDataset: string;
  runView: string;
  recordsDataset: string;
  recordsView: string;
  rawDocumentsDataset: string;
  rawDocumentsView: string;
  maxBundleBytes: number;
  maxArtifactBytes: number;
  maxTotalArtifactBytes: number;
  textContentTypes: string[];
  requireUtf8ForText: boolean;
  includeRoles: string[];
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
    derivedDataset: string;
    view: string;
    required: boolean;
    format: string;
    bundle: BundleAdapter;
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

type Artifact = { s3Uri: string; sha256: string };

type BundleAcquisition = {
  acquisitionId: string;
  source: {
    publisherId: string;
    domain: string | null;
    sourceUrl: string | null;
  };
  provenance: {
    rawArtifact: Artifact | null;
    rawArtifacts: Artifact[];
    robotsArtifact: Artifact | null;
    discoveryArtifacts: Artifact[];
  };
};

type AcquisitionBundle = {
  contractVersion: number;
  runId: string;
  requestId: string;
  contextJson: string;
  requestArtifact: Artifact;
  registryArtifact: Artifact;
  acquisitions: BundleAcquisition[];
  recordCount: number;
  contentSha256: string;
  [key: string]: unknown;
};

type Scenario = {
  rawArtifactPrefix: string;
  runs: Array<{
    runId: string;
    requestId: string;
    addresses: string[];
    recordCount: number;
  }>;
  acquisitions: Array<{
    acquisitionId: string;
    registrationId: string;
    publisherId: string;
    outcome: string;
  }>;
};

const transformRoot = path.resolve(process.cwd(), 'publish', 'pipelines', 'transform');
const sourceLanguagePath = path.join(
  transformRoot,
  'languages',
  'connect-http-acquisition-bundle',
  '1.0.0',
  'connect-http-acquisition-bundle.json'
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
  'connect-http-acquisition-bundle-to-sale-availability-inference-input',
  '1.0.0'
);
const fixturesRoot = path.join(mappingRoot, 'fixtures');
const objectStoreRoot = path.join(fixturesRoot, 'object-store');
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
    'connect-http-acquisition-bundle-1.0.0-publication.json'
  )
);
const scenario = readJson<Scenario>(path.join(fixturesRoot, 'scenario.json'));
const expected = readJson<Record<string, unknown>>(path.join(fixturesRoot, 'expected.json'));
const bundlePath = path.resolve(process.cwd(), evidence.bundleFixture.path);
const bundle = readJson<AcquisitionBundle>(bundlePath);

const runContextColumns = [
  'contractVersion',
  'runId',
  'requestId',
  'startedAt',
  'completedAt',
  'status',
  'contextJson',
  'contextSha256',
  'requestArtifactUri',
  'requestArtifactSha256',
  'registryArtifactUri',
  'registryArtifactSha256',
  'registryVersion',
  'recordCount',
  'outcomeCountsJson',
  'publisherCountsJson',
  'rawArtifactPrefix',
  'contentSha256',
];

const acquisitionRecordColumns = [
  'contractVersion',
  'acquisitionId',
  'operationRequestId',
  'runId',
  'requestId',
  'operationId',
  'registrationId',
  'registrationVersion',
  'contextJson',
  'contextSha256',
  'inputJson',
  'inputSha256',
  'publisherId',
  'domain',
  'sourceUrl',
  'method',
  'requestHeaderNamesJson',
  'requestQuerySha256',
  'requestBodySha256',
  'retrievedAt',
  'sourcePublishedAt',
  'httpStatus',
  'contentType',
  'contentLength',
  'outcome',
  'attempts',
  'failureCode',
  'primaryRawArtifactUri',
  'primaryRawArtifactSha256',
  'rawArtifactCount',
  'robotsArtifactUri',
  'robotsArtifactSha256',
  'parentAcquisitionId',
  'redirectChainJson',
  'paginationUrlsJson',
  'provenanceJson',
  'sourceRecordJson',
  'sourceRecordSha256',
];

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

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function dataset(language: PipelineLanguage, name: string): PipelineDataset {
  const match = language.datasets.find(candidate => candidate.type === name);
  expect(match, `${language.name}@${language.version}:${name}`).toBeDefined();
  return match!;
}

function rowValidator(schema: PipelineDataset): ValidateFunction {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  ajv.addFormat('canonical-json', {
    type: 'string',
    validate(value: string): boolean {
      try {
        return canonicalize(JSON.parse(value)) === value;
      } catch {
        return false;
      }
    },
  });
  return ajv.compile({
    type: 'object',
    properties: schema.properties,
    required: schema.required,
    additionalProperties: schema.additionalProperties,
  });
}

function assertNestedColumnIsStrict(column: ColumnSchema): void {
  const types = Array.isArray(column.type) ? column.type : [column.type];
  if (types.includes('object')) {
    expect(
      column.properties !== undefined ||
        (typeof column.additionalProperties === 'object' && column.additionalProperties !== null)
    ).toBe(true);
    if (column.properties !== undefined) {
      expect(column.required).toBeDefined();
      expect(column.additionalProperties).toBe(false);
      for (const required of column.required ?? []) {
        expect(column.properties).toHaveProperty(required);
      }
      for (const nested of Object.values(column.properties)) {
        assertNestedColumnIsStrict(nested);
      }
    } else if (
      typeof column.additionalProperties === 'object' &&
      column.additionalProperties !== null
    ) {
      assertNestedColumnIsStrict(column.additionalProperties);
    }
  }
  if (types.includes('array')) {
    expect(column.items).toBeDefined();
    assertNestedColumnIsStrict(column.items!);
  }
}

function fixturePathForUri(s3Uri: string): string {
  const uri = new URL(s3Uri);
  return path.join(objectStoreRoot, uri.hostname, uri.pathname.slice(1));
}

function allBundleArtifacts(value: AcquisitionBundle): Artifact[] {
  return [
    value.requestArtifact,
    value.registryArtifact,
    ...value.acquisitions.flatMap(acquisition => [
      ...(acquisition.provenance.rawArtifact === null ? [] : [acquisition.provenance.rawArtifact]),
      ...acquisition.provenance.rawArtifacts,
      ...(acquisition.provenance.robotsArtifact === null
        ? []
        : [acquisition.provenance.robotsArtifact]),
      ...acquisition.provenance.discoveryArtifacts,
    ]),
  ];
}

describe('single acquisition bundle sale-availability publication', () => {
  it('publishes a strict nested AcquisitionBundle language', () => {
    expect(sourceLanguage).toMatchObject({
      contractVersion: 2,
      name: 'connect-http-acquisition-bundle',
      version: '1.0.0',
      shape: 'tabular',
    });
    expect(sourceLanguage.datasets.map(candidate => candidate.type)).toEqual([
      'run_context',
      'acquisition_bundle',
      'acquisition_records',
      'raw_documents',
    ]);
    expect(Object.keys(dataset(sourceLanguage, 'run_context').properties)).toEqual(
      runContextColumns
    );
    expect(Object.keys(dataset(sourceLanguage, 'acquisition_records').properties)).toEqual(
      acquisitionRecordColumns
    );
    expect(Object.keys(dataset(sourceLanguage, 'raw_documents').properties)).toEqual(
      rawDocumentColumns
    );

    const bundleDataset = dataset(sourceLanguage, 'acquisition_bundle');
    expect(bundleDataset.required).toEqual(Object.keys(bundleDataset.properties));
    for (const column of Object.values(bundleDataset.properties)) {
      assertNestedColumnIsStrict(column);
    }

    const validateBundle = rowValidator(bundleDataset);
    expect(validateBundle(bundle), JSON.stringify(validateBundle.errors)).toBe(true);

    const extraProperty = { ...bundle, unexpected: true };
    expect(validateBundle(extraProperty)).toBe(false);

    const missingNestedRequired = JSON.parse(JSON.stringify(bundle)) as AcquisitionBundle;
    delete missingNestedRequired.acquisitions[0]!.source.publisherId;
    expect(validateBundle(missingNestedRequired)).toBe(false);
  });

  it('pins and verifies the canonical bundle and raw artifact fixture', () => {
    expect(evidence.bundleFixture).toMatchObject({
      sha256: '917945262ffaa65c49511ba5914545848251a4a083ea3d3322ae7ed81a07ec62',
      contentSha256: 'f4e7fdc8c6d7d5b476fce9899e627e5478c64703b86076363d7586ab62dd2c59',
      acquisitionCount: 4,
    });
    expect(sha256(bundlePath)).toBe(evidence.bundleFixture.sha256);
    expect(bundle.acquisitions).toHaveLength(bundle.recordCount);
    const { contentSha256, ...content } = bundle;
    expect(sha256Text(canonicalize(content))).toBe(contentSha256);

    for (const artifact of allBundleArtifacts(bundle)) {
      const artifactPath = fixturePathForUri(artifact.s3Uri);
      expect(existsSync(artifactPath), artifact.s3Uri).toBe(true);
      expect(sha256(artifactPath), artifact.s3Uri).toBe(artifact.sha256);
    }
  });

  it('pins every Transform candidate artifact digest', () => {
    expect(evidence.transformCandidate).toMatchObject({
      repository: 'https://github.com/elephant-xyz/transform',
      branch: 'feat/sale-availability-transform-a',
      commit: '8d7e9b94a8142b278d3378b46373db5531d1d64f',
      catalogSha256: '1f82e2a5cc8369c0cd885878de223353e816c83a00d951105f96b5937bf4839d',
    });
    const expectedDigests = new Map(
      evidence.transformCandidate.artifacts.map(artifact => [artifact.path, artifact.sha256])
    );
    expect(expectedDigests).toEqual(
      new Map([
        [
          'languages/connect-http-acquisition-bundle/1.0.0/connect-http-acquisition-bundle.json',
          '0c3565b0c1f44061670d05138582e96e4e478f4de746980229c21e1b9830f440',
        ],
        [
          'languages/sale-availability-inference-input/1.0.0/sale-availability-inference-input.json',
          '2456f6afdf0ca417976337e39230753191f32f57405cb5273da6141c3fc91da6',
        ],
        [
          'mappings/connect-http-acquisition-bundle-to-sale-availability-inference-input/1.0.0/manifest.json',
          '0312fc90fdbaf03f813122d13501104eb5669704410a4d31e1c4b8ee7c422f96',
        ],
        [
          'mappings/connect-http-acquisition-bundle-to-sale-availability-inference-input/1.0.0/extraction/document-extraction.json',
          'c85ae7d110e7510ac85d4b23488b767754aa5349de8ea4b3138abe8283bfe659',
        ],
        [
          'mappings/connect-http-acquisition-bundle-to-sale-availability-inference-input/1.0.0/queries/normalized_evidence.sql',
          '20e4d76a07493df8ae47049920ac868b6b882b02c0679edaa3edfabd5318983e',
        ],
        [
          'mappings/connect-http-acquisition-bundle-to-sale-availability-inference-input/1.0.0/queries/inference_candidates.sql',
          '0ca36e41b8ebfe22460ac314b0246babe6820f0b1f38ebc9b830dbec749c5833',
        ],
      ])
    );
    for (const [artifactPath, digest] of expectedDigests) {
      expect(sha256(path.join(transformRoot, artifactPath)), artifactPath).toBe(digest);
    }
  });

  it('uses exactly one mapping-owned acquisition-bundle input', () => {
    expect(manifest).toMatchObject({
      contractVersion: 2,
      id: 'connect-http-acquisition-bundle-to-sale-availability-inference-input',
      version: '1.0.0',
      status: 'ENABLED',
      engine: 'spark-sql',
      from: { name: 'connect-http-acquisition-bundle', version: '1.0.0' },
      to: { name: 'sale-availability-inference-input', version: '1.0.0' },
      output: {
        shape: 'tabular',
        format: 'jsonl',
        options: { ignoreNullFields: false },
      },
    });
    expect(manifest.inputs).toHaveLength(1);
    expect(manifest.inputs[0]).toMatchObject({
      table: 'acquisition_bundle',
      derivedDataset: 'acquisition_records',
      view: 'source_acquisition_records',
      required: true,
      format: 'acquisition-bundle',
      bundle: {
        bundleDataset: 'acquisition_bundle',
        runDataset: 'run_context',
        runView: 'source_run_context',
        recordsDataset: 'acquisition_records',
        recordsView: 'source_acquisition_records',
        rawDocumentsDataset: 'raw_documents',
        rawDocumentsView: 'source_raw_documents',
        maxBundleBytes: 5_242_880,
        maxArtifactBytes: 1_048_576,
        maxTotalArtifactBytes: 4_194_304,
        requireUtf8ForText: true,
        includeRoles: ['raw', 'robots', 'discovery'],
      },
    });
    expect(manifest.inputs.map(input => input.table)).not.toEqual([
      'run_context',
      'acquisition_records',
      'raw_documents',
    ]);

    expect(extraction).toMatchObject({
      contractVersion: 1,
      id: 'sale-availability-html-extraction',
      version: '1.0.0',
      sourceView: 'source_raw_documents',
      outputView: 'source_html_extracts',
      determinism: { status: 'DETERMINISTIC', runtimeFunctions: [] },
    });
    expect(sha256(path.join(mappingRoot, manifest.documentExtraction.configPath))).toBe(
      manifest.documentExtraction.configSha256
    );
  });

  it('keeps Connect transport-only and business logic in Transform SQL', () => {
    const businessFields = [
      'evidenceKind',
      'exactPropertyMatch',
      'indexCompletenessVerified',
      'listingStatus',
      'askingPriceAmountMinor',
      'askingPriceCurrency',
      'askingPriceParseStatus',
      'mlsId',
    ];
    const sourceText = readFileSync(sourceLanguagePath, 'utf8');
    for (const businessField of businessFields) {
      expect(dataset(sourceLanguage, 'acquisition_bundle').properties).not.toHaveProperty(
        businessField
      );
      expect(sourceText).not.toMatch(new RegExp(`"${businessField}"\\s*:`, 'u'));
    }

    const normalizedSql = readFileSync(
      path.join(mappingRoot, 'queries', 'normalized_evidence.sql'),
      'utf8'
    );
    for (const ownedLogic of [
      'GET_JSON_OBJECT',
      'FROM_JSON',
      'EXPLODE',
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
    expect(targetLanguage.datasets.map(candidate => candidate.type)).toEqual([
      'normalized_evidence',
      'inference_candidates',
    ]);
    for (const datasetName of ['normalized_evidence', 'inference_candidates']) {
      const published = dataset(targetLanguage, datasetName);
      expect(Object.keys(published.properties)).toEqual(normalizedEvidenceColumns);
      expect(published.required).toEqual(normalizedEvidenceColumns);
    }
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

  it('publishes the final bundle scenario and expected outcomes', () => {
    expect(scenario.runs).toHaveLength(1);
    expect(scenario.runs[0]).toMatchObject({
      runId: 'http-run-901',
      recordCount: 4,
    });
    expect(scenario.runs[0]?.addresses).toHaveLength(2);
    expect(scenario.acquisitions).toHaveLength(4);
    expect(
      scenario.acquisitions.find(acquisition => acquisition.publisherId === 'blocked-publisher')
    ).toMatchObject({ outcome: 'BLOCKED' });
    expect(expected).toMatchObject({
      normalizedEvidenceCount: 8,
      inferenceCandidateCount: 2,
      candidatePublishers: ['discover-homes-miami', 'sunny-realty'],
      candidateSignal: {
        listingStatus: 'for_sale',
        askingPriceAmountMinor: 44_500_000,
        askingPriceCurrency: 'USD',
        mlsId: 'A12076063',
      },
    });
  });

  it('removes all obsolete flat acquisition publication references', () => {
    for (const obsoletePath of [
      path.join(transformRoot, 'languages', 'connect-http-acquisition'),
      path.join(
        transformRoot,
        'mappings',
        'connect-http-acquisition-to-sale-availability-inference-input'
      ),
    ]) {
      expect(existsSync(obsoletePath), obsoletePath).toBe(false);
    }
    const catalogText = readFileSync(path.join(transformRoot, 'catalog.json'), 'utf8');
    expect(catalogText).not.toMatch(/"name": "connect-http-acquisition"/u);
    expect(catalogText).not.toContain(
      'connect-http-acquisition-to-sale-availability-inference-input'
    );
  });
});
