import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

type ColumnSchema = {
  type: string | string[];
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
  allOf?: object[];
  'x-invariants'?: Array<{
    name: string;
    description: string;
    enforcedBy: string[];
  }>;
};

type PipelineLanguage = {
  contractVersion: number;
  name: string;
  version: string;
  shape: string;
  datasets: PipelineDataset[];
};

type TransformCatalog = {
  languageSchema: {
    version: string;
    path: string;
    sha256: string;
  };
  entries: Array<{
    kind: string;
    name?: string;
    id?: string;
    version?: string;
    status?: string;
    current?: boolean;
    from?: string;
    to?: string;
    path: string;
    sha256: string;
    querySha256?: string;
  }>;
};

type MappingManifest = {
  contractVersion: number;
  id: string;
  version: string;
  status: string;
  from: { name: string; version: string };
  to: { name: string; version: string };
  inputs: Array<{ table: string; view: string; required: boolean; format: string }>;
  output: {
    shape: string;
    format: string;
    delivery?: {
      mode: string;
      dataset: string;
      cardinality: string;
      maxBytes: number;
      requireVersionId: boolean;
    };
  };
  outputs: Array<{
    dataset: string;
    dependsOn: string[];
    queryPath: string;
    querySha256: string;
    invariantEvidence: Array<{
      invariant: string;
      querySha256s: string[];
      tests: Array<{ path: string; sha256: string; description: string }>;
      engineChecks?: Array<{ kind: string; jsonPointer: string }>;
    }>;
  }>;
};

const transformRoot = path.resolve(process.cwd(), 'publish', 'pipelines', 'transform');
const catalog = readJson<TransformCatalog>(path.join(transformRoot, 'catalog.json'));
const evidence = readJson<PipelineLanguage>(
  path.join(
    transformRoot,
    'languages',
    'sale-availability-evidence',
    '1.0.0',
    'sale-availability-evidence.json'
  )
);
const assessment = readJson<PipelineLanguage>(
  path.join(
    transformRoot,
    'languages',
    'sale-availability-assessment',
    '1.1.0',
    'sale-availability-assessment.json'
  )
);
const result = readJson<PipelineLanguage>(
  path.join(
    transformRoot,
    'languages',
    'sale-availability-result',
    '1.0.0',
    'sale-availability-result.json'
  )
);
const acquisitionBundle = readJson<PipelineLanguage>(
  path.join(
    transformRoot,
    'languages',
    'connect-http-acquisition-bundle',
    '1.0.0',
    'connect-http-acquisition-bundle.json'
  )
);
const shaA = 'a'.repeat(64);
const shaB = 'b'.repeat(64);
const evidenceMappingId = 'connect-http-acquisition-bundle-to-sale-availability-evidence';
const assessmentMappingId = 'sale-availability-evidence-to-sale-availability-assessment';
const resultMappingId = 'connect-http-acquisition-bundle-to-sale-availability-result';

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function dataset(language: PipelineLanguage, type: string): PipelineDataset {
  const match = language.datasets.find(candidate => candidate.type === type);
  expect(match, `${language.name}@${language.version}:${type}`).toBeDefined();
  return match!;
}

function mapping(id: string): {
  root: string;
  manifest: MappingManifest;
  catalogEntry: TransformCatalog['entries'][number];
} {
  const catalogEntry = catalog.entries.find(
    entry => entry.kind === 'mapping' && entry.id === id && entry.current === true
  );
  expect(catalogEntry, id).toBeDefined();
  const manifestPath = path.join(transformRoot, catalogEntry!.path);
  expect(sha256(manifestPath), id).toBe(catalogEntry!.sha256);
  return {
    root: path.dirname(manifestPath),
    manifest: readJson<MappingManifest>(manifestPath),
    catalogEntry: catalogEntry!,
  };
}

function rowValidator(schema: PipelineDataset): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  const rowSchema: Record<string, unknown> = {
    type: 'object',
    properties: schema.properties,
    required: schema.required,
    additionalProperties: schema.additionalProperties,
  };
  if (schema.allOf) rowSchema.allOf = schema.allOf;
  return ajv.compile(rowSchema);
}

