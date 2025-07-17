import { describe, it, expect } from 'vitest';
import unnormalizedAddressSchema from './unormailzed_address.json';

describe('unnormalized_address.json Schema', () => {
  it('should be a valid JSON Schema object', () => {
    expect(unnormalizedAddressSchema).toBeDefined();
    expect(typeof unnormalizedAddressSchema).toBe('object');
    expect(unnormalizedAddressSchema).not.toBeNull();
  });

  it('should have the correct JSON Schema version', () => {
    expect(unnormalizedAddressSchema.$schema).toBe('https://json-schema.org/draft-07/schema#');
  });

  it('should have the correct title and description', () => {
    expect(unnormalizedAddressSchema.title).toBe('unnormalized_address');
    expect(unnormalizedAddressSchema.description).toBe(
      'JSON Schema for unnormalized_address class in Elephant Lexicon'
    );
  });

  it('should have the correct type and additionalProperties settings', () => {
    expect(unnormalizedAddressSchema.type).toBe('object');
    expect(unnormalizedAddressSchema.additionalProperties).toBe(false);
  });

  it('should have the required properties', () => {
    expect(unnormalizedAddressSchema.required).toEqual([
      'full_address',
      'source_http_request',
      'request_identifier',
      'county_jurisdiction',
    ]);
  });

  it('should have the correct properties structure', () => {
    expect(unnormalizedAddressSchema.properties).toBeDefined();
    expect(unnormalizedAddressSchema.properties).toHaveProperty('full_address');
    expect(unnormalizedAddressSchema.properties).toHaveProperty('request_identifier');
    expect(unnormalizedAddressSchema.properties).toHaveProperty('source_http_request');
    expect(unnormalizedAddressSchema.properties).toHaveProperty('county_jurisdiction');
  });

  it('should have correct full_address property definition', () => {
    const fullAddress = unnormalizedAddressSchema.properties.full_address;
    expect(fullAddress.type).toEqual(['string', 'null']);
    expect(fullAddress.description).toBe(
      "The street address of the property including street number, street name, city, and state and postal code. Format: '123 Main, Springfield, IL' or '456 Oak Ave, Chicago, IL 1003'."
    );
  });

  it('should have correct request_identifier property definition', () => {
    const requestIdentifier = unnormalizedAddressSchema.properties.request_identifier;
    expect(requestIdentifier.type).toEqual(['string', 'null']);
    expect(requestIdentifier.description).toBe(
      'Identifier value that should be substituted into the source HTTP request to retrieve this specific data.'
    );
  });

  it('should have correct county_jurisdiction property definition', () => {
    const countyJurisdiction = unnormalizedAddressSchema.properties.county_jurisdiction;
    expect(countyJurisdiction.type).toEqual(['string', 'null']);
    expect(countyJurisdiction.description).toBe(
      "The name of the county or local jurisdiction that has authority over the property for tax assessment and administrative purposes. Should not include the word 'County' in the value."
    );
  });

  it('should have correct source_http_request property structure', () => {
    const sourceHttpRequest = unnormalizedAddressSchema.properties.source_http_request;
    expect(sourceHttpRequest.type).toEqual(['object', 'null']);
    expect(sourceHttpRequest.additionalProperties).toBe(false);
    expect(sourceHttpRequest.description).toBe(
      'HTTP request configuration for retrieving this data.'
    );
    expect(sourceHttpRequest.required).toEqual(['method', 'url']);
  });

  it('should have correct source_http_request sub-properties', () => {
    const sourceHttpRequest = unnormalizedAddressSchema.properties.source_http_request;
    expect(sourceHttpRequest.properties).toHaveProperty('method');
    expect(sourceHttpRequest.properties).toHaveProperty('url');
    expect(sourceHttpRequest.properties).toHaveProperty('body');
    expect(sourceHttpRequest.properties).toHaveProperty('json');
    expect(sourceHttpRequest.properties).toHaveProperty('headers');
    expect(sourceHttpRequest.properties).toHaveProperty('multiValueQueryString');
  });

  it('should have correct method property definition', () => {
    const method = unnormalizedAddressSchema.properties.source_http_request.properties.method;
    expect(method.type).toEqual(['string', 'null']);
    expect(method.enum).toEqual(['GET', 'POST', 'PUT', 'PATCH', null]);
  });

  it('should have correct url property definition', () => {
    const url = unnormalizedAddressSchema.properties.source_http_request.properties.url;
    expect(url.type).toEqual(['string', 'null']);
    expect(url.description).toBe('The URL endpoint for the request.');
    expect(url.pattern).toBe('^https?://[a-zA-Z0-9.-]+(:[0-9]+)?(/[a-zA-Z0-9._-]+)*$');
  });

  it('should have correct body property definition', () => {
    const body = unnormalizedAddressSchema.properties.source_http_request.properties.body;
    expect(body.type).toEqual(['string', 'null']);
    expect(body.description).toBe(
      'The body of the request, which may contain JSON or other data formats.'
    );
  });

  it('should have correct json property definition', () => {
    const json = unnormalizedAddressSchema.properties.source_http_request.properties.json;
    expect(json.type).toEqual(['object', 'array', 'null']);
    expect(json.description).toBe('the JSON data that is returned from the request.');
  });

  it('should have correct headers property definition', () => {
    const headers = unnormalizedAddressSchema.properties.source_http_request.properties.headers;
    expect(headers.type).toEqual(['object', 'null']);
    expect(headers.additionalProperties).toBe(false);
    expect(headers.properties).toHaveProperty('content-type');
  });

  it('should have correct content-type header definition', () => {
    const contentType =
      unnormalizedAddressSchema.properties.source_http_request.properties.headers.properties[
        'content-type'
      ];
    expect(contentType.type).toEqual(['string', 'null']);
    expect(contentType.description).toBe(
      'Content-Type header for the request, indicating the media type of the resource.'
    );
    expect(contentType.enum).toEqual(['application/json', 'multipart/form-data', 'text/xml', null]);
  });

  it('should have correct multiValueQueryString property definition', () => {
    const multiValueQueryString =
      unnormalizedAddressSchema.properties.source_http_request.properties.multiValueQueryString;
    expect(multiValueQueryString.type).toEqual(['object', 'null']);
    expect(multiValueQueryString.description).toBe(
      'Query string parameters for the request, where each key can have multiple values.'
    );
  });

  it('should have the allOf validation rules', () => {
    expect(unnormalizedAddressSchema.allOf).toBeDefined();
    expect(Array.isArray(unnormalizedAddressSchema.allOf)).toBe(true);
    expect(unnormalizedAddressSchema.allOf.length).toBeGreaterThan(0);
  });

  it('should have conditional validation rules for HTTP requests', () => {
    const allOfRules = unnormalizedAddressSchema.allOf;
    const httpRequestRule = allOfRules.find(
      rule => rule.if?.properties?.source_http_request?.type === 'object'
    );
    expect(httpRequestRule).toBeDefined();
  });

  it('should validate GET requests cannot have body, json, or headers', () => {
    const allOfRules = unnormalizedAddressSchema.allOf;
    const getRequestRule = allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
      rule.if?.properties?.method?.enum?.includes('GET')
    );
    expect(getRequestRule).toBeDefined();
    if (!getRequestRule) throw new Error('getRequestRule should be defined');
    expect(getRequestRule.then.not.anyOf).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toHaveLength(3);

    // Check that the anyOf array contains the correct required field restrictions
    const anyOfConditions = getRequestRule.then.not.anyOf;
    const requiredFields = anyOfConditions.map(condition => condition.required[0]);
    expect(requiredFields).toContain('body');
    expect(requiredFields).toContain('json');
    expect(requiredFields).toContain('headers');
  });

  it('should validate POST/PUT/PATCH with JSON content-type requires json field', () => {
    const allOfRules = unnormalizedAddressSchema.allOf;
    const jsonContentRule = allOfRules[0].then.properties.source_http_request.allOf.find(
      rule =>
        rule.if?.properties?.headers?.properties?.['content-type']?.const === 'application/json' &&
        rule.if?.properties?.method?.enum?.includes('POST')
    );
    expect(jsonContentRule).toBeDefined();
    if (!jsonContentRule) throw new Error('jsonContentRule should be defined');
    expect(jsonContentRule.then.required).toContain('json');
    expect(jsonContentRule.then.not.required).toContain('body');
  });

  it('should validate POST/PUT/PATCH with non-JSON content-type requires body field', () => {
    const allOfRules = unnormalizedAddressSchema.allOf;
    const nonJsonContentRule = allOfRules[0].then.properties.source_http_request.allOf.find(
      rule =>
        rule.if?.properties?.headers?.properties?.['content-type']?.not?.const ===
          'application/json' && rule.if?.properties?.method?.enum?.includes('POST')
    );
    expect(nonJsonContentRule).toBeDefined();
    if (!nonJsonContentRule) throw new Error('nonJsonContentRule should be defined');
    expect(nonJsonContentRule.then.required).toContain('body');
    expect(nonJsonContentRule.then.not.required).toContain('json');
  });

  it('should validate json field requires application/json content-type', () => {
    const allOfRules = unnormalizedAddressSchema.allOf;
    const jsonRequiresContentTypeRule =
      allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
        rule.if?.required?.includes('json')
      );
    expect(jsonRequiresContentTypeRule).toBeDefined();
    if (!jsonRequiresContentTypeRule)
      throw new Error('jsonRequiresContentTypeRule should be defined');
    expect(
      jsonRequiresContentTypeRule.then.properties.headers.properties['content-type'].const
    ).toBe('application/json');
    expect(jsonRequiresContentTypeRule.then.properties.headers.required).toContain('content-type');
  });

  it('should validate body field requires non-application/json content-type', () => {
    const allOfRules = unnormalizedAddressSchema.allOf;
    const bodyRequiresContentTypeRule =
      allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
        rule.if?.required?.includes('body')
      );
    expect(bodyRequiresContentTypeRule).toBeDefined();
    if (!bodyRequiresContentTypeRule)
      throw new Error('bodyRequiresContentTypeRule should be defined');
    expect(
      bodyRequiresContentTypeRule.then.properties.headers.properties['content-type'].not.const
    ).toBe('application/json');
    expect(bodyRequiresContentTypeRule.then.properties.headers.required).toContain('content-type');
  });

  it('should validate URL pattern for source_http_request', () => {
    const url = unnormalizedAddressSchema.properties.source_http_request.properties.url;
    const urlPattern = new RegExp(url.pattern);

    const validUrls = [
      'https://api.example.com',
      'http://localhost:3000',
      'https://api.example.com/v1/endpoint',
      'http://192.168.1.1:8080/api',
    ];

    const invalidUrls = ['ftp://example.com', 'not-a-url', 'https://', 'http://example.com:abc'];

    validUrls.forEach(url => {
      expect(urlPattern.test(url)).toBe(true);
    });

    invalidUrls.forEach(url => {
      expect(urlPattern.test(url)).toBe(false);
    });
  });

  it('should have all required properties marked as required', () => {
    const requiredProps = unnormalizedAddressSchema.required;
    const allProps = Object.keys(unnormalizedAddressSchema.properties);

    // Check that all required properties exist in the schema
    requiredProps.forEach(prop => {
      expect(allProps).toContain(prop);
    });
  });

  it('should have consistent nullable types for all properties', () => {
    const properties = unnormalizedAddressSchema.properties;

    // Check that all properties that can be null are properly typed
    Object.values(properties).forEach(prop => {
      if (prop.type && Array.isArray(prop.type)) {
        expect(prop.type).toContain('null');
      }
    });
  });

  it('should validate the schema structure is complete', () => {
    // Check that the schema has all required top-level properties
    expect(unnormalizedAddressSchema).toHaveProperty('$schema');
    expect(unnormalizedAddressSchema).toHaveProperty('title');
    expect(unnormalizedAddressSchema).toHaveProperty('description');
    expect(unnormalizedAddressSchema).toHaveProperty('type');
    expect(unnormalizedAddressSchema).toHaveProperty('properties');
    expect(unnormalizedAddressSchema).toHaveProperty('required');
    expect(unnormalizedAddressSchema).toHaveProperty('additionalProperties');
    expect(unnormalizedAddressSchema).toHaveProperty('allOf');
  });
});
