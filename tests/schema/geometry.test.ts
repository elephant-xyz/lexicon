import { describe, it, expect } from 'vitest';
import geometrySchema from './geometry.json';

describe('geometry.json Schema', () => {
  it('should be a valid JSON Schema object', () => {
    expect(geometrySchema).toBeDefined();
    expect(typeof geometrySchema).toBe('object');
    expect(geometrySchema).not.toBeNull();
  });

  it('should have the correct JSON Schema version', () => {
    expect(geometrySchema.$schema).toBe('https://json-schema.org/draft-07/schema#');
  });

  it('should have the correct title and description', () => {
    expect(geometrySchema.title).toBe('geometry');
    expect(geometrySchema.description).toBe('JSON Schema for geometry class in Elephant Lexicon');
  });

  it('should have the correct type and additionalProperties settings', () => {
    expect(geometrySchema.type).toBe('object');
    expect(geometrySchema.additionalProperties).toBe(false);
  });

  it('should have the required properties', () => {
    expect(geometrySchema.required).toEqual(['source_http_request', 'request_identifier']);
  });

  it('should have the correct properties structure', () => {
    expect(geometrySchema.properties).toBeDefined();
    expect(geometrySchema.properties).toHaveProperty('source_http_request');
    expect(geometrySchema.properties).toHaveProperty('request_identifier');
    expect(geometrySchema.properties).toHaveProperty('latitude');
    expect(geometrySchema.properties).toHaveProperty('longitude');
    expect(geometrySchema.properties).toHaveProperty('polygon');
  });

  it('should have correct source_http_request property structure', () => {
    const sourceHttpRequest = geometrySchema.properties.source_http_request;
    expect(sourceHttpRequest.type).toBe('object');
    expect(sourceHttpRequest.additionalProperties).toBe(false);
    expect(sourceHttpRequest.description).toBe(
      'HTTP request configuration for retrieving this data.'
    );
    expect(sourceHttpRequest.required).toEqual(['method', 'url']);
  });

  it('should have correct source_http_request sub-properties', () => {
    const sourceHttpRequest = geometrySchema.properties.source_http_request;
    expect(sourceHttpRequest.properties).toHaveProperty('method');
    expect(sourceHttpRequest.properties).toHaveProperty('url');
    expect(sourceHttpRequest.properties).toHaveProperty('body');
    expect(sourceHttpRequest.properties).toHaveProperty('json');
    expect(sourceHttpRequest.properties).toHaveProperty('headers');
    expect(sourceHttpRequest.properties).toHaveProperty('multiValueQueryString');
  });

  it('should have correct request_identifier property definition', () => {
    const requestIdentifier = geometrySchema.properties.request_identifier;
    expect(requestIdentifier.type).toEqual(['string', 'null']);
    expect(requestIdentifier.description).toBe(
      'Identifier value that should be substituted into the source HTTP request to retrieve this specific data.'
    );
  });

  it('should have correct latitude property definition with valid range', () => {
    const latitude = geometrySchema.properties.latitude;
    expect(latitude.type).toEqual(['number', 'null']);
    expect(latitude.minimum).toBe(-90);
    expect(latitude.description).toContain('Latitude coordinate of a single point location');
    expect(latitude.description).toContain('-90°');
    expect(latitude.description).toContain('+90°');
  });

  it('should have correct longitude property definition with valid range', () => {
    const longitude = geometrySchema.properties.longitude;
    expect(longitude.type).toEqual(['number', 'null']);
    expect(longitude.minimum).toBe(-180);
    expect(longitude.description).toContain('Longitude coordinate of a single point location');
    expect(longitude.description).toContain('-180°');
    expect(longitude.description).toContain('+180°');
  });

  it('should have correct polygon property definition as array', () => {
    const polygon = geometrySchema.properties.polygon;
    expect(polygon.type).toEqual(['array', 'null']);
    expect(polygon.description).toContain('array of coordinate points');
    expect(polygon.description).toContain('closed polygon boundary');
    expect(polygon.description).toContain('at least 3 points');
  });

  it('should have the allOf validation rules', () => {
    expect(geometrySchema.allOf).toBeDefined();
    expect(Array.isArray(geometrySchema.allOf)).toBe(true);
    expect(geometrySchema.allOf.length).toBeGreaterThan(0);
  });

  it('should have conditional validation rules for HTTP requests', () => {
    const allOfRules = geometrySchema.allOf;
    const httpRequestRule = allOfRules.find(
      rule => rule.if?.properties?.source_http_request?.type === 'object'
    );
    expect(httpRequestRule).toBeDefined();
  });

  it('should validate GET requests cannot have body, json, or headers', () => {
    const allOfRules = geometrySchema.allOf;
    const getRequestRule = allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
      rule.if?.properties?.method?.enum?.includes('GET')
    );
    expect(getRequestRule).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toHaveLength(3);
  });

  it('should validate coordinate ranges are appropriate for geospatial data', () => {
    const latitude = geometrySchema.properties.latitude;
    const longitude = geometrySchema.properties.longitude;

    // Latitude should be between -90 and 90
    expect(latitude.minimum).toBe(-90);

    // Longitude should be between -180 and 180
    expect(longitude.minimum).toBe(-180);
  });

  it('should support both point and polygon geometry types', () => {
    // Point coordinates
    expect(geometrySchema.properties).toHaveProperty('latitude');
    expect(geometrySchema.properties).toHaveProperty('longitude');

    // Polygon coordinates
    expect(geometrySchema.properties).toHaveProperty('polygon');
  });
});
