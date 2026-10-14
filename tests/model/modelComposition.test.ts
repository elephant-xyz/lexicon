import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CompositionBuildError,
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
};
type Lexicon = {
  classes: Array<{ type: string; relationships?: Record<string, { targets?: string[] }> }>;
  data_groups: Array<{
    label: string;
    relationships: Array<{ from: string; to: string; relationship_type: string }>;
  }>;
};

const sources = readSources() as { lexicon: Lexicon; choices: unknown; runtime: unknown };
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

  it('preserves nullability, value constraints and allOf', () => {
    expect(properties('listing_observation').asking_price_currency).toMatchObject({
      type: 'string',
      nullable: true,
      maxLength: 3,
    });
    expect(properties('listing_observation').model_version).toMatchObject({
      const: expect.any(String),
    });
    expect(properties('sale_availability_assessment').reason_codes).toMatchObject({
      type: 'array',
      uniqueItems: true,
    });
    expect(properties('sale_availability_assessment').is_for_sale).toMatchObject({
      type: 'boolean',
      nullable: true,
    });
    expect(definitions.get('listing_observation')?.body.allOf).toHaveLength(1);
    expect(definitions.get('sale_availability_assessment')?.body.allOf).toHaveLength(3);
  });

  it('adds governed Persist runtime declarations and rejects unknown vertices', () => {
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
    expect(paragraph?.body.embeddings).toEqual(runtime.embeddings.document_paragraph);
    expect(definitions.get('document_paragraph')?.body.embeddings).toBeUndefined();

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
