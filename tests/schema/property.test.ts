import { describe, it, expect } from 'vitest';
import propertySchema from './property.json';

describe('property.json Schema', () => {
  it('should be a valid JSON Schema object', () => {
    expect(propertySchema).toBeDefined();
    expect(typeof propertySchema).toBe('object');
    expect(propertySchema).not.toBeNull();
  });

  it('should have the correct JSON Schema version', () => {
    expect(propertySchema.$schema).toBe('https://json-schema.org/draft-07/schema#');
  });

  it('should have the correct title and description', () => {
    expect(propertySchema.title).toBe('property');
    expect(propertySchema.description).toBe('JSON Schema for property class in Elephant Lexicon');
  });

  it('should have the correct type and additionalProperties settings', () => {
    expect(propertySchema.type).toBe('object');
    expect(propertySchema.additionalProperties).toBe(false);
  });

  it('should have the required properties', () => {
    expect(propertySchema.required).toEqual([
      'source_http_request',
      'request_identifier',
      'livable_floor_area',
      'number_of_units_type',
      'parcel_identifier',
      'property_legal_description_text',
      'property_structure_built_year',
      'property_type',
    ]);
  });

  it('should have the correct properties structure', () => {
    expect(propertySchema.properties).toBeDefined();
    expect(propertySchema.properties).toHaveProperty('livable_floor_area');
    expect(propertySchema.properties).toHaveProperty('number_of_units_type');
    expect(propertySchema.properties).toHaveProperty('parcel_identifier');
    expect(propertySchema.properties).toHaveProperty('property_legal_description_text');
    expect(propertySchema.properties).toHaveProperty('property_structure_built_year');
    expect(propertySchema.properties).toHaveProperty('property_type');
    expect(propertySchema.properties).toHaveProperty('request_identifier');
    expect(propertySchema.properties).toHaveProperty('source_http_request');
  });

  it('should have correct livable_floor_area property definition', () => {
    const livableFloorArea = propertySchema.properties.livable_floor_area;
    expect(livableFloorArea.type).toEqual(['string', 'null']);
    expect(livableFloorArea.description).toBe(
      'The total square footage of attached, livable area excluding balconies, porches, garages, car ports, elevators, and utility rooms.'
    );
  });

  it('should have correct number_of_units_type property definition', () => {
    const numberOfUnitsType = propertySchema.properties.number_of_units_type;
    expect(numberOfUnitsType.type).toEqual(['string', 'null']);
    expect(numberOfUnitsType.enum).toEqual([
      'One',
      'Two',
      'OneToFour',
      'Three',
      'Four',
      'TwoToFour',
      null,
    ]);
    expect(numberOfUnitsType.description).toContain('number of units type in mortgage banking');
  });

  it('should have correct parcel_identifier property definition', () => {
    const parcelIdentifier = propertySchema.properties.parcel_identifier;
    expect(parcelIdentifier.type).toBe('string');
    expect(parcelIdentifier.minLength).toBe(1);
    expect(parcelIdentifier.description).toBe(
      'Each parcel of land has a unique Parcel ID that distinguishes it from all other parcels within the jurisdiction.'
    );
  });

  it('should have correct property_legal_description_text property definition', () => {
    const propertyLegalDescriptionText = propertySchema.properties.property_legal_description_text;
    expect(propertyLegalDescriptionText.type).toBe('string');
    expect(propertyLegalDescriptionText.minLength).toBe(1);
    expect(propertyLegalDescriptionText.description).toBe(
      'A detailed legal description of the property, often used in legal documents and contracts. This typically outlines the exact boundaries, dimensions, and location of the property as recognized by local or state governments.'
    );
  });

  it('should have correct property_structure_built_year property definition', () => {
    const propertyStructureBuiltYear = propertySchema.properties.property_structure_built_year;
    expect(propertyStructureBuiltYear.type).toEqual(['integer', 'null']);
    expect(propertyStructureBuiltYear.description).toBe(
      'The year in which the dwelling on the property was completed.'
    );
  });

  it('should have correct property_type property definition', () => {
    const propertyType = propertySchema.properties.property_type;
    expect(propertyType.type).toEqual(['string', 'null']);
    expect(propertyType.enum).toEqual([
      'Cooperative',
      'Condominium',
      'Modular',
      'ManufacturedHousingMultiWide',
      'Pud',
      'Timeshare',
      '2Units',
      'DetachedCondominium',
      'Duplex',
      'SingleFamily',
      'TwoToFourFamily',
      'MultipleFamily',
      '3Units',
      'ManufacturedHousing',
      'ManufacturedHousingSingleWide',
      '4Units',
      'Townhouse',
      'NonWarrantableCondo',
      'Other',
      null,
    ]);
    expect(propertyType.description).toContain(
      'Property type refers to the classification of a real estate property'
    );
  });

  it('should have correct request_identifier property definition', () => {
    const requestIdentifier = propertySchema.properties.request_identifier;
    expect(requestIdentifier.type).toEqual(['string', 'null']);
    expect(requestIdentifier.description).toBe(
      'Identifier value that should be substituted into the source HTTP request to retrieve this specific data.'
    );
  });

  it('should have correct source_http_request property structure', () => {
    const sourceHttpRequest = propertySchema.properties.source_http_request;
    expect(sourceHttpRequest.type).toBe('object');
    expect(sourceHttpRequest.additionalProperties).toBe(false);
    expect(sourceHttpRequest.description).toBe(
      'HTTP request configuration for retrieving this data.'
    );
    expect(sourceHttpRequest.required).toEqual(['method', 'url']);
  });

  it('should have correct source_http_request sub-properties', () => {
    const sourceHttpRequest = propertySchema.properties.source_http_request;
    expect(sourceHttpRequest.properties).toHaveProperty('method');
    expect(sourceHttpRequest.properties).toHaveProperty('url');
    expect(sourceHttpRequest.properties).toHaveProperty('body');
    expect(sourceHttpRequest.properties).toHaveProperty('json');
    expect(sourceHttpRequest.properties).toHaveProperty('headers');
    expect(sourceHttpRequest.properties).toHaveProperty('multiValueQueryString');
  });

  it('should have correct method property definition', () => {
    const method = propertySchema.properties.source_http_request.properties.method;
    expect(method.type).toEqual(['string', 'null']);
    expect(method.enum).toEqual(['GET', 'POST', 'PUT', 'PATCH', null]);
  });

  it('should have correct url property definition', () => {
    const url = propertySchema.properties.source_http_request.properties.url;
    expect(url.type).toEqual(['string', 'null']);
    expect(url.description).toBe('The URL endpoint for the request.');
    expect(url.pattern).toBe('^https?://[a-zA-Z0-9.-]+(:[0-9]+)?(/[a-zA-Z0-9._-]+)*$');
  });

  it('should have correct body property definition', () => {
    const body = propertySchema.properties.source_http_request.properties.body;
    expect(body.type).toEqual(['string', 'null']);
    expect(body.description).toBe(
      'The body of the request, which may contain JSON or other data formats.'
    );
  });

  it('should have correct json property definition', () => {
    const json = propertySchema.properties.source_http_request.properties.json;
    expect(json.type).toEqual(['object', 'array', 'null']);
  });

  it('should have correct headers property definition', () => {
    const headers = propertySchema.properties.source_http_request.properties.headers;
    expect(headers.type).toEqual(['object', 'null']);
    expect(headers.additionalProperties).toBe(false);
    expect(headers.properties).toHaveProperty('content-type');
  });

  it('should have correct content-type header definition', () => {
    const contentType =
      propertySchema.properties.source_http_request.properties.headers.properties['content-type'];
    expect(contentType.type).toEqual(['string', 'null']);
    expect(contentType.description).toBe(
      'Content-Type header for the request, indicating the media type of the resource.'
    );
    expect(contentType.enum).toEqual(['application/json', 'multipart/form-data', 'text/xml', null]);
  });

  it('should have correct multiValueQueryString property definition', () => {
    const multiValueQueryString =
      propertySchema.properties.source_http_request.properties.multiValueQueryString;
    expect(multiValueQueryString.type).toEqual(['object', 'null']);
  });

  it('should have the allOf validation rules', () => {
    expect(propertySchema.allOf).toBeDefined();
    expect(Array.isArray(propertySchema.allOf)).toBe(true);
    expect(propertySchema.allOf.length).toBeGreaterThan(0);
  });

  it('should have conditional validation rules for HTTP requests', () => {
    const allOfRules = propertySchema.allOf;
    const httpRequestRule = allOfRules.find(
      rule => rule.if?.properties?.source_http_request?.type === 'object'
    );
    expect(httpRequestRule).toBeDefined();
  });

  it('should validate GET requests cannot have body, json, or headers', () => {
    const allOfRules = propertySchema.allOf;
    const getRequestRule = allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
      rule.if?.properties?.method?.enum?.includes('GET')
    );
    expect(getRequestRule).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toHaveLength(3);
  });

  it('should validate POST/PUT/PATCH with JSON content-type requires json field', () => {
    const allOfRules = propertySchema.allOf;
    const jsonContentRule = allOfRules[0].then.properties.source_http_request.allOf.find(
      rule =>
        rule.if?.properties?.headers?.properties?.['content-type']?.const === 'application/json' &&
        rule.if?.properties?.method?.enum?.includes('POST')
    );
    expect(jsonContentRule).toBeDefined();
    expect(jsonContentRule.then.required).toContain('json');
    expect(jsonContentRule.then.not.required).toContain('body');
  });

  it('should validate POST/PUT/PATCH with non-JSON content-type requires body field', () => {
    const allOfRules = propertySchema.allOf;
    const nonJsonContentRule = allOfRules[0].then.properties.source_http_request.allOf.find(
      rule =>
        rule.if?.properties?.headers?.properties?.['content-type']?.not?.const ===
          'application/json' && rule.if?.properties?.method?.enum?.includes('POST')
    );
    expect(nonJsonContentRule).toBeDefined();
    expect(nonJsonContentRule.then.required).toContain('body');
    expect(nonJsonContentRule.then.not.required).toContain('json');
  });

  it('should validate json field requires application/json content-type', () => {
    const allOfRules = propertySchema.allOf;
    const jsonRequiresContentTypeRule =
      allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
        rule.if?.required?.includes('json')
      );
    expect(jsonRequiresContentTypeRule).toBeDefined();
    expect(
      jsonRequiresContentTypeRule.then.properties.headers.properties['content-type'].const
    ).toBe('application/json');
    expect(jsonRequiresContentTypeRule.then.properties.headers.required).toContain('content-type');
  });

  it('should validate body field requires non-application/json content-type', () => {
    const allOfRules = propertySchema.allOf;
    const bodyRequiresContentTypeRule =
      allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
        rule.if?.required?.includes('body')
      );
    expect(bodyRequiresContentTypeRule).toBeDefined();
    expect(
      bodyRequiresContentTypeRule.then.properties.headers.properties['content-type'].not.const
    ).toBe('application/json');
    expect(bodyRequiresContentTypeRule.then.properties.headers.required).toContain('content-type');
  });

  it('should have all required properties for a complete property record', () => {
    const requiredProps = propertySchema.required;
    expect(requiredProps).toContain('source_http_request');
    expect(requiredProps).toContain('request_identifier');
    expect(requiredProps).toContain('livable_floor_area');
    expect(requiredProps).toContain('number_of_units_type');
    expect(requiredProps).toContain('parcel_identifier');
    expect(requiredProps).toContain('property_legal_description_text');
    expect(requiredProps).toContain('property_structure_built_year');
    expect(requiredProps).toContain('property_type');
  });

  it('should have proper enum values for property_type', () => {
    const propertyType = propertySchema.properties.property_type;
    const expectedTypes = [
      'Cooperative',
      'Condominium',
      'Modular',
      'ManufacturedHousingMultiWide',
      'Pud',
      'Timeshare',
      '2Units',
      'DetachedCondominium',
      'Duplex',
      'SingleFamily',
      'TwoToFourFamily',
      'MultipleFamily',
      '3Units',
      'ManufacturedHousing',
      'ManufacturedHousingSingleWide',
      '4Units',
      'Townhouse',
      'NonWarrantableCondo',
      'Other',
      null,
    ];
    expect(propertyType.enum).toEqual(expectedTypes);
  });

  it('should have proper enum values for number_of_units_type', () => {
    const numberOfUnitsType = propertySchema.properties.number_of_units_type;
    const expectedUnitTypes = ['One', 'Two', 'OneToFour', 'Three', 'Four', 'TwoToFour', null];
    expect(numberOfUnitsType.enum).toEqual(expectedUnitTypes);
  });
});
