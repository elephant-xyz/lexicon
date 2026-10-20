import Ajv from 'ajv/dist/ajv.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import lexiconJson from '../../src/data/lexicon.json';
import type { LexiconData } from '../../src/types/lexicon';
import { generateJSONSchemaForClass } from '../../vite-plugins/json-schema-generator';

const lexicon = lexiconJson as unknown as LexiconData;
const property = lexicon.classes.find(candidate => candidate.type === 'property');

if (!property) {
  throw new Error('Expected the canonical property class to exist');
}

const propertySchema = generateJSONSchemaForClass(property);
const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
addFormats(ajv);
const validateProperty = ajv.compile(propertySchema);

const existingPropertyRecord = {
  source_http_request: {
    method: 'GET',
    url: 'https://evidence.example/property/parcel-123',
  },
  request_identifier: 'parcel-123',
  parcel_identifier: 'parcel-123',
  property_legal_description_text: 'LOT 1 BLOCK A',
  property_type: 'LandParcel',
};

describe('property hoa_mandatory evidence contract', () => {
  it('publishes an optional nullable boolean with the fail-closed source policy', () => {
    const sourceProperty = property.properties.hoa_mandatory;
    const generatedProperty = propertySchema.properties.hoa_mandatory as Record<string, unknown>;

    expect(sourceProperty).toMatchObject({
      type: ['boolean', 'null'],
      optional: true,
    });
    expect(sourceProperty.comment).toContain(
      'authoritative or adjudicated exact-property evidence'
    );
    expect(sourceProperty.comment).toContain('absence must never default to false');
    expect(sourceProperty.comment).toContain('inference-only');
    expect(sourceProperty.comment).toContain('master and sub-association distinctions');
    expect(generatedProperty.type).toEqual(['boolean', 'null']);
    expect(generatedProperty).not.toHaveProperty('default');
    expect(propertySchema.required).not.toContain('hoa_mandatory');
  });

  it.each([true, false, null])('accepts the reviewed tri-state value %s', hoaMandatory => {
    const candidate = { ...existingPropertyRecord, hoa_mandatory: hoaMandatory };
    expect(validateProperty(candidate), JSON.stringify(validateProperty.errors)).toBe(true);
  });

  it('accepts omission for an existing property record without adding a default', () => {
    const candidate = structuredClone(existingPropertyRecord);

    expect(validateProperty(candidate), JSON.stringify(validateProperty.errors)).toBe(true);
    expect(candidate).not.toHaveProperty('hoa_mandatory');
  });

  it.each(['true', 'false', 1, 0])('rejects the non-boolean value %j', hoaMandatory => {
    expect(validateProperty({ ...existingPropertyRecord, hoa_mandatory: hoaMandatory })).toBe(
      false
    );
  });
});
