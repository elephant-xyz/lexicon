import { readFileSync } from 'node:fs';

import Ajv from 'ajv/dist/ajv.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import {
  ACTIVE_EXTENSION_DIGEST,
  APPROVED_ADDITIVE_PROPERTIES,
  BASE_RELEASE_DIGEST,
  BASE_RELEASE_ID,
  COMPILED_DIGEST,
  CompositionBuildError,
  DEPENDENCY_LOCK_DIGEST,
  OUTPUT_PATHS,
  buildModelComposition,
  readSources,
  serialize,
} from '../../scripts/build-model-composition.mjs';

type Ref = { scope: string; definitionId: string; importAlias?: string };
type Definition = {
  definitionId: string;
  body: {
    kind: string;
    schemaVersion: string;
    from?: Ref;
    to?: Ref;
    isDeprecated?: boolean;
    properties?: Record<string, Record<string, unknown>>;
    allOf?: unknown[];
    embeddings?: Record<string, unknown>;
    indexes?: Record<string, unknown>;
  };
};
type Built = {
  composition: {
    manifest: { contractVersion: string; exports: string[] };
    definitions: Definition[];
  };
  omissions: {
    omittedDocumentKeys: string[];
    omittedRelationships: Array<{ from: string; name: string; targets: string[] }>;
    counts: Record<string, number>;
  };
  compatibility: {
    baseline: { digest: string; vertices: number; relationships: number };
    candidate: {
      baseReleaseId: string;
      baseReleaseDigest: string;
      vertices: number;
      relationships: number;
    };
    delta: {
      addedVertices: string[];
      addedRelationships: string[];
      addedProperties: string[];
      removedVertices: string[];
      removedRelationships: string[];
      changedVertices: string[];
      changedRelationships: string[];
      ownershipChanges: string[];
      labelKindChanges: string[];
      restrictiveConstraintChanges: string[];
    };
    verdict: string;
    model: {
      governanceBaseReleaseId: string;
      sourceDigest: string;
      sourceByteLength: number;
      candidateDigest: string;
      plannedReleaseId: string;
      compiledDigest: string;
      compiledByteLength: number;
      dependencyLockDigest: string;
      dependencyLockByteLength: number;
    };
  };
};
type Lexicon = {
  classes: Array<{
    type: string;
    properties?: Record<string, Record<string, unknown>>;
    relationships?: Record<string, { targets?: string[] }>;
  }>;
  data_groups: Array<{
    label: string;
    relationships: Array<{ from: string; to: string; relationship_type: string }>;
  }>;
};

const sources = readSources() as {
  lexicon: Lexicon;
  choices: unknown;
  runtime: {
    embeddings: Record<string, Record<string, unknown>>;
    derivedIndexes: Record<string, Record<string, unknown>>;
  };
  compatibilityBaseline: unknown;
};
const built = buildModelComposition(sources) as Built;
const definitions = new Map(
  built.composition.definitions.map(definition => [definition.definitionId, definition])
);

function relationship(id: string) {
  const definition = definitions.get(id);
  expect(definition, id).toBeDefined();
  return {
    from: definition!.body.from!.definitionId,
    to: definition!.body.to!.definitionId,
    isDeprecated: definition!.body.isDeprecated === true,
  };
}

function properties(type: string) {
  return definitions.get(type)!.body.properties!;
}

