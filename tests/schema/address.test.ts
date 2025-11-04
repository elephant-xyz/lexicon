import { describe, it, expect } from 'vitest';
import addressSchema from './address.json';

describe('address.json Schema', () => {
  it('should be a valid JSON Schema object', () => {
    expect(addressSchema).toBeDefined();
    expect(typeof addressSchema).toBe('object');
    expect(addressSchema).not.toBeNull();
  });

  it('should have the correct JSON Schema version', () => {
    expect(addressSchema.$schema).toBe('https://json-schema.org/draft-07/schema#');
  });

  it('should have the correct title and description', () => {
    expect(addressSchema.title).toBe('address');
    expect(addressSchema.description).toBe('JSON Schema for address class in Elephant Lexicon');
  });

  it('should have the correct type', () => {
    expect(addressSchema.type).toBe('object');
  });

  it('should have a oneOf structure with two options', () => {
    expect(addressSchema.oneOf).toBeDefined();
    expect(Array.isArray(addressSchema.oneOf)).toBe(true);
    expect(addressSchema.oneOf.length).toBe(2);
  });

  it('should have option 1: unnormalized_address with source_http_request, request_identifier', () => {
    const option1 = addressSchema.oneOf[0];
    expect(option1.type).toBe('object');
    expect(option1.description).toBe('Address with unnormalized format');
    expect(option1.additionalProperties).toBe(false);
    expect(option1.required).toEqual([
      'source_http_request',
      'request_identifier',
      'latitude',
      'longitude',
      'unnormalized_address',
    ]);
    // Check that option 1 has all the same properties as option 2 (order doesn't matter)
    const expectedProperties = [
      'block',
      'city_name',
      'country_code',
      'county_name',
      'latitude',
      'longitude',
      'lot',
      'municipality_name',
      'plus_four_postal_code',
      'postal_code',
      'range',
      'request_identifier',
      'route_number',
      'section',
      'source_http_request',
      'state_code',
      'township',
      'unit_identifier',
      'unnormalized_address',
    ];
    expect(Object.keys(option1.properties).sort()).toEqual(expectedProperties.sort());
  });

  it('should have option 2: structured fields with source_http_request and request_identifier', () => {
    const option2 = addressSchema.oneOf[1];
    expect(option2.type).toBe('object');
    expect(option2.description).toBe('Address with structured fields');
    expect(option2.additionalProperties).toBe(false);
    expect(option2.required).toContain('source_http_request');
    expect(option2.required).toContain('request_identifier');
    expect(option2.required).toContain('city_name');
    expect(option2.required).toContain('country_code');
    expect(option2.required).toContain('street_name');
    expect(option2.required).not.toContain('unnormalized_address');
  });

  it('should have the correct properties structure in option 2 (structured fields)', () => {
    const option2Properties = addressSchema.oneOf[1].properties;
    expect(option2Properties).toBeDefined();
    expect(option2Properties).toHaveProperty('block');
    expect(option2Properties).toHaveProperty('city_name');
    expect(option2Properties).toHaveProperty('country_code');
    expect(option2Properties).toHaveProperty('county_name');
    expect(option2Properties).toHaveProperty('latitude');
    expect(option2Properties).toHaveProperty('longitude');
    expect(option2Properties).toHaveProperty('plus_four_postal_code');
    expect(option2Properties).toHaveProperty('postal_code');
    expect(option2Properties).toHaveProperty('range');
    expect(option2Properties).toHaveProperty('request_identifier');
    expect(option2Properties).toHaveProperty('section');
    expect(option2Properties).toHaveProperty('source_http_request');
    expect(option2Properties).toHaveProperty('state_code');
    expect(option2Properties).toHaveProperty('street_name');
    expect(option2Properties).toHaveProperty('street_post_directional_text');
    expect(option2Properties).toHaveProperty('street_pre_directional_text');
    expect(option2Properties).toHaveProperty('street_number');
    expect(option2Properties).toHaveProperty('street_suffix_type');
    expect(option2Properties).toHaveProperty('township');
    expect(option2Properties).toHaveProperty('unit_identifier');
  });

  it('should have correct block property definition in option 2', () => {
    const block = addressSchema.oneOf[1].properties.block;
    expect(block.type).toEqual(['string', 'null']);
    expect(block.description).toContain('A block is a further subdivision within a plat');
  });

  it('should have correct city_name property definition in option 2', () => {
    const cityName = addressSchema.oneOf[1].properties.city_name;
    expect(cityName.type).toEqual(['string', 'null']);
    expect(cityName.minLength).toBe(1);
    expect(cityName.description).toContain(
      'City name refers to the name of the city in which the address is located'
    );
  });

  it('should have correct country_code property definition in option 2', () => {
    const countryCode = addressSchema.oneOf[1].properties.country_code;
    expect(countryCode.type).toEqual(['string', 'null']);
    expect(countryCode.minLength).toBe(1);
    expect(countryCode.description).toContain(
      'Country code is a code that represents the country in which the address is located'
    );
  });

  it('should have correct county_name property definition in option 2', () => {
    const countyName = addressSchema.oneOf[1].properties.county_name;
    expect(countyName.type).toBe('string'); // county_name uses enum, so it's just string
    expect(countyName.enum).toBeDefined(); // county_name uses enum, not pattern
    expect(countyName.description).toContain(
      'County name refers to the name of the county in which the address is located'
    );
  });

  it('should have correct latitude property definition in option 2', () => {
    const latitude = addressSchema.oneOf[1].properties.latitude;
    expect(latitude.type).toEqual(['number', 'null']);
    expect(latitude.description).toContain(
      'Latitude is a coordinate that specifies the north-south position'
    );
  });

  it('should have correct longitude property definition in option 2', () => {
    const longitude = addressSchema.oneOf[1].properties.longitude;
    expect(longitude.type).toEqual(['number', 'null']);
    expect(longitude.description).toContain(
      'Longitude is a coordinate that specifies the east-west position'
    );
  });

  it('should have correct plus_four_postal_code property definition in option 2', () => {
    const plusFourPostalCode = addressSchema.oneOf[1].properties.plus_four_postal_code;
    expect(plusFourPostalCode.type).toEqual(['string', 'null']);
    expect(plusFourPostalCode.pattern).toBe('^\\d{4}$');
    expect(plusFourPostalCode.description).toContain(
      'A postal code plus four, also known as a ZIP code plus four'
    );
  });

  it('should have correct postal_code property definition in option 2', () => {
    const postalCode = addressSchema.oneOf[1].properties.postal_code;
    expect(postalCode.type).toEqual(['string', 'null']);
    expect(postalCode.pattern).toBe('^\\d{5}$');
    expect(postalCode.description).toContain('A postal code, also known as a ZIP code');
  });

  it('should have correct range property definition in option 2', () => {
    const range = addressSchema.oneOf[1].properties.range;
    expect(range.type).toEqual(['string', 'null']);
    expect(range.description).toContain('A range describes the east-west position of a township');
  });

  it('should have correct request_identifier property definition in option 2', () => {
    const requestIdentifier = addressSchema.oneOf[1].properties.request_identifier;
    expect(requestIdentifier.type).toEqual(['string', 'null']);
    expect(requestIdentifier.description).toBe(
      'Identifier value that should be substituted into the source HTTP request to retrieve this specific data.'
    );
  });

  it('should have correct section property definition in option 2', () => {
    const section = addressSchema.oneOf[1].properties.section;
    expect(section.type).toEqual(['string', 'null']);
    expect(section.description).toContain('Each township is divided into 36 sections');
  });

  it('should have correct source_http_request property structure in option 2', () => {
    const sourceHttpRequest = addressSchema.oneOf[1].properties.source_http_request;
    expect(sourceHttpRequest.type).toBe('object');
    expect(sourceHttpRequest.additionalProperties).toBe(false);
    expect(sourceHttpRequest.description).toBe(
      'HTTP request configuration for retrieving this data.'
    );
    expect(sourceHttpRequest.required).toEqual(['method', 'url']);
  });

  it('should have correct source_http_request sub-properties in option 2', () => {
    const sourceHttpRequest = addressSchema.oneOf[1].properties.source_http_request;
    expect(sourceHttpRequest.properties).toHaveProperty('method');
    expect(sourceHttpRequest.properties).toHaveProperty('url');
    expect(sourceHttpRequest.properties).toHaveProperty('body');
    expect(sourceHttpRequest.properties).toHaveProperty('json');
    expect(sourceHttpRequest.properties).toHaveProperty('headers');
    expect(sourceHttpRequest.properties).toHaveProperty('multiValueQueryString');
  });

  it('should have correct method property definition in option 2', () => {
    const method = addressSchema.oneOf[1].properties.source_http_request.properties.method;
    expect(method.type).toBe('string');
    expect(method.enum).toEqual(['GET', 'POST', 'PUT', 'PATCH', null]);
  });

  it('should have correct url property definition in option 2', () => {
    const url = addressSchema.oneOf[1].properties.source_http_request.properties.url;
    expect(url.type).toBe('string');
    expect(url.description).toBe('The URL endpoint for the request.');
    expect(url.pattern).toBe('^https?://[a-zA-Z0-9.-]+(:[0-9]+)?(/[#a-zA-Z0-9._%-]+)*$');
  });

  it('should have correct body property definition in option 2', () => {
    const body = addressSchema.oneOf[1].properties.source_http_request.properties.body;
    expect(body.type).toBe('string');
    expect(body.description).toBe(
      'The body of the request, which may contain JSON or other data formats.'
    );
  });

  it('should have correct json property definition in option 2', () => {
    const json = addressSchema.oneOf[1].properties.source_http_request.properties.json;
    expect(json.type).toEqual(['object', 'array']);
  });

  it('should have correct headers property definition in option 2', () => {
    const headers = addressSchema.oneOf[1].properties.source_http_request.properties.headers;
    expect(headers.type).toBe('object');
    expect(headers.additionalProperties).toBe(false);
    expect(headers.properties).toHaveProperty('content-type');
  });

  it('should have correct content-type header definition in option 2', () => {
    const contentType =
      addressSchema.oneOf[1].properties.source_http_request.properties.headers.properties[
        'content-type'
      ];
    expect(contentType.type).toBe('string');
    expect(contentType.description).toBe(
      'Content-Type header for the request, indicating the media type of the resource.'
    );
    expect(contentType.enum).toEqual([
      'application/json',
      'multipart/form-data',
      'text/xml',
      'application/x-www-form-urlencoded',
      null,
    ]);
  });

  it('should have correct multiValueQueryString property definition in option 2', () => {
    const multiValueQueryString =
      addressSchema.oneOf[1].properties.source_http_request.properties.multiValueQueryString;
    expect(multiValueQueryString.type).toBe('object');
  });

  it('should have correct state_code property definition in option 2', () => {
    const stateCode = addressSchema.oneOf[1].properties.state_code;
    expect(stateCode.type).toEqual(['string', 'null']);
    expect(stateCode.pattern).toBe('^[A-Z]{2}$');
    expect(stateCode.description).toBe(
      'State code is a code that represents the state in which the address is located.'
    );
  });

  it('should have correct street_name property definition in option 2', () => {
    const streetName = addressSchema.oneOf[1].properties.street_name;
    expect(streetName.type).toEqual(['string', 'null']);
    expect(streetName.minLength).toBe(1);
    expect(streetName.pattern).toBe('^(?!.*(\\b(E|N|NE|NW|S|SE|SW|W)\\b)).*$');
    expect(streetName.description).toBe(
      "A street name that doesn't contain directional abbreviations"
    );
  });

  it('should have correct street_number property definition in option 2', () => {
    const streetNumber = addressSchema.oneOf[1].properties.street_number;
    expect(streetNumber.type).toEqual(['string', 'null']);
    expect(streetNumber.minLength).toBe(1);
    expect(streetNumber.description).toContain(
      'Street  number refers to the numerical part of a street address'
    );
  });

  it('should have correct street_post_directional_text property definition in option 2', () => {
    const streetPostDirectionalText =
      addressSchema.oneOf[1].properties.street_post_directional_text;
    expect(streetPostDirectionalText.type).toEqual(['string', 'null']);
    expect(streetPostDirectionalText.enum).toEqual([
      'N',
      'S',
      'E',
      'W',
      'NE',
      'NW',
      'SE',
      'SW',
      null,
    ]);
    expect(streetPostDirectionalText.description).toContain(
      'Street post directional text refers to the directional indicator or suffix'
    );
  });

  it('should have correct street_pre_directional_text property definition in option 2', () => {
    const streetPreDirectionalText = addressSchema.oneOf[1].properties.street_pre_directional_text;
    expect(streetPreDirectionalText.type).toEqual(['string', 'null']);
    expect(streetPreDirectionalText.enum).toEqual([
      'N',
      'S',
      'E',
      'W',
      'NE',
      'NW',
      'SE',
      'SW',
      null,
    ]);
    expect(streetPreDirectionalText.description).toContain(
      'Street pre directional text refers to the directional indicator or prefix'
    );
  });

  it('should have correct street_suffix_type property definition in option 2', () => {
    const streetSuffixType = addressSchema.oneOf[1].properties.street_suffix_type;
    expect(streetSuffixType.type).toEqual(['string', 'null']);
    expect(streetSuffixType.enum).toBeDefined();
    expect(streetSuffixType.enum.length).toBeGreaterThan(100); // Large enum of street suffixes
  });

  it('should have correct township property definition in option 2', () => {
    const township = addressSchema.oneOf[1].properties.township;
    expect(township.type).toEqual(['string', 'null']);
    expect(township.description).toContain('A township is a 6-mile by 6-mile square of land');
  });

  it('should have correct unit_identifier property definition in option 2', () => {
    const unitIdentifier = addressSchema.oneOf[1].properties.unit_identifier;
    expect(unitIdentifier.type).toEqual(['string', 'null']);
    expect(unitIdentifier.minLength).toBe(1);
    expect(unitIdentifier.description).toContain(
      'A unit identifier is a reference to the specific unit, suite, apartment'
    );
  });

  it('should have the allOf validation rules', () => {
    expect(addressSchema.allOf).toBeDefined();
    expect(Array.isArray(addressSchema.allOf)).toBe(true);
    expect(addressSchema.allOf.length).toBeGreaterThan(0);
  });

  it('should have conditional validation rules for HTTP requests', () => {
    const allOfRules = addressSchema.allOf;
    const httpRequestRule = allOfRules.find(
      rule => rule.if?.properties?.source_http_request?.type === 'object'
    );
    expect(httpRequestRule).toBeDefined();
  });

  it('should validate GET requests cannot have body, json, or headers', () => {
    const allOfRules = addressSchema.allOf;
    const getRequestRule = allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
      rule.if?.properties?.method?.enum?.includes('GET')
    );
    expect(getRequestRule).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toHaveLength(3);
  });

  it('should validate POST/PUT/PATCH with JSON content-type requires json field', () => {
    const allOfRules = addressSchema.allOf;
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
    const allOfRules = addressSchema.allOf;
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
    const allOfRules = addressSchema.allOf;
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
    const allOfRules = addressSchema.allOf;
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

  it('should have all required properties for option 2 (structured fields)', () => {
    const requiredProps = addressSchema.oneOf[1].required;
    expect(requiredProps).toContain('source_http_request');
    expect(requiredProps).toContain('request_identifier');
    expect(requiredProps).toContain('city_name');
    expect(requiredProps).toContain('country_code');
    expect(requiredProps).toContain('latitude');
    expect(requiredProps).toContain('longitude');
    expect(requiredProps).toContain('plus_four_postal_code');
    expect(requiredProps).toContain('postal_code');
    expect(requiredProps).toContain('state_code');
    expect(requiredProps).toContain('street_name');
    expect(requiredProps).toContain('street_post_directional_text');
    expect(requiredProps).toContain('street_pre_directional_text');
    expect(requiredProps).toContain('street_number');
    expect(requiredProps).toContain('street_suffix_type');
    expect(requiredProps).toContain('unit_identifier');
    expect(requiredProps).toContain('township');
    expect(requiredProps).toContain('range');
    expect(requiredProps).toContain('section');
    expect(requiredProps).toContain('block');
  });

  it('should have proper enum values for street_post_directional_text in option 2', () => {
    const streetPostDirectionalText =
      addressSchema.oneOf[1].properties.street_post_directional_text;
    const expectedDirections = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', null];
    expect(streetPostDirectionalText.enum).toEqual(expectedDirections);
  });

  it('should have proper enum values for street_pre_directional_text in option 2', () => {
    const streetPreDirectionalText = addressSchema.oneOf[1].properties.street_pre_directional_text;
    const expectedDirections = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', null];
    expect(streetPreDirectionalText.enum).toEqual(expectedDirections);
  });

  it('should have proper pattern validation for postal_code in option 2', () => {
    const postalCode = addressSchema.oneOf[1].properties.postal_code;
    expect(postalCode.pattern).toBe('^\\d{5}$');
  });

  it('should have proper pattern validation for plus_four_postal_code in option 2', () => {
    const plusFourPostalCode = addressSchema.oneOf[1].properties.plus_four_postal_code;
    expect(plusFourPostalCode.pattern).toBe('^\\d{4}$');
  });

  it('should have proper pattern validation for state_code in option 2', () => {
    const stateCode = addressSchema.oneOf[1].properties.state_code;
    expect(stateCode.pattern).toBe('^[A-Z]{2}$');
  });

  it('should have proper pattern validation for street_name in option 2', () => {
    const streetName = addressSchema.oneOf[1].properties.street_name;
    expect(streetName.pattern).toBe('^(?!.*(\\b(E|N|NE|NW|S|SE|SW|W)\\b)).*$');
  });

  it('should have proper pattern validation for county_name in option 2', () => {
    const countyName = addressSchema.oneOf[1].properties.county_name;
    expect(countyName.enum).toBeDefined(); // county_name uses enum, not pattern
  });

  it('should have comprehensive street suffix enum in option 2', () => {
    const streetSuffixType = addressSchema.oneOf[1].properties.street_suffix_type;
    expect(streetSuffixType.enum).toBeDefined();
    expect(streetSuffixType.enum.length).toBeGreaterThan(100);
    expect(streetSuffixType.enum).toContain('St');
    expect(streetSuffixType.enum).toContain('Ave');
    expect(streetSuffixType.enum).toContain('Dr');
    expect(streetSuffixType.enum).toContain('Rd');
    expect(streetSuffixType.enum).toContain('Blvd');
    expect(streetSuffixType.enum).toContain('Ln');
    expect(streetSuffixType.enum).toContain('Cir');
    expect(streetSuffixType.enum).toContain('Way');
    expect(streetSuffixType.enum).toContain('Ct');
  });
});