const evidenceRow = {
  model_version: '1.0.0',
  observation_identifier: shaA,
  provider_identifier: 'provider-a',
  source_request_identifier: 'request-123',
  source_listing_identifier: null,
  source_url: null,
  source_as_of: null,
  source_status: null,
  retrieved_at: '2026-10-05T12:00:00.000Z',
  observation_outcome: 'LISTING_FOUND',
  market_status: 'ACTIVE',
  asking_price_amount_minor: 44_500_000,
  asking_price_currency: 'USD',
  price_parse_status: 'PARSED',
  evidence_artifact_uri: 'https://evidence.example/artifacts/listing-a.html',
  evidence_artifact_sha256: shaB,
  exact_address_match_state: 'EXACT',
  freshness_state: 'FRESH',
  freshness_evaluated_at: '2026-10-05T12:01:00.000Z',
  freshness_policy_version: 'freshness-1',
  coverage_state: 'COMPLETE',
  authority_state: 'AUTHORITATIVE',
  relationships: {
    listing_observation_has_address: 'address-cid',
    listing_observation_has_file: ['file-cid'],
    listing_observation_has_property: null,
  },
};

const assessmentRow = {
  model_version: '1.1.0',
  assessment_identifier: shaB,
  availability_status: 'FOR_SALE',
  is_for_sale: true,
  list_price_amount_minor: 44_490_000,
  list_price_currency: 'USD',
  policy_version: 'sale-policy-1',
  assessed_at: '2026-10-05T12:05:00.000Z',
  window_start_at: '2026-10-01T00:00:00.000Z',
  window_end_at: '2026-10-05T12:05:00.000Z',
  reason_codes: ['ACTIVE_AUTHORITATIVE_LISTING'],
  relationships: {
    sale_availability_assessment_has_address: 'address-cid',
    sale_availability_assessment_has_listing_observation: [shaA],
    sale_availability_assessment_has_property: null,
  },
};

