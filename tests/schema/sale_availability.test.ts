import Ajv from 'ajv/dist/ajv.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import lexiconJson from '../../src/data/lexicon.json';
import type { LexiconData } from '../../src/types/lexicon';
import { generateJSONSchemaForClass } from '../../vite-plugins/json-schema-generator';

const lexicon = lexiconJson as unknown as LexiconData;
const shaA = 'a'.repeat(64);
const shaB = 'b'.repeat(64);

function getClass(type: string) {
  const lexiconClass = lexicon.classes.find(candidate => candidate.type === type);
  expect(lexiconClass, `Expected ${type} class to exist`).toBeDefined();
  return lexiconClass!;
}

function validatorFor(type: string) {
  const ajv = new Ajv({ allErrors: true, strict: true, validateSchema: false });
  addFormats(ajv);
  return ajv.compile(generateJSONSchemaForClass(getClass(type)));
}

const listingObservation = {
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
};

const assessment = {
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
};

describe('sale availability graph model', () => {
  it('publishes the exact immutable observation fields and enums', () => {
    const observation = getClass('listing_observation');

    expect(observation.container_name).toBe('listing_observations');
    expect(Object.keys(observation.properties)).toEqual([
      'model_version',
      'observation_identifier',
      'provider_identifier',
      'source_request_identifier',
      'source_listing_identifier',
      'source_url',
      'source_as_of',
      'source_status',
      'retrieved_at',
      'observation_outcome',
      'market_status',
      'asking_price_amount_minor',
      'asking_price_currency',
      'price_parse_status',
      'evidence_artifact_uri',
      'evidence_artifact_sha256',
      'exact_address_match_state',
      'freshness_state',
      'freshness_evaluated_at',
      'freshness_policy_version',
      'coverage_state',
      'authority_state',
    ]);
    expect(observation.properties.model_version.const).toBe('1.0.0');
    expect(observation.properties.observation_outcome.enum).toEqual([
      'LISTING_FOUND',
      'LISTING_ABSENT',
      'LOOKUP_FAILED',
    ]);
    expect(observation.properties.market_status.enum).toEqual([
      'ACTIVE',
      'COMING_SOON',
      'PENDING',
      'UNDER_CONTRACT',
      'OTHER',
      'UNKNOWN',
    ]);
    expect(observation.properties.asking_price_amount_minor.minimum).toBe(1);
    expect(observation.properties.evidence_artifact_sha256.pattern).toBe('^[a-f0-9]{64}$');
    expect(observation.description).toContain('lowercase SHA-256 hash');
  });

  it('requires nullable observation fields and rejects non-null rejected prices', () => {
    const validate = validatorFor('listing_observation');

    expect(validate(listingObservation), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...listingObservation, source_url: undefined })).toBe(false);
    expect(
      validate({
        ...listingObservation,
        price_parse_status: 'REJECTED',
        asking_price_amount_minor: null,
        asking_price_currency: null,
      }),
      JSON.stringify(validate.errors)
    ).toBe(true);
    expect(
      validate({
        ...listingObservation,
        price_parse_status: 'REJECTED',
        asking_price_amount_minor: 1,
      })
    ).toBe(false);
    expect(
      validate({
        ...listingObservation,
        price_parse_status: 'REJECTED',
        asking_price_amount_minor: 0,
      })
    ).toBe(false);
  });

  it('enforces the availability status boolean projection and reason codes', () => {
    const availability = getClass('sale_availability_assessment');
    const validate = validatorFor('sale_availability_assessment');

    expect(availability.container_name).toBe('sale_availability_assessments');
    expect(availability.properties.model_version.const).toBe('1.1.0');
    expect(availability.properties.availability_status.enum).toEqual([
      'FOR_SALE',
      'NOT_FOR_SALE',
      'UNKNOWN',
      'CONFLICT',
    ]);
    expect(availability.properties.reason_codes.minItems).toBe(1);
    expect(availability.description).toContain('sorted listing observation identifiers');

    expect(validate(assessment), JSON.stringify(validate.errors)).toBe(true);
    expect(
      validate({
        ...assessment,
        availability_status: 'NOT_FOR_SALE',
        is_for_sale: false,
        list_price_amount_minor: null,
        list_price_currency: null,
      })
    ).toBe(true);
    expect(
      validate({
        ...assessment,
        availability_status: 'UNKNOWN',
        is_for_sale: null,
        list_price_amount_minor: null,
        list_price_currency: null,
      })
    ).toBe(true);
    expect(
      validate({
        ...assessment,
        availability_status: 'CONFLICT',
        is_for_sale: null,
        list_price_amount_minor: null,
        list_price_currency: null,
      })
    ).toBe(true);
    expect(validate({ ...assessment, availability_status: 'FOR_SALE', is_for_sale: false })).toBe(
      false
    );
    expect(validate({ ...assessment, reason_codes: [] })).toBe(false);
    expect(validate({ ...assessment, reason_codes: ['A', 'A'] })).toBe(false);
  });

  it('publishes required, one-to-many, and optional Sale Availability links', () => {
    const dataGroup = lexicon.data_groups.find(group => group.label === 'Sale Availability');
    expect(dataGroup).toBeDefined();
    expect(dataGroup!.relationships).toEqual([
      {
        type: 'relationship',
        from: 'listing_observation',
        to: 'address',
        relationship_type: 'listing_observation_has_address',
      },
      {
        type: 'relationship',
        from: 'listing_observation',
        to: 'file',
        relationship_type: 'listing_observation_has_file',
      },
      {
        type: 'relationship',
        from: 'listing_observation',
        to: 'property',
        relationship_type: 'listing_observation_has_property',
      },
      {
        type: 'relationship',
        from: 'sale_availability_assessment',
        to: 'address',
        relationship_type: 'sale_availability_assessment_has_address',
      },
      {
        type: 'relationship',
        from: 'sale_availability_assessment',
        to: 'listing_observation',
        relationship_type: 'sale_availability_assessment_has_listing_observation',
      },
      {
        type: 'relationship',
        from: 'sale_availability_assessment',
        to: 'property',
        relationship_type: 'sale_availability_assessment_has_property',
      },
    ]);
    expect(dataGroup!.required).toEqual([
      'listing_observation_has_address',
      'listing_observation_has_file',
      'sale_availability_assessment_has_address',
      'sale_availability_assessment_has_listing_observation',
    ]);
    expect(dataGroup!.one_to_many_relationships).toEqual([
      'listing_observation_has_file',
      'sale_availability_assessment_has_listing_observation',
    ]);
    expect(dataGroup!.required).not.toContain('listing_observation_has_property');
    expect(dataGroup!.required).not.toContain('sale_availability_assessment_has_property');
  });

  it('registers classes and edge labels in governed blockchain metadata', () => {
    const blockchainTag = lexicon.tags.find(tag => tag.name === 'blockchain');
    const relationship = getClass('relationship');
    const edgeLabels = relationship.properties.type.enum;

    expect(blockchainTag?.classes).toContain('listing_observation');
    expect(blockchainTag?.classes).toContain('sale_availability_assessment');
    for (const label of [
      'listing_observation_has_address',
      'listing_observation_has_file',
      'listing_observation_has_property',
      'sale_availability_assessment_has_address',
      'sale_availability_assessment_has_listing_observation',
      'sale_availability_assessment_has_property',
    ]) {
      expect(edgeLabels).toContain(label);
    }
  });
});
