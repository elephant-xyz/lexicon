import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { canonicalize } from 'json-canonicalize';
import { describe, expect, it } from 'vitest';

type ColumnSchema = {
  type: string | string[];
  const?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  format?: string;
};

type PipelineDataset = {
  type: string;
  properties: Record<string, ColumnSchema>;
  required: string[];
  additionalProperties: false;
  allOf?: object[];
};

type PipelineLanguage = {
  name: string;
  version: string;
  datasets: PipelineDataset[];
};

type FrozenColumn = {
  name: string;
  type: string;
  nullable: boolean;
  required: boolean;
};

type FrozenColumnContract = {
  source: {
    repository: string;
    branch: string;
    commit: string;
    contractPath: string;
    contractSha256: string;
    schemaPath: string;
    schemaSha256: string;
  };
  datasets: Record<
    'run_manifest' | 'evidence_records',
    { columns: FrozenColumn[]; required: string[] }
  >;
};

type FixtureCases = {
  source: { repository: string; branch: string; commit: string };
  cases: Array<{
    name: string;
    evidenceId: string;
    candidateEligible: boolean;
  }>;
  invalid: Array<{ name: string; path: string; expected: string }>;
};

type MappingManifest = {
  id: string;
  version: string;
  engine: string;
  inputs: Array<{
    table: string;
    format: string;
    options?: Record<string, unknown>;
  }>;
  output: {
    shape: string;
    format: string;
    options?: Record<string, unknown>;
  };
  outputs: Array<{
    dataset: string;
    dependsOn: string[];
    queryPath: string;
    querySha256: string;
    determinism: {
      status: string;
      runtimeFunctions: string[];
    };
  }>;
};

const sourceCommit = 'a4f94fe88d82dcc2dca2391acb0cc8deda105d54';
const transformRoot = path.resolve(process.cwd(), 'publish', 'pipelines', 'transform');
const sourceLanguagePath = path.join(
  transformRoot,
  'languages',
  'connect-sale-availability-evidence',
  '2.0.0',
  'connect-sale-availability-evidence.json'
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
  'connect-sale-availability-evidence-to-sale-availability-inference-input',
  '1.0.0'
);
const fixturesRoot = path.join(mappingRoot, 'fixtures');

const sourceLanguage = readJson<PipelineLanguage>(sourceLanguagePath);
const targetLanguage = readJson<PipelineLanguage>(targetLanguagePath);
const frozenColumns = readJson<FrozenColumnContract>(
  path.resolve(
    process.cwd(),
    'tests',
    'fixtures',
    'pipelines',
    'connect-sale-availability-evidence-2.0.0-columns.json'
  )
);
const fixtureCases = readJson<FixtureCases>(path.join(fixturesRoot, 'cases.json'));
const manifest = readJson<MappingManifest>(path.join(mappingRoot, 'manifest.json'));

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function readJsonl(filePath: string): Array<Record<string, unknown>> {
  const raw = readFileSync(filePath, 'utf8');
  expect(raw.endsWith('\n'), `${filePath} must end with a newline`).toBe(true);
  return raw
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as Record<string, unknown>);
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
    ...(schema.allOf === undefined ? {} : { allOf: schema.allOf }),
  });
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

function isInferenceCandidate(row: Record<string, unknown>): boolean {
  return (
    row.retrievalOutcome === 'SUCCESS' &&
    row.evidenceKind === 'exact_listing' &&
    row.exactPropertyMatch === true
  );
}