describe('Model composition of the Elephant lexicon', () => {
  it('matches the committed composition and omissions', () => {
    expect(readFileSync(OUTPUT_PATHS.compositionPath, 'utf8')).toBe(serialize(built.composition));
    expect(readFileSync(OUTPUT_PATHS.omissionsPath, 'utf8')).toBe(serialize(built.omissions));
    expect(readFileSync(OUTPUT_PATHS.compatibilityReportPath, 'utf8')).toBe(
      serialize(built.compatibility)
    );
  });

  it('uses Contract 1.1 without truncating definitions', () => {
    expect(built.composition.manifest.contractVersion).toBe('1.1');
    expect(built.composition.definitions.every(item => item.body.schemaVersion === '1.1')).toBe(
      true
    );
    expect(built.composition.definitions.length).toBeGreaterThan(500);
    expect(built.composition.definitions.length).toBeLessThanOrEqual(2000);
    expect(built.composition.manifest.exports).toHaveLength(built.composition.definitions.length);
    expect(built.omissions.omittedDocumentKeys).not.toContain('data_groups');
  });

  it('emits Sale Availability data-group relationships with their Transform keys', () => {
    expect(relationship('listing_observation_has_address')).toMatchObject({
      from: 'listing_observation',
      to: 'address',
    });
    expect(relationship('listing_observation_has_file')).toMatchObject({ to: 'file' });
    expect(relationship('listing_observation_has_property')).toMatchObject({ to: 'property' });
    expect(relationship('sale_availability_assessment_has_address')).toMatchObject({
      from: 'sale_availability_assessment',
      to: 'address',
    });
    expect(relationship('sale_availability_assessment_has_listing_observation')).toMatchObject({
      to: 'listing_observation',
    });
    expect(relationship('sale_availability_assessment_has_property')).toMatchObject({
      to: 'property',
    });
  });

  it('accounts for every data-group relationship', () => {
    const omitted = new Set(built.omissions.omittedRelationships.map(item => item.name));
    for (const group of sources.lexicon.data_groups) {
      for (const item of group.relationships) {
        expect(
          definitions.has(item.relationship_type) || omitted.has(item.relationship_type),
          item.relationship_type
        ).toBe(true);
      }
    }
    expect(relationship('property_has_address')).toMatchObject({ from: 'property', to: 'address' });
    expect(relationship('property_has_tax')).toMatchObject({ from: 'property', to: 'tax' });
    expect(relationship('person_has_property')).toEqual({
      from: 'person',
      to: 'property',
      isDeprecated: true,
    });
    expect(relationship('property_has_sales_history')).toMatchObject({
      from: 'property',
      to: 'sales_history',
    });
    expect(definitions.get('property_seed')?.body.kind).toBe('vertex');
  });

  it('emits one edge per target for multi-target class relationships', () => {
    expect(relationship('expense__paid_by__company')).toMatchObject({
      from: 'expense',
      to: 'company',
    });
    expect(relationship('expense__paid_by__person')).toMatchObject({ to: 'person' });
    expect(definitions.has('expense__paid_by')).toBe(false);
    expect(relationship('lead__has_employment')).toMatchObject({ to: 'employment' });

    const omitted = new Set(
      built.omissions.omittedRelationships.map(item => `${item.from}__${item.name}`)
    );
    for (const classObject of sources.lexicon.classes) {
      if (['person', 'company', 'address'].includes(classObject.type)) continue;
      for (const [name, spec] of Object.entries(classObject.relationships ?? {})) {
        const targets = [...new Set(spec.targets ?? [])];
        const ids =
          targets.length === 1
            ? [`${classObject.type}__${name}`]
            : targets.map(target => `${classObject.type}__${name}__${target}`);
        const emitted = ids.every(id => definitions.has(id));
        expect(emitted || omitted.has(`${classObject.type}__${name}`), ids[0]).toBe(true);
      }
    }
  });

  it('keeps every installed definition and adds only governed compatible fields', () => {
    expect(built.compatibility.baseline).toMatchObject({
      digest: ACTIVE_EXTENSION_DIGEST,
      vertices: 213,
      relationships: 292,
    });
    expect(built.compatibility.candidate).toEqual({
      baseReleaseId: BASE_RELEASE_ID,
      baseReleaseDigest: BASE_RELEASE_DIGEST,
      vertices: 213,
      relationships: 525,
    });
    expect(built.compatibility.delta.addedVertices).toEqual([]);
    expect(built.compatibility.delta.addedRelationships).toHaveLength(233);
    expect(built.compatibility.delta.addedProperties).toEqual(['property.hoa_mandatory']);
    expect(built.compatibility.delta.removedVertices).toEqual([]);
    expect(built.compatibility.delta.removedRelationships).toEqual([]);
    expect(built.compatibility.delta.changedVertices).toEqual([]);
    expect(built.compatibility.delta.changedRelationships).toEqual([]);
    expect(built.compatibility.delta.ownershipChanges).toEqual([]);
    expect(built.compatibility.delta.labelKindChanges).toEqual([]);
    expect(built.compatibility.delta.restrictiveConstraintChanges).toEqual([]);
    expect(built.compatibility.verdict).toBe('ZERO_BREAKING_STRICT_ADDITIVE');
    expect(APPROVED_ADDITIVE_PROPERTIES).toEqual({
      property: ['hoa_mandatory'],
    });
    expect(properties('property').hoa_mandatory).toMatchObject({
      type: 'boolean',
      nullable: true,
    });
    expect(properties('property').hoa_mandatory.required).toBeUndefined();
    expect(built.compatibility.model).toMatchObject({
      governanceBaseReleaseId: 'rel-30b456730cd6ee29',
      sourceDigest: 'sha256:47f36c85717f15865e0f8493912b315219bba013ca99f69e085bd0f422cbdba0',
      sourceByteLength: 1107228,
      candidateDigest: 'sha256:b36afe133ce45935e4877a7a4b57dea2810f1de32359ce49dcc558b6bce9f504',
      plannedReleaseId: 'rel-b36afe133ce45935',
      compiledDigest: COMPILED_DIGEST,
      compiledByteLength: 469049,
      dependencyLockDigest: DEPENDENCY_LOCK_DIGEST,
      dependencyLockByteLength: 267,
    });
  });

  it('does not apply unproved restrictive source constraints to installed properties', () => {
    expect(properties('layout').space_type.enum).toBeUndefined();
    expect(properties('listing_observation').asking_price_currency.maxLength).toBeUndefined();
    expect(properties('listing_observation').model_version.const).toBeUndefined();
    expect(properties('sale_availability_assessment').reason_codes.uniqueItems).toBeUndefined();
    expect(properties('unnormalized_address').county_jurisdiction.enum).toBeUndefined();
    expect(definitions.get('listing_observation')?.body.allOf).toBeUndefined();
    expect(definitions.get('sale_availability_assessment')?.body.allOf).toBeUndefined();
  });

  it('fails closed when the approved property is missing, required, or non-nullable', () => {
    const missing = JSON.parse(JSON.stringify(sources.lexicon)) as Lexicon;
    delete missing.classes.find(item => item.type === 'property')!.properties!.hoa_mandatory;
    expect(() => buildModelComposition({ ...sources, lexicon: missing })).toThrow(
      /property\.hoa_mandatory is missing from source/
    );

    const restrictive = JSON.parse(JSON.stringify(sources.lexicon)) as Lexicon;
    restrictive.classes.find(item => item.type === 'property')!.properties!.hoa_mandatory = {
      type: 'boolean',
      required: true,
    };
    expect(() => buildModelComposition({ ...sources, lexicon: restrictive })).toThrow(
      /property\.hoa_mandatory must be optional and nullable/
    );
  });

  it('accepts representative installed values while retaining compatible type checks', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = (type: string, value: Record<string, unknown>) => {
      const body = definitions.get(type)?.body;
      expect(body?.kind, type).toBe('vertex');
      const validator = ajv.compile({
        type: 'object',
        properties: body?.properties ?? {},
        required: [],
        additionalProperties: false,
      });
      expect(validator(value), JSON.stringify(validator.errors)).toBe(true);
    };

    validate('layout', { space_type: 'FUTURE_SOURCE_VALUE' });
    validate('listing_observation', {
      asking_price_currency: 'USD',
      model_version: 'compatibility-successor',
    });
    validate('sale_availability_assessment', {
      list_price_currency: 'USD',
      model_version: 'compatibility-successor',
      reason_codes: ['SOURCE_UNAVAILABLE', 'SOURCE_UNAVAILABLE'],
    });
    validate('unnormalized_address', { county_jurisdiction: 'New County' });
    validate('renovation', { renovation_year: 2020 });
    validate('document_paragraph', { document_text: 'Representative installed paragraph.' });

    const renovation = definitions.get('renovation')?.body;
    const invalid = ajv.compile({
      type: 'object',
      properties: renovation?.properties ?? {},
      additionalProperties: false,
    });
    expect(invalid({ renovation_year: '2020' })).toBe(false);
  });

  it('preserves governed Persist runtime declarations and rejects unknown vertices', () => {
    expect(definitions.get('document_paragraph')?.body.embeddings).toEqual(
      sources.runtime.embeddings.document_paragraph
    );
    expect(definitions.get('renovation')?.body.indexes).toEqual(
      sources.runtime.derivedIndexes.renovation
    );
    const runtime = {
      embeddings: {
        document_paragraph: {
          paragraph_text: { source_property: 'document_text', content: 'text', version: '1' },
        },
      },
      derivedIndexes: {},
    };
    const withRuntime = buildModelComposition({ ...sources, runtime }) as Built;
    const paragraph = withRuntime.composition.definitions.find(
      item => item.definitionId === 'document_paragraph'
    );
    expect(paragraph?.body.embeddings).toEqual(sources.runtime.embeddings.document_paragraph);

    expect(() =>
      buildModelComposition({
        ...sources,
        runtime: { embeddings: { ghost: {} }, derivedIndexes: {} },
      })
    ).toThrow(CompositionBuildError);
  });

  it('fails on data-group endpoint conflicts it cannot resolve by convention', () => {
    const lexicon = JSON.parse(JSON.stringify(sources.lexicon)) as Lexicon;
    lexicon.data_groups.push({
      label: 'Conflict',
      relationships: [
        { from: 'property', to: 'file', relationship_type: 'property_document_link' },
        { from: 'file', to: 'property', relationship_type: 'property_document_link' },
      ],
    });
    expect(() => buildModelComposition({ ...sources, lexicon })).toThrow(
      /property_document_link has conflicting endpoints/
    );
  });
});
