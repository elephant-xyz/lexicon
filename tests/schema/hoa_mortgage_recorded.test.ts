import Ajv from 'ajv/dist/ajv.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import lexiconJson from '../../src/data/lexicon.json';
import type { LexiconData } from '../../src/types/lexicon';
import { generateJSONSchemaForClass } from '../../vite-plugins/json-schema-generator';

const lexicon = lexiconJson as unknown as LexiconData;

function getClass(type: string) {
  const lexiconClass = lexicon.classes.find(candidate => candidate.type === type);
  expect(lexiconClass, `Expected ${type} class to exist`).toBeDefined();
  return lexiconClass!;
}

function validatorFor(type: string) {
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  addFormats(ajv);
  ajv.addFormat('currency', { type: 'number', validate: () => true });
  ajv.addFormat('rate_percent', { type: 'number', validate: () => true });
  return ajv.compile(generateJSONSchemaForClass(getClass(type)));
}

const sourceHttpRequest = {
  method: 'GET',
  url: 'https://publicapi.recorder.maricopa.gov/documents/20260000001',
};

// A deed of trust from a recorder index: lender and recording facts, no amount, no note terms.
const recordedLoan = {
  source_http_request: sourceHttpRequest,
  request_identifier: 'maricopa-recorder:20260000001',
  borrower_count: null,
  end_date: null,
  lien_priority_type: null,
  loan_amount: null,
  loan_closing_date: null,
  loan_purpose_type: null,
  lender_name: 'EXAMPLE BANK NA',
  mortgage_type: null,
  note_amount: null,
  note_date: null,
  note_rate_percent: null,
  occupancy: null,
  prepayment_penalty_indicator: null,
};

// An association identified from an official registry, with no published fee.
const registryHoa = {
  source_http_request: sourceHttpRequest,
  request_identifier: 'registry:1',
  homeowners_association_name: 'Example Community HOA',
  homeowners_association_type: 'Mandatory',
  homeowners_association_amount: null,
  homeowners_association_year: null,
  homeowners_association_fee_frequency: null,
  amenities: null,
  security_features: null,
  sunbiz_document_number: null,
  company_cid: null,
  property_manager_cid: null,
};

describe('loan from a recorder index', () => {
  const validate = validatorFor('loan');

  it('validates with no amount, rate or prepayment penalty', () => {
    expect(validate(recordedLoan), JSON.stringify(validate.errors)).toBe(true);
  });

  it('still requires the amount keys, so a missing value is stated as null', () => {
    const { loan_amount: _omitted, ...withoutAmount } = recordedLoan;
    expect(validate(withoutAmount)).toBe(false);
  });

  it('accepts the recording facts and release evidence', () => {
    const released = {
      ...recordedLoan,
      loan_amount: 312000,
      recording_date: '2025-07-14',
      instrument_number: '2025123456',
      book: '21500',
      page: '1234',
      lien_status: 'released',
      release_recording_date: '2026-03-02',
      release_instrument_number: '2026654321',
    };
    expect(validate(released), JSON.stringify(validate.errors)).toBe(true);
  });

  it('does not offer an open lien status', () => {
    expect(validate({ ...recordedLoan, lien_status: 'open' })).toBe(false);
    expect(validate({ ...recordedLoan, lien_status: 'unknown' })).toBe(true);
  });

  it('keeps the recording facts optional for existing producers', () => {
    const generated = generateJSONSchemaForClass(getClass('loan'));
    for (const key of [
      'recording_date',
      'instrument_number',
      'book',
      'page',
      'lien_status',
      'release_recording_date',
      'release_instrument_number',
    ]) {
      expect(generated.required).not.toContain(key);
    }
  });
});

describe('homeowners association from a registry', () => {
  const validate = validatorFor('homeowners_association');

  it('validates with no fee', () => {
    expect(validate(registryHoa), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts the recorded declaration or certificate', () => {
    const recorded = {
      ...registryHoa,
      recording_date: '2024-05-01',
      instrument_number: '20240012345',
    };
    expect(validate(recorded), JSON.stringify(validate.errors)).toBe(true);
  });
});
