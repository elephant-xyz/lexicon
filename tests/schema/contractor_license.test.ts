import { describe, expect, it } from 'vitest';
import lexiconJson from '../../src/data/lexicon.json';
import { generateJSONSchemaForClass } from '../../vite-plugins/json-schema-generator';
import type { LexiconData } from '../../src/types/lexicon';

const lexicon = lexiconJson as unknown as LexiconData;

function getClass(type: string) {
  const lexiconClass = lexicon.classes.find(candidate => candidate.type === type);
  expect(lexiconClass, `Expected ${type} class to exist`).toBeDefined();
  return lexiconClass!;
}

describe('contractor license lexicon', () => {
  it('keeps license_identifier on the license class', () => {
    const license = getClass('license');
    expect(license.container_name).toBe('licenses');
    expect(license.properties.license_identifier.minLength).toBe(1);
    expect(license.properties).toHaveProperty('source_http_request');
    expect(license.properties).toHaveProperty('request_identifier');
    expect(license.properties.license_authority_level_type.optional).toBe(true);

    const generated = generateJSONSchemaForClass(license);
    expect(generated.required).toEqual([
      'source_http_request',
      'request_identifier',
      'license_identifier',
    ]);
  });

  it('links the contractor company to the license', () => {
    const group = lexicon.data_groups.find(entry => entry.label === 'Property Improvement');
    expect(group, 'Expected Property Improvement data group').toBeDefined();
    const edge = group!.relationships.find(
      relationship => relationship.relationship_type === 'contractor_has_license'
    );
    expect(edge).toEqual({
      type: 'relationship',
      from: 'company',
      to: 'license',
      relationship_type: 'contractor_has_license',
    });
    expect(group!.one_to_many_relationships).toContain('contractor_has_license');
    expect(group!.relationships).toContainEqual({
      type: 'relationship',
      from: 'company',
      to: 'person',
      relationship_type: 'contractor_has_person',
    });
    expect(group!.relationships).toContainEqual({
      type: 'relationship',
      from: 'property_improvement',
      to: 'company',
      relationship_type: 'property_improvement_has_contractor',
    });

    const blockchainTag = lexicon.tags.find(tag => tag.name === 'blockchain');
    expect(blockchainTag?.classes).toContain('license');
  });
});
