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

describe('business_location lexicon concept', () => {
  it('defines a separate physical location class with source-stamped identity', () => {
    const businessLocation = getClass('business_location');

    expect(businessLocation.container_name).toBe('business_locations');
    expect(businessLocation.is_deprecated).toBe(false);
    expect(businessLocation.description).toContain('distinct from a legal company');
    expect(businessLocation.description).toContain('distinct from nearby_location');
    expect(Object.keys(businessLocation.properties)).toEqual([
      'source_system',
      'source_record_identifier',
      'source_record_version',
      'source_release',
      'source_provenance',
      'name',
      'normalized_name',
      'operating_status',
      'source_confidence',
      'taxonomy_primary',
      'taxonomy_hierarchy',
      'taxonomy_alternate',
      'basic_category',
      'brand_name',
      'brand_wikidata_identifier',
      'is_hosted_service',
      'hosted_service_rule',
    ]);

    const generatedSchema = generateJSONSchemaForClass(businessLocation);
    expect(generatedSchema.required).toEqual([
      'source_system',
      'source_record_identifier',
      'source_release',
    ]);
  });

  it('preserves Overture taxonomy semantics without closing basic_category', () => {
    const businessLocation = getClass('business_location');
    const hierarchy = businessLocation.properties.taxonomy_hierarchy;
    const basicCategory = businessLocation.properties.basic_category;

    expect(hierarchy.type).toBe('array');
    expect(hierarchy.items?.type).toBe('string');
    expect(hierarchy.comment).toContain('ordered source taxonomy path');
    expect(hierarchy.comment).toContain('L0-to-primary order');
    expect(hierarchy.comment).toContain('deprecated categories.primary');
    expect(basicCategory.enum).toBeUndefined();
    expect(basicCategory.comment).toContain('pass through unchanged');
    expect(businessLocation.properties).not.toHaveProperty('legacy_category_primary');
  });

  it('retains auditable source and hosted-service provenance', () => {
    const businessLocation = getClass('business_location');
    const provenance = businessLocation.properties.source_provenance;
    const sourceConfidence = businessLocation.properties.source_confidence;

    expect(provenance.type).toBe('array');
    expect(provenance.items?.type).toBe('object');
    expect(provenance.items?.properties).toHaveProperty('dataset');
    expect(provenance.items?.properties).toHaveProperty('record_identifier');
    expect(provenance.items?.properties).toHaveProperty('updated_at');
    expect(provenance.items?.properties).toHaveProperty('confidence');
    expect(provenance.items?.properties).toHaveProperty('license');
    expect(sourceConfidence.minimum).toBe(0);
    expect(sourceConfidence.maximum).toBe(1);
    expect(businessLocation.properties.is_hosted_service.optional).toBe(true);
    expect(businessLocation.properties.hosted_service_rule.optional).toBe(true);
    expect(businessLocation.properties.is_hosted_service.comment).toContain('advisory');
  });

  it('does not conflate the class with company or nearby_location', () => {
    const businessLocation = getClass('business_location');
    const company = getClass('company');
    const nearbyLocation = getClass('nearby_location');

    expect(company.properties).not.toHaveProperty('taxonomy_primary');
    expect(company.properties).not.toHaveProperty('source_record_identifier');
    expect(nearbyLocation.properties).toHaveProperty('distance_miles');
    expect(nearbyLocation.properties).toHaveProperty('is_walkable');
    expect(businessLocation.properties).not.toHaveProperty('distance_miles');
    expect(businessLocation.properties).not.toHaveProperty('is_walkable');
    expect(businessLocation.relationships).not.toHaveProperty('has_nearby_location');
  });

  it('uses optional entity links and requires only point geometry', () => {
    const dataGroup = lexicon.data_groups.find(
      candidate => candidate.label === 'Business Location'
    );
    expect(dataGroup).toBeDefined();

    expect(dataGroup!.relationships).toEqual([
      {
        type: 'relationship',
        from: 'business_location',
        to: 'geometry',
        relationship_type: 'business_location_has_geometry',
      },
      {
        type: 'relationship',
        from: 'business_location',
        to: 'address',
        relationship_type: 'business_location_has_address',
      },
      {
        type: 'relationship',
        from: 'business_location',
        to: 'company',
        relationship_type: 'business_location_has_company',
      },
      {
        type: 'relationship',
        from: 'business_location',
        to: 'parcel',
        relationship_type: 'business_location_has_parcel',
      },
    ]);
    expect(dataGroup!.required).toEqual(['business_location_has_geometry']);
    expect(dataGroup!.required).not.toContain('business_location_has_address');
    expect(dataGroup!.required).not.toContain('business_location_has_company');
    expect(dataGroup!.required).not.toContain('business_location_has_parcel');
    expect(dataGroup!.one_to_many_relationships).toEqual([
      'business_location_has_company',
      'business_location_has_parcel',
    ]);
  });

  it('includes the class in generated blockchain artifacts', () => {
    const blockchainTag = lexicon.tags.find(tag => tag.name === 'blockchain');
    expect(blockchainTag?.classes).toContain('business_location');
  });
});
