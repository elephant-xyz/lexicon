import Ajv from 'ajv/dist/ajv.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import lexiconJson from '../../src/data/lexicon.json';
import type { LexiconData } from '../../src/types/lexicon';
import { generateJSONSchemaForClass } from '../../vite-plugins/json-schema-generator';

const lexicon = lexiconJson as unknown as LexiconData;
const improvement = lexicon.classes.find(candidate => candidate.type === 'property_improvement');

if (!improvement) {
  throw new Error('Expected the property_improvement class to exist');
}

const improvementSchema = generateJSONSchemaForClass(improvement);
const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
addFormats(ajv);
ajv.addFormat('currency', true);
const validateImprovement = ajv.compile(improvementSchema);

// A permit as the Travis County pipeline publishes it today (data.austintexas.gov 3syk-w9eu).
const existingPermit = {
  source_http_request: {
    method: 'GET',
    url: 'https://data.austintexas.gov/resource/3syk-w9eu.csv',
  },
  request_identifier: '721338',
  permit_number: '2024-127444 BP',
  improvement_type: 'GeneralBuilding',
  improvement_status: 'Completed',
  completion_date: '2025-12-29',
  contractor_type: 'GeneralContractor',
};

describe('property_improvement job_value_amount', () => {
  it('is an optional nullable currency number, separate from the permit fee', () => {
    const sourceProperty = improvement.properties.job_value_amount;
    const generated = improvementSchema.properties.job_value_amount as Record<string, unknown>;

    expect(sourceProperty).toMatchObject({
      type: ['number', 'null'],
      format: 'currency',
      optional: true,
    });
    expect(sourceProperty.comment).toContain('as printed by the issuing authority');
    expect(sourceProperty.comment).toContain('not the permit fee');
    expect(generated.type).toEqual(['number', 'null']);
    expect(generated.format).toBe('currency');
    expect(generated).not.toHaveProperty('default');
    expect(improvementSchema.required).not.toContain('job_value_amount');
    expect(improvementSchema.properties).toHaveProperty('fee');
  });

  it.each([125000, 18500.5, 0, null])('accepts the value %j', jobValue => {
    const candidate = { ...existingPermit, job_value_amount: jobValue };
    expect(validateImprovement(candidate), JSON.stringify(validateImprovement.errors)).toBe(true);
  });

  it('keeps existing permits valid when the field is omitted', () => {
    expect(validateImprovement(existingPermit), JSON.stringify(validateImprovement.errors)).toBe(
      true
    );
  });

  it.each(['125000', true, {}])('rejects the non-numeric value %j', jobValue => {
    expect(validateImprovement({ ...existingPermit, job_value_amount: jobValue })).toBe(false);
  });
});