describe('sale availability pipeline contracts', () => {
  it('publishes immutable 1.0.0 and selected nested 1.1.0 language schemas', () => {
    const v1Path = path.join(transformRoot, 'schemas', 'pipeline-language', '1.0.0', 'schema.json');
    const selectedPath = path.join(transformRoot, catalog.languageSchema.path);

    expect(sha256(v1Path)).toBe('02cb4837a0ee867d7569efb9faf8d82eef3ef0d47362dd6de285f252c37d8c97');
    expect(catalog.languageSchema.version).toBe('1.1.0');
    expect(sha256(selectedPath)).toBe(catalog.languageSchema.sha256);

    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validateLanguage = ajv.compile(readJson<object>(selectedPath));
    for (const language of [acquisitionBundle, evidence, assessment, result]) {
      expect(validateLanguage(language), JSON.stringify(validateLanguage.errors)).toBe(true);
    }
  });

  it('composes the result language from the exact governed dataset contracts', () => {
    expect(result).toMatchObject({
      contractVersion: 2,
      name: 'sale-availability-result',
      version: '1.0.0',
      shape: 'tabular',
    });
    expect(result.datasets).toEqual([
      dataset(evidence, 'listing_observations'),
      dataset(assessment, 'sale_availability_assessments'),
    ]);
  });

  it('reuses only the generic acquisition bundle and artifact hydration datasets', () => {
    expect(acquisitionBundle).toMatchObject({
      contractVersion: 2,
      name: 'connect-http-acquisition-bundle',
      version: '1.0.0',
      shape: 'tabular',
    });
    expect(acquisitionBundle.datasets.map(candidate => candidate.type)).toEqual([
      'run_context',
      'acquisition_bundle',
      'acquisition_records',
      'raw_documents',
    ]);
    expect(dataset(acquisitionBundle, 'raw_documents').required).toContain('sha256');
    expect(dataset(acquisitionBundle, 'raw_documents').required).toContain('sourceUri');

    const catalogNames = catalog.entries
      .filter(entry => entry.kind === 'language')
      .map(entry => entry.name);
    expect(catalogNames).not.toContain('sale-availability-inference-input');
    expect(
      existsSync(
        path.join(
          transformRoot,
          'mappings',
          'connect-http-acquisition-bundle-to-sale-availability-inference-input'
        )
      )
    ).toBe(false);
  });

  it('validates listing observations, endpoint references, and rejected prices', () => {
    expect(evidence).toMatchObject({
      contractVersion: 2,
      name: 'sale-availability-evidence',
      version: '1.0.0',
      datasets: [{ type: 'listing_observations' }],
    });
    const listingObservations = dataset(evidence, 'listing_observations');
    const validate = rowValidator(listingObservations);

    expect(validate(evidenceRow), JSON.stringify(validate.errors)).toBe(true);
    expect(
      validate({
        ...evidenceRow,
        price_parse_status: 'REJECTED',
        asking_price_amount_minor: null,
        asking_price_currency: null,
      }),
      JSON.stringify(validate.errors)
    ).toBe(true);
    expect(
      validate({
        ...evidenceRow,
        price_parse_status: 'REJECTED',
        asking_price_amount_minor: 1,
      })
    ).toBe(false);
    expect(
      validate({
        ...evidenceRow,
        relationships: {
          ...evidenceRow.relationships,
          listing_observation_has_file: [],
        },
      })
    ).toBe(false);
    expect(
      listingObservations['x-invariants']?.find(
        invariant => invariant.name === 'relationship_endpoints_exist'
      )?.description
    ).toContain('address reference cannot mint property identity');
  });

  it('validates assessments and deterministic observation references', () => {
    expect(assessment).toMatchObject({
      contractVersion: 2,
      name: 'sale-availability-assessment',
      version: '1.1.0',
      datasets: [{ type: 'sale_availability_assessments' }],
    });
    const assessments = dataset(assessment, 'sale_availability_assessments');
    const validate = rowValidator(assessments);

    expect(validate(assessmentRow), JSON.stringify(validate.errors)).toBe(true);
    expect(
      validate({
        ...assessmentRow,
        list_price_amount_minor: null,
        list_price_currency: null,
      }),
      JSON.stringify(validate.errors)
    ).toBe(true);
    expect(
      validate({
        ...assessmentRow,
        list_price_currency: null,
      })
    ).toBe(false);
    expect(
      validate({
        ...assessmentRow,
        availability_status: 'UNKNOWN',
        is_for_sale: null,
        list_price_amount_minor: null,
        list_price_currency: null,
      }),
      JSON.stringify(validate.errors)
    ).toBe(true);
    expect(
      validate({
        ...assessmentRow,
        availability_status: 'FOR_SALE',
        is_for_sale: null,
      })
    ).toBe(false);
    expect(
      validate({
        ...assessmentRow,
        relationships: {
          ...assessmentRow.relationships,
          sale_availability_assessment_has_listing_observation: [],
        },
      })
    ).toBe(false);
    expect(
      assessments['x-invariants']?.find(
        invariant => invariant.name === 'sorted_observation_references'
      )
    ).toMatchObject({ enforcedBy: ['producer'] });
  });

  it('pins every newly published language artifact digest', () => {
    for (const name of [
      'connect-http-acquisition-bundle',
      'sale-availability-evidence',
      'sale-availability-assessment',
      'sale-availability-result',
    ]) {
      const entry = catalog.entries.find(
        candidate =>
          candidate.kind === 'language' && candidate.name === name && candidate.current === true
      );
      expect(entry, name).toBeDefined();
      expect(sha256(path.join(transformRoot, entry!.path)), name).toBe(entry!.sha256);
    }
  });

  it('publishes two immutable enabled directional mappings with exact invariant evidence', () => {
    const pairs = [
      {
        id: evidenceMappingId,
        version: '1.1.2',
        from: 'connect-http-acquisition-bundle',
        to: 'sale-availability-evidence',
        target: dataset(evidence, 'listing_observations'),
      },
      {
        id: assessmentMappingId,
        version: '1.2.0',
        from: 'sale-availability-evidence',
        to: 'sale-availability-assessment',
        target: dataset(assessment, 'sale_availability_assessments'),
      },
    ];

    for (const pair of pairs) {
      const bundle = mapping(pair.id);
      expect(bundle.manifest).toMatchObject({
        contractVersion: 2,
        id: pair.id,
        version: pair.version,
        status: 'ENABLED',
        from: { name: pair.from, version: '1.0.0' },
        to: {
          name: pair.to,
          version: pair.id === assessmentMappingId ? '1.1.0' : '1.0.0',
        },
        output: { shape: 'tabular', format: 'parquet' },
      });
      expect(bundle.catalogEntry).toMatchObject({
        version: pair.version,
        status: 'ENABLED',
        from: pair.from,
        to: pair.to,
      });

      const output = bundle.manifest.outputs[0]!;
      expect(sha256(path.join(bundle.root, output.queryPath))).toBe(output.querySha256);
      expect(bundle.catalogEntry.querySha256).toBe(output.querySha256);
      const requiredInvariants = pair.target['x-invariants']!.filter(invariant =>
        invariant.enforcedBy.some(owner => owner === 'producer' || owner === 'mapping-sql')
      )
        .map(invariant => invariant.name)
        .sort();
      expect(output.invariantEvidence.map(item => item.invariant).sort()).toEqual(
        requiredInvariants
      );
      for (const invariant of output.invariantEvidence) {
        expect(invariant.querySha256s).toEqual([output.querySha256]);
        expect(invariant.tests.length).toBeGreaterThan(0);
        for (const test of invariant.tests) {
          expect(test.path).toMatch(/^tests\/.+/u);
          expect(sha256(path.join(bundle.root, test.path))).toBe(test.sha256);
        }
      }
    }
  });

  it('publishes one Firecrawl mapping with ordered dependent Parquet outputs', () => {
    const bundle = mapping(resultMappingId);
    expect(bundle.catalogEntry).toMatchObject({
      version: '1.0.0',
      status: 'ENABLED',
      from: 'connect-http-acquisition-bundle',
      to: 'sale-availability-result',
    });
    expect(bundle.catalogEntry.querySha256).toBeUndefined();
    expect(bundle.manifest).toMatchObject({
      contractVersion: 2,
      id: resultMappingId,
      version: '1.0.0',
      status: 'ENABLED',
      from: { name: 'connect-http-acquisition-bundle', version: '1.0.0' },
      to: { name: 'sale-availability-result', version: '1.0.0' },
      inputs: [
        { table: 'acquisition_records', format: 'jsonl' },
        { table: 'raw_documents', format: 'jsonl' },
      ],
      output: {
        shape: 'tabular',
        format: 'parquet',
        delivery: {
          mode: 'inline',
          dataset: 'sale_availability_assessments',
          cardinality: 'exactly-one',
          maxBytes: 65_536,
          requireVersionId: true,
        },
      },
    });
    expect(bundle.manifest.outputs.map(output => [output.dataset, output.dependsOn])).toEqual([
      ['listing_observations', []],
      ['sale_availability_assessments', ['listing_observations']],
    ]);

    for (const output of bundle.manifest.outputs) {
      expect(sha256(path.join(bundle.root, output.queryPath))).toBe(output.querySha256);
      const target = dataset(result, output.dataset);
      const requiredInvariants = target['x-invariants']!.filter(invariant =>
        invariant.enforcedBy.some(owner => owner === 'producer' || owner === 'mapping-sql')
      )
        .map(invariant => invariant.name)
        .sort();
      expect(output.invariantEvidence.map(item => item.invariant).sort()).toEqual(
        requiredInvariants
      );
      for (const invariant of output.invariantEvidence) {
        expect(invariant.querySha256s).toEqual([output.querySha256]);
        for (const test of invariant.tests) {
          expect(sha256(path.join(bundle.root, test.path))).toBe(test.sha256);
        }
      }
    }
  });

  it('pins synthetic fail-closed Firecrawl policy and version-free wire request fixtures', () => {
    const bundle = mapping(resultMappingId);
    const fixturePath = path.join(bundle.root, 'tests', 'firecrawl-policy-v1-cases.json');
    const rawFixture = readFileSync(fixturePath, 'utf8');
    const fixture = JSON.parse(rawFixture) as {
      policyVersion: string;
      cases: Array<{
        caseId: string;
        expectedObservations: unknown[];
        expectedAssessment: {
          availabilityStatus: string;
          isForSale: boolean | null;
          reasonCodes: string[];
        };
      }>;
      replays: Array<{ sourceCaseId: string }>;
    };
    expect(fixture.policyVersion).toBe('sale-availability-firecrawl-policy-v1');
    expect(fixture.cases.map(item => item.caseId)).toEqual([
      'active-exact-jsonld',
      'future-public-auction',
      'three-page-conflict',
      'empty-web-results',
      'provider-success-false',
      'missing-raw-html',
      'blocked-page-metadata',
      'malformed-envelope-json',
      'non-exact-address',
      'stale-active-page',
    ]);
    expect(
      fixture.cases.find(item => item.caseId === 'three-page-conflict')?.expectedObservations
    ).toHaveLength(3);
    expect(
      fixture.cases.find(item => item.caseId === 'three-page-conflict')?.expectedAssessment
    ).toMatchObject({ availabilityStatus: 'CONFLICT', isForSale: null });
    for (const caseFixture of fixture.cases.slice(3)) {
      expect(caseFixture.expectedAssessment.availabilityStatus, caseFixture.caseId).toBe('UNKNOWN');
      expect(caseFixture.expectedAssessment.isForSale, caseFixture.caseId).toBeNull();
    }
    expect(fixture.replays).toEqual([
      expect.objectContaining({ sourceCaseId: 'active-exact-jsonld' }),
    ]);
    expect(rawFixture).not.toMatch(
      /movoto\.com|trulia\.com|irsauctions\.gov|zillow\.com|redfin\.com|realtor\.com|homepath\.com/iu
    );

    const request = readJson<Record<string, unknown>>(
      path.join(bundle.root, 'fixtures', 'request.json')
    );
    expect(request).toMatchObject({
      contractVersion: 2,
      from: 'connect-http-acquisition-bundle',
      to: 'sale-availability-result',
    });
    expect(request).not.toHaveProperty('mapping');
    expect(request).not.toHaveProperty('mappingId');
    expect(request).not.toHaveProperty('fromVersion');
    expect(request).not.toHaveProperty('toVersion');
    for (const input of request.inputs as Array<Record<string, unknown>>) {
      expect(input).not.toHaveProperty('format');
    }
    const packaging = readJson<{
      source: { flow: string; configuration: string };
      target: { language: string; datasets: Array<{ table: string; format: string }> };
      materializationRules: Array<{ rule: string }>;
    }>(path.join(bundle.root, 'fixtures', 'system-input-packaging.contract.json'));
    expect(packaging).toMatchObject({
      source: {
        flow: 'firecrawl-property-page-evidence@1',
        configuration: 'firecrawl-review-property-page-evidence',
      },
      target: {
        language: 'connect-http-acquisition-bundle',
        datasets: [
          { table: 'acquisition_records', format: 'jsonl' },
          { table: 'raw_documents', format: 'jsonl' },
        ],
      },
    });
    expect(packaging.materializationRules.map(item => item.rule)).toContain(
      'one-transform-run-per-subject'
    );

    const listingSql = readFileSync(
      path.join(bundle.root, 'queries', 'listing_observations.sql'),
      'utf8'
    );
    const assessmentSql = readFileSync(
      path.join(bundle.root, 'queries', 'sale_availability_assessments.sql'),
      'utf8'
    );
    expect(listingSql).toContain('POSEXPLODE');
    expect(listingSql).toContain('firecrawlEnvelope.data.web');
    expect(assessmentSql).toContain('FROM target_listing_observations');
    expect(assessmentSql).not.toContain("'NOT_FOR_SALE'");
  });

  it('pins inline completion only on mappings with an exactly-one assessment output', () => {
    const evidenceMapping = mapping(evidenceMappingId).manifest;
    const assessmentMapping = mapping(assessmentMappingId).manifest;
    const resultMapping = mapping(resultMappingId).manifest;

    expect(evidenceMapping.output).not.toHaveProperty('delivery');
    for (const manifest of [assessmentMapping, resultMapping]) {
      expect(manifest.output.delivery).toEqual({
        mode: 'inline',
        dataset: 'sale_availability_assessments',
        cardinality: 'exactly-one',
        maxBytes: 65_536,
        requireVersionId: true,
      });
      expect(
        manifest.outputs.some(output => output.dataset === manifest.output.delivery?.dataset)
      ).toBe(true);
    }
  });

  it('pins independent policy-v2 cases and deterministic primary reason codes', () => {
    const evidenceCases = readJson<{
      cases: Array<{
        caseId: string;
        expectedObservations: Array<{
          marketStatus: string;
          exactAddressMatchState: string;
          freshnessState: string;
          priceParseStatus: string;
          askingPriceAmountMinor: number | null;
          fileReferences: string[];
        }>;
      }>;
      searchCases: Array<{
        caseId: string;
        provider: string;
        expectedObservations: Array<{
          observationOutcome: string;
          sourceListingIdentifier: string | null;
          sourceUrl: string | null;
        }>;
      }>;
      invalidSourceCases: Array<{ caseId: string }>;
    }>(path.join(mapping(evidenceMappingId).root, 'tests', 'policy-v2-cases.json'));
    expect(evidenceCases.cases.map(item => item.caseId)).toEqual(
      expect.arrayContaining([
        'fresh-exact-active',
        'no-row',
        'lookup-failure',
        'stale',
        'non-exact',
        'ambiguous-address',
        'unknown-status',
        'conflicting-fresh-records',
      ])
    );
    expect(evidenceCases.searchCases.map(item => item.caseId)).toEqual([
      'google-search-citations',
      'brave-search-results',
      'brave-search-absence',
      'google-search-failure',
    ]);
    for (const searchCase of evidenceCases.searchCases) {
      for (const expected of searchCase.expectedObservations) {
        expect(expected.observationOutcome).toMatch(
          /^(LISTING_FOUND|LISTING_ABSENT|LOOKUP_FAILED)$/u
        );
      }
    }
    expect(evidenceCases.invalidSourceCases.map(item => item.caseId)).toEqual([
      'missing-required-field',
      'wrong-type',
    ]);

    const assessmentCases = readJson<{
      policyVersion: string;
      reasonCodePolicy: {
        primaryPosition: number;
        primaryPrecedence: string[];
        failureDetails: string[];
      };
      cases: Array<{
        caseId: string;
        observations: Array<{ providerIdentifier?: string }>;
        expected: {
          availabilityStatus: string;
          isForSale: boolean | null;
          listPriceAmountMinor?: number | null;
          listPriceCurrency?: string | null;
          reasonCodes?: string[];
        };
      }>;
    }>(path.join(mapping(assessmentMappingId).root, 'tests', 'policy-v2-cases.json'));
    const byId = new Map(assessmentCases.cases.map(item => [item.caseId, item]));
    expect(assessmentCases.policyVersion).toBe('sale-availability-policy-v2');
    expect(assessmentCases.reasonCodePolicy.primaryPosition).toBe(0);
    expect(byId.get('fresh-exact-active-price-available')?.expected).toMatchObject({
      availabilityStatus: 'FOR_SALE',
      isForSale: true,
      listPriceAmountMinor: 44_490_000,
      listPriceCurrency: 'USD',
      reasonCodes: ['ACTIVE_LISTING_PRICE_AVAILABLE'],
    });
    expect(byId.get('fresh-exact-active-price-absent')?.expected).toMatchObject({
      availabilityStatus: 'FOR_SALE',
      isForSale: true,
      listPriceAmountMinor: null,
      listPriceCurrency: null,
      reasonCodes: ['ACTIVE_LISTING_PRICE_UNAVAILABLE'],
    });
    const exactUnknownReasons = new Map([
      ['no-rentcast-row', 'NO_PROVIDER_MATCH'],
      ['provider-lookup-failed', 'PROVIDER_LOOKUP_FAILED'],
      ['stale-active', 'STALE_EVIDENCE'],
      ['listing-status-unknown', 'LISTING_STATUS_UNKNOWN'],
      ['unsupported-status', 'UNSUPPORTED_STATUS'],
      ['non-exact-active', 'NON_EXACT_MATCH'],
      ['ambiguous-address', 'ADDRESS_AMBIGUOUS'],
      ['google-search-candidate', 'SEARCH_CANDIDATE_FOUND'],
      ['brave-search-candidate', 'SEARCH_CANDIDATE_FOUND'],
      ['search-absence', 'NO_PROVIDER_MATCH'],
    ] as const);
    for (const [caseId, primaryReason] of exactUnknownReasons) {
      expect(byId.get(caseId)?.expected, caseId).toMatchObject({
        availabilityStatus: 'UNKNOWN',
        isForSale: null,
      });
      expect(byId.get(caseId)?.expected.reasonCodes?.[0], caseId).toBe(primaryReason);
    }
    expect(byId.get('conflicting-fresh-records')?.expected).toMatchObject({
      availabilityStatus: 'CONFLICT',
      isForSale: null,
    });
    expect(byId.get('conflicting-eligible-active-prices')?.expected).toMatchObject({
      availabilityStatus: 'CONFLICT',
      isForSale: null,
      listPriceAmountMinor: null,
      listPriceCurrency: null,
      reasonCodes: ['CONFLICTING_ELIGIBLE_ACTIVE_PRICES'],
    });
    expect(byId.get('authoritative-complete-negative')).toMatchObject({
      observations: [{ providerIdentifier: 'governed-authoritative-source' }],
      expected: { availabilityStatus: 'NOT_FOR_SALE', isForSale: false },
    });
    for (const item of assessmentCases.cases) {
      expect(assessmentCases.reasonCodePolicy.primaryPrecedence, item.caseId).toContain(
        item.expected.reasonCodes?.[0]
      );
    }
  });

  it('defines the deterministic provider-agnostic System input packaging boundary', () => {
    const root = mapping(evidenceMappingId).root;
    const contract = readJson<{
      source: { providers: string[] };
      target: { language: string; datasets: Array<{ table: string; format: string }> };
      governedContext: {
        schema: {
          required: string[];
          properties: { independentPropertyReference: { type: string[] } };
        };
      };
      materializationRules: Array<{ rule: string; requirements: string[] }>;
      prohibited: string[];
    }>(path.join(root, 'fixtures', 'system-input-packaging.contract.json'));

    expect(contract.target).toMatchObject({
      language: 'connect-http-acquisition-bundle',
      datasets: [
        { table: 'acquisition_records', format: 'jsonl' },
        { table: 'raw_documents', format: 'jsonl' },
      ],
    });
    expect(contract.governedContext.schema.required).toContain('artifactFileReferencesBySha256');
    expect(contract.governedContext.schema.properties.independentPropertyReference.type).toEqual([
      'string',
      'null',
    ]);
    expect(contract.materializationRules.map(item => item.rule)).toEqual([
      'one-acquisition-row-per-connect-result',
      'one-raw-document-row-per-result-file',
      'pair-by-request',
      'search-candidates-are-discovery-only',
    ]);
    expect(contract.source.providers).toEqual(
      expect.arrayContaining([
        'google-search-grounding-review-evidence',
        'brave-search-review-property-evidence',
      ])
    );
    expect(contract.prohibited).toEqual(
      expect.arrayContaining([
        'provider status classification in System or Connect',
        'price parsing in System or Connect',
        'property identity derived from an address',
      ])
    );
    expect(
      [
        readFileSync(path.join(root, 'queries', 'listing_observations.sql'), 'utf8'),
        readFileSync(path.join(root, 'tests', 'policy-v2-cases.json'), 'utf8'),
      ].join('\n')
    ).toMatch(/google-search-grounding|brave-search/iu);
    const sql = readFileSync(path.join(root, 'queries', 'listing_observations.sql'), 'utf8');
    expect(sql).toContain("'UNKNOWN' AS market_status");
    expect(sql).toContain("'NOT_APPLICABLE' AS price_parse_status");
    expect(sql).toContain("'SUPPORTING' AS authority_state");
  });
});
