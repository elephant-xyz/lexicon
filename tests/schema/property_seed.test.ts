import { describe, it, expect } from 'vitest';
import propertySeedSchema from './property_seed.json';

describe('property_seed.json Schema', () => {
  it('should be a valid JSON Schema object', () => {
    expect(propertySeedSchema).toBeDefined();
    expect(typeof propertySeedSchema).toBe('object');
    expect(propertySeedSchema).not.toBeNull();
  });

  it('should have the correct JSON Schema version', () => {
    expect(propertySeedSchema.$schema).toBe('https://json-schema.org/draft-07/schema#');
  });

  it('should have the correct title and description', () => {
    expect(propertySeedSchema.title).toBe('property_seed');
    expect(propertySeedSchema.description).toBe(
      'JSON Schema for property_seed class in Elephant Lexicon'
    );
  });

  it('should have the correct type and additionalProperties settings', () => {
    expect(propertySeedSchema.type).toBe('object');
    expect(propertySeedSchema.additionalProperties).toBe(false);
  });

  it('should have the required properties', () => {
    expect(propertySeedSchema.required).toEqual([
      'source_http_request',
      'request_identifier',
      'parcel_id',
    ]);
  });

  it('should have the correct properties structure', () => {
    expect(propertySeedSchema.properties).toBeDefined();
    expect(propertySeedSchema.properties).toHaveProperty('parcel_id');
    expect(propertySeedSchema.properties).toHaveProperty('request_identifier');
    expect(propertySeedSchema.properties).toHaveProperty('source_http_request');
  });

  it('should have correct parcel_id property definition', () => {
    const parcelId = propertySeedSchema.properties.parcel_id;
    expect(parcelId.type).toBe('string');
    expect(parcelId.minLength).toBe(1);
    expect(parcelId.description).toBe(
      'A unique identifier for the property parcel as assigned by the local assessor or jurisdiction.'
    );
  });

  it('should have correct request_identifier property definition', () => {
    const requestIdentifier = propertySeedSchema.properties.request_identifier;
    expect(requestIdentifier.type).toEqual(['string', 'null']);
    expect(requestIdentifier.description).toBe(
      'Identifier value that should be substituted into the source HTTP request to retrieve this specific data.'
    );
  });

  it('should have correct source_http_request property structure', () => {
    const sourceHttpRequest = propertySeedSchema.properties.source_http_request;
    expect(sourceHttpRequest.type).toBe('object');
    expect(sourceHttpRequest.additionalProperties).toBe(false);
    expect(sourceHttpRequest.description).toBe(
      'HTTP request configuration for retrieving this data.'
    );
    expect(sourceHttpRequest.required).toEqual(['method', 'url']);
  });

  it('should have correct source_http_request sub-properties', () => {
    const sourceHttpRequest = propertySeedSchema.properties.source_http_request;
    expect(sourceHttpRequest.properties).toHaveProperty('method');
    expect(sourceHttpRequest.properties).toHaveProperty('url');
    expect(sourceHttpRequest.properties).toHaveProperty('body');
    expect(sourceHttpRequest.properties).toHaveProperty('json');
    expect(sourceHttpRequest.properties).toHaveProperty('headers');
    expect(sourceHttpRequest.properties).toHaveProperty('multiValueQueryString');
  });

  it('should have correct method property definition', () => {
    const method = propertySeedSchema.properties.source_http_request.properties.method;
    expect(method.type).toEqual(['string', 'null']);
    expect(method.enum).toEqual(['GET', 'POST', 'PUT', 'PATCH', null]);
  });

  it('should have correct url property definition', () => {
    const url = propertySeedSchema.properties.source_http_request.properties.url;
    expect(url.type).toEqual(['string', 'null']);
    expect(url.description).toBe('The URL endpoint for the request.');
    expect(url.pattern).toBe('^https?://[a-zA-Z0-9.-]+(:[0-9]+)?(/[a-zA-Z0-9._-]+)*$');
  });

  it('should have correct body property definition', () => {
    const body = propertySeedSchema.properties.source_http_request.properties.body;
    expect(body.type).toEqual(['string', 'null']);
    expect(body.description).toBe(
      'The body of the request, which may contain JSON or other data formats.'
    );
  });

  it('should have correct json property definition', () => {
    const json = propertySeedSchema.properties.source_http_request.properties.json;
    expect(json.type).toEqual(['object', 'array', 'null']);
  });

  it('should have correct headers property definition', () => {
    const headers = propertySeedSchema.properties.source_http_request.properties.headers;
    expect(headers.type).toEqual(['object', 'null']);
    expect(headers.additionalProperties).toBe(false);
    expect(headers.properties).toHaveProperty('content-type');
  });

  it('should have correct content-type header definition', () => {
    const contentType =
      propertySeedSchema.properties.source_http_request.properties.headers.properties[
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
      propertySeedSchema.properties.source_http_request.properties.multiValueQueryString;
    expect(multiValueQueryString.type).toEqual(['object', 'null']);
  });

  it('should have the allOf validation rules', () => {
    expect(propertySeedSchema.allOf).toBeDefined();
    expect(Array.isArray(propertySeedSchema.allOf)).toBe(true);
    expect(propertySeedSchema.allOf.length).toBeGreaterThan(0);
  });

  it('should have conditional validation rules for HTTP requests', () => {
    const allOfRules = propertySeedSchema.allOf;
    const httpRequestRule = allOfRules.find(
      rule => rule.if?.properties?.source_http_request?.type === 'object'
    );
    expect(httpRequestRule).toBeDefined();
  });

  it('should validate GET requests cannot have body, json, or headers', () => {
    const allOfRules = propertySeedSchema.allOf;
    const getRequestRule = allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
      rule.if?.properties?.method?.enum?.includes('GET')
    );
    expect(getRequestRule).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toBeDefined();
  });

  it('should validate POST/PUT/PATCH with JSON content-type requires json field', () => {
    const allOfRules = propertySeedSchema.allOf;
    const jsonContentRule = allOfRules[0].then.properties.source_http_request.allOf.find(
      rule =>
        rule.if?.properties?.headers?.properties?.['content-type']?.const === 'application/json' &&
        rule.if?.properties?.method?.enum?.includes('POST')
    );
    expect(jsonContentRule).toBeDefined();
    expect(jsonContentRule.then.required).toContain('json');
  });

  it('should validate POST/PUT/PATCH with non-JSON content-type requires body field', () => {
    const allOfRules = propertySeedSchema.allOf;
    const nonJsonContentRule = allOfRules[0].then.properties.source_http_request.allOf.find(
      rule =>
        rule.if?.properties?.headers?.properties?.['content-type']?.not?.const ===
          'application/json' && rule.if?.properties?.method?.enum?.includes('POST')
    );
    expect(nonJsonContentRule).toBeDefined();
    expect(nonJsonContentRule.then.required).toContain('body');
  });

  it('should validate json field requires application/json content-type', () => {
    const allOfRules = propertySeedSchema.allOf;
    const jsonRequiresContentTypeRule =
      allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
        rule.if?.required?.includes('json')
      );
    expect(jsonRequiresContentTypeRule).toBeDefined();
    expect(
      jsonRequiresContentTypeRule.then.properties.headers.properties['content-type'].const
    ).toBe('application/json');
  });

  it('should validate body field requires non-application/json content-type', () => {
    const allOfRules = propertySeedSchema.allOf;
    const bodyRequiresContentTypeRule =
      allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
        rule.if?.required?.includes('body')
      );
    expect(bodyRequiresContentTypeRule).toBeDefined();
    expect(
      bodyRequiresContentTypeRule.then.properties.headers.properties['content-type'].not.const
    ).toBe('application/json');
  });
});