describe('sale-availability pipeline publication', () => {
  it('matches the checked-in Connect v2 columns, types, and nullability', () => {
    expect(frozenColumns.source).toMatchObject({
      repository: 'https://github.com/elephant-xyz/connect',
      branch: 'feat/live-public-sale-availability-source',
      commit: sourceCommit,
    });
    expect(sourceLanguage).toMatchObject({
      name: 'connect-sale-availability-evidence',
      version: '2.0.0',
    });

    for (const datasetName of ['run_manifest', 'evidence_records'] as const) {
      const published = dataset(sourceLanguage, datasetName);
      const frozen = frozenColumns.datasets[datasetName];
      expect(Object.keys(published.properties)).toEqual(frozen.columns.map(column => column.name));
      expect(published.required).toEqual(frozen.required);

      for (const expected of frozen.columns) {
        const actual = published.properties[expected.name];
        expect(actual, `${datasetName}.${expected.name}`).toBeDefined();
        expect(columnType(actual!)).toEqual({
          type: expected.type,
          nullable: expected.nullable,
        });
        expect(published.required.includes(expected.name)).toBe(expected.required);
      }
    }

    const evidence = dataset(sourceLanguage, 'evidence_records');
    expect(evidence.properties.askingPriceAmountMinor).toMatchObject({
      type: ['integer', 'null'],
      minimum: 1,
      maximum: Number.MAX_SAFE_INTEGER,
    });
    expect(evidence.properties.askingPriceCurrency.enum).toEqual(['USD', null]);
    expect(evidence.properties.evidenceFieldsJson.format).toBe('canonical-json');
    expect(evidence.properties.provenanceJson.format).toBe('canonical-json');
    expect(evidence.properties.sourceRecordJson.format).toBe('canonical-json');
  });

  it('validates the frozen source and deterministic target fixtures', () => {
    const runManifestRows = readJsonl(path.join(fixturesRoot, 'input', 'run_manifest.jsonl'));
    const evidenceRows = readJsonl(path.join(fixturesRoot, 'input', 'evidence_records.jsonl'));
    const normalizedRows = readJsonl(
      path.join(fixturesRoot, 'expected', 'normalized_evidence.jsonl')
    );
    const candidateRows = readJsonl(
      path.join(fixturesRoot, 'expected', 'inference_candidates.jsonl')
    );

    const validateRunManifest = rowValidator(dataset(sourceLanguage, 'run_manifest'));
    const validateEvidence = rowValidator(dataset(sourceLanguage, 'evidence_records'));
    const validateNormalized = rowValidator(dataset(targetLanguage, 'normalized_evidence'));
    const validateCandidate = rowValidator(dataset(targetLanguage, 'inference_candidates'));

    expect(runManifestRows).toHaveLength(1);
    expect(
      validateRunManifest(runManifestRows[0]),
      JSON.stringify(validateRunManifest.errors)
    ).toBe(true);
    expect(runManifestRows[0]?.recordCount).toBe(evidenceRows.length);

    for (const row of evidenceRows) {
      expect(
        validateEvidence(row),
        `${String(row.evidenceId)}: ${JSON.stringify(validateEvidence.errors)}`
      ).toBe(true);
      expect(Object.values(row).every(value => value === null || typeof value !== 'object')).toBe(
        true
      );
      for (const field of ['evidenceFieldsJson', 'provenanceJson', 'sourceRecordJson']) {
        const value = row[field];
        expect(typeof value).toBe('string');
        expect(canonicalize(JSON.parse(value as string))).toBe(value);
      }
      expect(sha256Text(row.sourceRecordJson as string)).toBe(row.sourceRecordSha256);
    }

    expect(normalizedRows).toEqual(evidenceRows);
    for (const row of normalizedRows) {
      expect(
        validateNormalized(row),
        `${String(row.evidenceId)}: ${JSON.stringify(validateNormalized.errors)}`
      ).toBe(true);
    }

    const expectedCandidateIds = fixtureCases.cases
      .filter(fixture => fixture.candidateEligible)
      .map(fixture => fixture.evidenceId);
    expect(candidateRows.map(row => row.evidenceId)).toEqual(expectedCandidateIds);
    expect(evidenceRows.filter(isInferenceCandidate).map(row => row.evidenceId)).toEqual(
      expectedCandidateIds
    );
    for (const row of candidateRows) {
      expect(
        validateCandidate(row),
        `${String(row.evidenceId)}: ${JSON.stringify(validateCandidate.errors)}`
      ).toBe(true);
    }
    for (const row of evidenceRows.filter(candidate => !isInferenceCandidate(candidate))) {
      expect(validateCandidate(row), String(row.evidenceId)).toBe(false);
    }
  });

  it('covers price rejection and candidate inclusion boundaries', () => {
    const evidenceRows = readJsonl(path.join(fixturesRoot, 'input', 'evidence_records.jsonl'));
    const byId = new Map(evidenceRows.map(row => [row.evidenceId, row]));
    const fixture = (name: string): Record<string, unknown> => {
      const selected = fixtureCases.cases.find(candidate => candidate.name === name);
      expect(selected, name).toBeDefined();
      const row = byId.get(selected!.evidenceId);
      expect(row, name).toBeDefined();
      return row!;
    };

    expect(fixture('exact_for_sale_with_price')).toMatchObject({
      listingStatus: 'for_sale',
      askingPriceAmountMinor: 59_930_000,
      askingPriceCurrency: 'USD',
      askingPriceParseStatus: 'parsed',
    });
    expect(fixture('malformed_price_rejected')).toMatchObject({
      evidenceKind: 'exact_listing',
      exactPropertyMatch: true,
      listingStatus: 'for_sale',
      askingPriceAmountMinor: null,
      askingPriceCurrency: null,
      askingPriceParseStatus: 'rejected',
    });
    expect(fixture('complete_index_not_listed')).toMatchObject({
      evidenceKind: 'complete_index_absence',
      exactPropertyMatch: false,
      listingStatus: 'not_listed',
      askingPriceAmountMinor: null,
      askingPriceCurrency: null,
    });
    expect(fixture('blocked_retrieval')).toMatchObject({
      retrievalOutcome: 'BLOCKED',
      evidenceKind: 'retrieval_failure',
      exactPropertyMatch: null,
    });
    expect(fixture('discovery_only')).toMatchObject({
      retrievalOutcome: 'SUCCESS',
      evidenceKind: 'discovery_only',
      exactPropertyMatch: null,
    });

    const invalidRows = readJsonl(path.join(fixturesRoot, fixtureCases.invalid[0]!.path));
    const validateEvidence = rowValidator(dataset(sourceLanguage, 'evidence_records'));
    expect(validateEvidence(invalidRows[0])).toBe(false);
    expect(JSON.stringify(validateEvidence.errors)).toMatch(/minimum/u);
  });

  it('pins deterministic JSONL mapping SQL and target dataset dependencies', () => {
    expect(manifest).toMatchObject({
      id: 'connect-sale-availability-evidence-to-sale-availability-inference-input',
      version: '1.0.0',
      engine: 'spark-sql',
      output: {
        shape: 'tabular',
        format: 'jsonl',
        options: { ignoreNullFields: false },
      },
    });
    expect(manifest.inputs.map(input => input.format)).toEqual(['jsonl', 'jsonl']);
    expect(manifest.outputs.map(output => output.dataset)).toEqual([
      'normalized_evidence',
      'inference_candidates',
    ]);
    expect(manifest.outputs[1]?.dependsOn).toEqual(['normalized_evidence']);

    const nondeterministicFunction =
      /\b(?:current_date|current_timestamp|now|rand|random|uuid)\s*\(/iu;
    for (const output of manifest.outputs) {
      expect(output.determinism).toEqual({
        status: 'DETERMINISTIC',
        runtimeFunctions: [],
      });
      const queryPath = path.join(mappingRoot, output.queryPath);
      expect(sha256File(queryPath)).toBe(output.querySha256);
      expect(readFileSync(queryPath, 'utf8')).not.toMatch(nondeterministicFunction);
    }

    const normalizedSql = readFileSync(
      path.join(mappingRoot, manifest.outputs[0]!.queryPath),
      'utf8'
    );
    expect(normalizedSql).toContain('BETWEEN 1 AND 9007199254740991');
    expect(normalizedSql).toContain('RAISE_ERROR');

    const candidateSql = readFileSync(
      path.join(mappingRoot, manifest.outputs[1]!.queryPath),
      'utf8'
    );
    expect(candidateSql).toContain("retrievalOutcome = 'SUCCESS'");
    expect(candidateSql).toContain("evidenceKind = 'exact_listing'");
    expect(candidateSql).toContain('exactPropertyMatch = TRUE');
    expect(candidateSql).toContain('FROM target_normalized_evidence');

    const sourceEvidence = dataset(sourceLanguage, 'evidence_records');
    for (const targetName of ['normalized_evidence', 'inference_candidates']) {
      const target = dataset(targetLanguage, targetName);
      expect(target.properties).toEqual(sourceEvidence.properties);
      expect(target.required).toEqual(sourceEvidence.required);
    }
  });
});
