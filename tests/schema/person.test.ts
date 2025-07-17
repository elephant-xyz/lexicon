import { describe, it, expect } from 'vitest';
import personSchema from './person.json';

describe('person.json Schema', () => {
  it('should be a valid JSON Schema object', () => {
    expect(personSchema).toBeDefined();
    expect(typeof personSchema).toBe('object');
    expect(personSchema).not.toBeNull();
  });

  it('should have the correct JSON Schema version', () => {
    expect(personSchema.$schema).toBe('https://json-schema.org/draft-07/schema#');
  });

  it('should have the correct title and description', () => {
    expect(personSchema.title).toBe('person');
    expect(personSchema.description).toBe('JSON Schema for person class in Elephant Lexicon');
  });

  it('should have the correct type and additionalProperties settings', () => {
    expect(personSchema.type).toBe('object');
    expect(personSchema.additionalProperties).toBe(false);
  });

  it('should have the required properties', () => {
    expect(personSchema.required).toEqual([
      'source_http_request',
      'request_identifier',
      'birth_date',
      'first_name',
      'last_name',
      'middle_name',
      'prefix_name',
      'suffix_name',
      'us_citizenship_status',
      'veteran_status',
    ]);
  });

  it('should have the correct properties structure', () => {
    expect(personSchema.properties).toBeDefined();
    expect(personSchema.properties).toHaveProperty('birth_date');
    expect(personSchema.properties).toHaveProperty('first_name');
    expect(personSchema.properties).toHaveProperty('last_name');
    expect(personSchema.properties).toHaveProperty('middle_name');
    expect(personSchema.properties).toHaveProperty('prefix_name');
    expect(personSchema.properties).toHaveProperty('request_identifier');
    expect(personSchema.properties).toHaveProperty('source_http_request');
    expect(personSchema.properties).toHaveProperty('suffix_name');
    expect(personSchema.properties).toHaveProperty('us_citizenship_status');
    expect(personSchema.properties).toHaveProperty('veteran_status');
  });

  it('should have correct birth_date property definition', () => {
    const birthDate = personSchema.properties.birth_date;
    expect(birthDate.type).toEqual(['string', 'null']);
    expect(birthDate.format).toBe('date');
    expect(birthDate.description).toBe(
      "A birth date is the date on which a person was born. It typically includes the day, month, and year of an individual's birth and is used to determine their age."
    );
  });

  it('should have correct first_name property definition', () => {
    const firstName = personSchema.properties.first_name;
    expect(firstName.type).toBe('string');
    expect(firstName.minLength).toBe(1);
    expect(firstName.description).toBe(
      "A person's first name is the name that they are given at birth or during infancy, and it is typically used to identify them in a personal or informal context."
    );
  });

  it('should have correct last_name property definition', () => {
    const lastName = personSchema.properties.last_name;
    expect(lastName.type).toBe('string');
    expect(lastName.minLength).toBe(1);
    expect(lastName.description).toBe(
      "A person's last name, also known as surname or family name, is typically the name that is shared by all members of their immediate family."
    );
  });

  it('should have correct middle_name property definition', () => {
    const middleName = personSchema.properties.middle_name;
    expect(middleName.type).toEqual(['string', 'null']);
    expect(middleName.description).toBe(
      'The middle name of the individual represented by the parent object'
    );
  });

  it('should have correct prefix_name property definition', () => {
    const prefixName = personSchema.properties.prefix_name;
    expect(prefixName.type).toEqual(['string', 'null']);
    expect(prefixName.enum).toEqual([
      'Mr.',
      'Mrs.',
      'Ms.',
      'Miss',
      'Mx.',
      'Dr.',
      'Prof.',
      'Rev.',
      'Fr.',
      'Sr.',
      'Br.',
      'Capt.',
      'Col.',
      'Maj.',
      'Lt.',
      'Sgt.',
      'Hon.',
      'Judge',
      'Rabbi',
      'Imam',
      'Sheikh',
      'Sir',
      'Dame',
      null,
    ]);
    expect(prefixName.description).toBe(
      'Common honorifics or titles preceding names. Adjust this list based on cultural or domain-specific requirements.'
    );
  });

  it('should have correct request_identifier property definition', () => {
    const requestIdentifier = personSchema.properties.request_identifier;
    expect(requestIdentifier.type).toEqual(['string', 'null']);
    expect(requestIdentifier.description).toBe(
      'Identifier value that should be substituted into the source HTTP request to retrieve this specific data.'
    );
  });

  it('should have correct source_http_request property structure', () => {
    const sourceHttpRequest = personSchema.properties.source_http_request;
    expect(sourceHttpRequest.type).toBe('object');
    expect(sourceHttpRequest.additionalProperties).toBe(false);
    expect(sourceHttpRequest.description).toBe(
      'HTTP request configuration for retrieving this data.'
    );
    expect(sourceHttpRequest.required).toEqual(['method', 'url']);
  });

  it('should have correct source_http_request sub-properties', () => {
    const sourceHttpRequest = personSchema.properties.source_http_request;
    expect(sourceHttpRequest.properties).toHaveProperty('method');
    expect(sourceHttpRequest.properties).toHaveProperty('url');
    expect(sourceHttpRequest.properties).toHaveProperty('body');
    expect(sourceHttpRequest.properties).toHaveProperty('json');
    expect(sourceHttpRequest.properties).toHaveProperty('headers');
    expect(sourceHttpRequest.properties).toHaveProperty('multiValueQueryString');
  });

  it('should have correct method property definition', () => {
    const method = personSchema.properties.source_http_request.properties.method;
    expect(method.type).toEqual(['string', 'null']);
    expect(method.enum).toEqual(['GET', 'POST', 'PUT', 'PATCH', null]);
  });

  it('should have correct url property definition', () => {
    const url = personSchema.properties.source_http_request.properties.url;
    expect(url.type).toEqual(['string', 'null']);
    expect(url.description).toBe('The URL endpoint for the request.');
    expect(url.pattern).toBe('^https?://[a-zA-Z0-9.-]+(:[0-9]+)?(/[a-zA-Z0-9._-]+)*$');
  });

  it('should have correct body property definition', () => {
    const body = personSchema.properties.source_http_request.properties.body;
    expect(body.type).toEqual(['string', 'null']);
    expect(body.description).toBe(
      'The body of the request, which may contain JSON or other data formats.'
    );
  });

  it('should have correct json property definition', () => {
    const json = personSchema.properties.source_http_request.properties.json;
    expect(json.type).toEqual(['object', 'array', 'null']);
  });

  it('should have correct headers property definition', () => {
    const headers = personSchema.properties.source_http_request.properties.headers;
    expect(headers.type).toEqual(['object', 'null']);
    expect(headers.additionalProperties).toBe(false);
    expect(headers.properties).toHaveProperty('content-type');
  });

  it('should have correct content-type header definition', () => {
    const contentType =
      personSchema.properties.source_http_request.properties.headers.properties['content-type'];
    expect(contentType.type).toEqual(['string', 'null']);
    expect(contentType.description).toBe(
      'Content-Type header for the request, indicating the media type of the resource.'
    );
    expect(contentType.enum).toEqual(['application/json', 'multipart/form-data', 'text/xml', null]);
  });

  it('should have correct multiValueQueryString property definition', () => {
    const multiValueQueryString =
      personSchema.properties.source_http_request.properties.multiValueQueryString;
    expect(multiValueQueryString.type).toEqual(['object', 'null']);
  });

  it('should have correct suffix_name property definition', () => {
    const suffixName = personSchema.properties.suffix_name;
    expect(suffixName.type).toEqual(['string', 'null']);
    expect(suffixName.enum).toEqual([
      'Jr.',
      'Sr.',
      'II',
      'III',
      'IV',
      'PhD',
      'MD',
      'Esq.',
      'JD',
      'LLM',
      'MBA',
      'RN',
      'DDS',
      'DVM',
      'CFA',
      'CPA',
      'PE',
      'PMP',
      'Esq.',
      'Emeritus',
      'Ret.',
      null,
    ]);
    expect(suffixName.description).toBe(
      'Suffixes typically denote generational titles, academic degrees, or professional certifications.'
    );
  });

  it('should have correct us_citizenship_status property definition', () => {
    const usCitizenshipStatus = personSchema.properties.us_citizenship_status;
    expect(usCitizenshipStatus.type).toEqual(['string', 'null']);
    expect(usCitizenshipStatus.enum).toEqual([
      'NonPermanentResidentAlien',
      'NonPermResidentAlien',
      'PermResidentAlien',
      'PermanentResidentAlien',
      'USCitizenAbroad',
      'USCitizen',
      'ForeignNational',
      null,
    ]);
    expect(usCitizenshipStatus.description).toContain(
      "Citizenship status refers to an individual's legal status as a citizen or non-citizen of a country"
    );
  });

  it('should have correct veteran_status property definition', () => {
    const veteranStatus = personSchema.properties.veteran_status;
    expect(veteranStatus.type).toEqual(['boolean', 'null']);
    expect(veteranStatus.description).toContain(
      "Veteran status refers to an individual's status as a former member of the armed forces"
    );
  });

  it('should have the allOf validation rules', () => {
    expect(personSchema.allOf).toBeDefined();
    expect(Array.isArray(personSchema.allOf)).toBe(true);
    expect(personSchema.allOf.length).toBeGreaterThan(0);
  });

  it('should have conditional validation rules for HTTP requests', () => {
    const allOfRules = personSchema.allOf;
    const httpRequestRule = allOfRules.find(
      rule => rule.if?.properties?.source_http_request?.type === 'object'
    );
    expect(httpRequestRule).toBeDefined();
  });

  it('should validate GET requests cannot have body, json, or headers', () => {
    const allOfRules = personSchema.allOf;
    const getRequestRule = allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
      rule.if?.properties?.method?.enum?.includes('GET')
    );
    expect(getRequestRule).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toHaveLength(3);
  });

  it('should validate POST/PUT/PATCH with JSON content-type requires json field', () => {
    const allOfRules = personSchema.allOf;
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
    const allOfRules = personSchema.allOf;
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
    const allOfRules = personSchema.allOf;
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
    const allOfRules = personSchema.allOf;
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

  it('should have all required properties for a complete person record', () => {
    const requiredProps = personSchema.required;
    expect(requiredProps).toContain('source_http_request');
    expect(requiredProps).toContain('request_identifier');
    expect(requiredProps).toContain('birth_date');
    expect(requiredProps).toContain('first_name');
    expect(requiredProps).toContain('last_name');
    expect(requiredProps).toContain('middle_name');
    expect(requiredProps).toContain('prefix_name');
    expect(requiredProps).toContain('suffix_name');
    expect(requiredProps).toContain('us_citizenship_status');
    expect(requiredProps).toContain('veteran_status');
  });

  it('should have proper enum values for prefix_name', () => {
    const prefixName = personSchema.properties.prefix_name;
    const expectedPrefixes = [
      'Mr.',
      'Mrs.',
      'Ms.',
      'Miss',
      'Mx.',
      'Dr.',
      'Prof.',
      'Rev.',
      'Fr.',
      'Sr.',
      'Br.',
      'Capt.',
      'Col.',
      'Maj.',
      'Lt.',
      'Sgt.',
      'Hon.',
      'Judge',
      'Rabbi',
      'Imam',
      'Sheikh',
      'Sir',
      'Dame',
      null,
    ];
    expect(prefixName.enum).toEqual(expectedPrefixes);
  });

  it('should have proper enum values for suffix_name', () => {
    const suffixName = personSchema.properties.suffix_name;
    const expectedSuffixes = [
      'Jr.',
      'Sr.',
      'II',
      'III',
      'IV',
      'PhD',
      'MD',
      'Esq.',
      'JD',
      'LLM',
      'MBA',
      'RN',
      'DDS',
      'DVM',
      'CFA',
      'CPA',
      'PE',
      'PMP',
      'Esq.',
      'Emeritus',
      'Ret.',
      null,
    ];
    expect(suffixName.enum).toEqual(expectedSuffixes);
  });

  it('should have proper enum values for us_citizenship_status', () => {
    const usCitizenshipStatus = personSchema.properties.us_citizenship_status;
    const expectedStatuses = [
      'NonPermanentResidentAlien',
      'NonPermResidentAlien',
      'PermResidentAlien',
      'PermanentResidentAlien',
      'USCitizenAbroad',
      'USCitizen',
      'ForeignNational',
      null,
    ];
    expect(usCitizenshipStatus.enum).toEqual(expectedStatuses);
  });
});
