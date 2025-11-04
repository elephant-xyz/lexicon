import { describe, it, expect } from 'vitest';
import propertyImprovementSchema from './property_improvement.json';

describe('property_improvement.json Schema', () => {
  it('should be a valid JSON Schema object', () => {
    expect(propertyImprovementSchema).toBeDefined();
    expect(typeof propertyImprovementSchema).toBe('object');
    expect(propertyImprovementSchema).not.toBeNull();
  });

  it('should have the correct JSON Schema version', () => {
    expect(propertyImprovementSchema.$schema).toBe('https://json-schema.org/draft-07/schema#');
  });

  it('should have the correct title and description', () => {
    expect(propertyImprovementSchema.title).toBe('property_improvement');
    expect(propertyImprovementSchema.description).toBe(
      'JSON Schema for property_improvement class in Elephant Lexicon'
    );
  });

  it('should have the correct type and additionalProperties settings', () => {
    expect(propertyImprovementSchema.type).toBe('object');
    expect(propertyImprovementSchema.additionalProperties).toBe(false);
  });

  it('should have the required properties', () => {
    expect(propertyImprovementSchema.required).toEqual([
      'source_http_request',
      'request_identifier',
      'improvement_type',
      'improvement_status',
      'completion_date',
      'contractor_type',
      'permit_required',
    ]);
  });

  it('should have the correct properties structure', () => {
    expect(propertyImprovementSchema.properties).toBeDefined();
    expect(propertyImprovementSchema.properties).toHaveProperty('source_http_request');
    expect(propertyImprovementSchema.properties).toHaveProperty('request_identifier');
    expect(propertyImprovementSchema.properties).toHaveProperty('improvement_type');
    expect(propertyImprovementSchema.properties).toHaveProperty('improvement_status');
    expect(propertyImprovementSchema.properties).toHaveProperty('completion_date');
    expect(propertyImprovementSchema.properties).toHaveProperty('contractor_type');
    expect(propertyImprovementSchema.properties).toHaveProperty('permit_required');
    expect(propertyImprovementSchema.properties).toHaveProperty('fee');
  });

  it('should have correct source_http_request property structure', () => {
    const sourceHttpRequest = propertyImprovementSchema.properties.source_http_request;
    expect(sourceHttpRequest.type).toBe('object');
    expect(sourceHttpRequest.additionalProperties).toBe(false);
    expect(sourceHttpRequest.description).toBe(
      'HTTP request configuration for retrieving this data.'
    );
    expect(sourceHttpRequest.required).toEqual(['method', 'url']);
  });

  it('should have correct source_http_request sub-properties', () => {
    const sourceHttpRequest = propertyImprovementSchema.properties.source_http_request;
    expect(sourceHttpRequest.properties).toHaveProperty('method');
    expect(sourceHttpRequest.properties).toHaveProperty('url');
    expect(sourceHttpRequest.properties).toHaveProperty('body');
    expect(sourceHttpRequest.properties).toHaveProperty('json');
    expect(sourceHttpRequest.properties).toHaveProperty('headers');
    expect(sourceHttpRequest.properties).toHaveProperty('multiValueQueryString');
  });

  it('should have correct request_identifier property definition', () => {
    const requestIdentifier = propertyImprovementSchema.properties.request_identifier;
    expect(requestIdentifier.type).toBe('string');
    expect(requestIdentifier.description).toBe(
      'Identifier value that should be substituted into the source HTTP request to retrieve this specific data.'
    );
  });

  it('should have correct improvement_type property with comprehensive enum', () => {
    const improvementType = propertyImprovementSchema.properties.improvement_type;
    expect(improvementType.type).toEqual(['string', 'null']);
    expect(improvementType.enum).toBeDefined();
    expect(improvementType.enum).toContain('GeneralBuilding');
    expect(improvementType.enum).toContain('ResidentialConstruction');
    expect(improvementType.enum).toContain('CommercialConstruction');
    expect(improvementType.enum).toContain('PoolSpaInstallation');
    expect(improvementType.enum).toContain('Electrical');
    expect(improvementType.enum).toContain('Roofing');
    expect(improvementType.enum).toContain('Plumbing');
  });

  it('should have correct improvement_status property with enum', () => {
    const improvementStatus = propertyImprovementSchema.properties.improvement_status;
    expect(improvementStatus.type).toEqual(['string', 'null']);
    expect(improvementStatus.description).toBe('Current status of the improvement project.');
    expect(improvementStatus.enum).toEqual([
      'Completed',
      'InProgress',
      'Planned',
      'Permitted',
      'OnHold',
      'Cancelled',
      null,
    ]);
  });

  it('should have correct completion_date property definition', () => {
    const completionDate = propertyImprovementSchema.properties.completion_date;
    expect(completionDate.type).toEqual(['string', 'null']);
    expect(completionDate.format).toBe('date');
    expect(completionDate.description).toBe('Date when the improvement work was completed.');
  });

  it('should have correct contractor_type property with enum', () => {
    const contractorType = propertyImprovementSchema.properties.contractor_type;
    expect(contractorType.type).toEqual(['string', 'null']);
    expect(contractorType.description).toBe('Type of contractor or method used for the work.');
    expect(contractorType.enum).toEqual([
      'GeneralContractor',
      'Specialist',
      'DIY',
      'PropertyManager',
      'Builder',
      'HandymanService',
      'Unknown',
      null,
    ]);
  });

  it('should have correct permit_required property definition', () => {
    const permitRequired = propertyImprovementSchema.properties.permit_required;
    expect(permitRequired.type).toBe('boolean');
    expect(permitRequired.description).toBe('Whether the improvement required building permits.');
  });

  it('should have correct permit_number property definition', () => {
    const permitNumber = propertyImprovementSchema.properties.permit_number;
    expect(permitNumber.type).toEqual(['string', 'null']);
  });

  it('should have correct application_received_date property definition', () => {
    const applicationReceivedDate = propertyImprovementSchema.properties.application_received_date;
    expect(applicationReceivedDate.type).toEqual(['string', 'null']);
    expect(applicationReceivedDate.format).toBe('date');
  });

  it('should have correct permit_issue_date property definition', () => {
    const permitIssueDate = propertyImprovementSchema.properties.permit_issue_date;
    expect(permitIssueDate.type).toEqual(['string', 'null']);
    expect(permitIssueDate.format).toBe('date');
    expect(permitIssueDate.description).toBe('Date the permit was issued.');
  });

  it('should have correct final_inspection_date property definition', () => {
    const finalInspectionDate = propertyImprovementSchema.properties.final_inspection_date;
    expect(finalInspectionDate.type).toEqual(['string', 'null']);
    expect(finalInspectionDate.format).toBe('date');
    expect(finalInspectionDate.description).toBe('Date of final inspection approval.');
  });

  it('should have correct permit_close_date property definition', () => {
    const permitCloseDate = propertyImprovementSchema.properties.permit_close_date;
    expect(permitCloseDate.type).toEqual(['string', 'null']);
    expect(permitCloseDate.format).toBe('date');
    expect(permitCloseDate.description).toBe('Date the permit record was closed/complete.');
  });

  it('should have correct improvement_action property with enum', () => {
    const improvementAction = propertyImprovementSchema.properties.improvement_action;
    expect(improvementAction.type).toEqual(['string', 'null']);
    expect(improvementAction.description).toBe('Nature of the work.');
    expect(improvementAction.enum).toEqual([
      'New',
      'Replacement',
      'Repair',
      'Alteration',
      'Addition',
      'Remove',
      'Other',
      null,
    ]);
  });

  it('should have correct is_owner_builder property definition', () => {
    const isOwnerBuilder = propertyImprovementSchema.properties.is_owner_builder;
    expect(isOwnerBuilder.type).toEqual(['boolean', 'null']);
    expect(isOwnerBuilder.description).toBe(
      'Whether improvement is done by owner versus hiring a contractor'
    );
  });

  it('should have correct is_disaster_recovery property definition', () => {
    const isDisasterRecovery = propertyImprovementSchema.properties.is_disaster_recovery;
    expect(isDisasterRecovery.type).toEqual(['boolean', 'null']);
    expect(isDisasterRecovery.description).toBe(
      'Whether the work is associated with disaster recovery.'
    );
  });

  it('should have correct private_provider_plan_review property definition', () => {
    const privateProviderPlanReview =
      propertyImprovementSchema.properties.private_provider_plan_review;
    expect(privateProviderPlanReview.type).toEqual(['boolean', 'null']);
    expect(privateProviderPlanReview.description).toBe('Private provider used for plan review.');
  });

  it('should have correct private_provider_inspections property definition', () => {
    const privateProviderInspections =
      propertyImprovementSchema.properties.private_provider_inspections;
    expect(privateProviderInspections.type).toEqual(['boolean', 'null']);
    expect(privateProviderInspections.description).toBe('Private provider used for inspections.');
  });

  it('should have correct fee property definition with currency format', () => {
    const fee = propertyImprovementSchema.properties.fee;
    expect(fee.type).toBe('number');
    expect(fee.format).toBe('currency');
    expect(fee.description).toBe(
      'Cost associated with acquiring the property improvement/permits.'
    );
  });

  it('should have the allOf validation rules', () => {
    expect(propertyImprovementSchema.allOf).toBeDefined();
    expect(Array.isArray(propertyImprovementSchema.allOf)).toBe(true);
    expect(propertyImprovementSchema.allOf.length).toBeGreaterThan(0);
  });

  it('should have conditional validation rules for HTTP requests', () => {
    const allOfRules = propertyImprovementSchema.allOf;
    const httpRequestRule = allOfRules.find(
      rule => rule.if?.properties?.source_http_request?.type === 'object'
    );
    expect(httpRequestRule).toBeDefined();
  });

  it('should validate GET requests cannot have body, json, or headers', () => {
    const allOfRules = propertyImprovementSchema.allOf;
    const getRequestRule = allOfRules[0].then.properties.source_http_request.allOf.find(rule =>
      rule.if?.properties?.method?.enum?.includes('GET')
    );
    expect(getRequestRule).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toBeDefined();
    expect(getRequestRule.then.not.anyOf).toHaveLength(3);
  });

  it('should validate all date fields use the date format', () => {
    const dateFields = [
      'completion_date',
      'application_received_date',
      'permit_issue_date',
      'final_inspection_date',
      'permit_close_date',
    ];
    dateFields.forEach(field => {
      if (propertyImprovementSchema.properties[field]) {
        expect(propertyImprovementSchema.properties[field].format).toBe('date');
      }
    });
  });

  it('should have comprehensive improvement types for various construction and administrative work', () => {
    const improvementType = propertyImprovementSchema.properties.improvement_type;
    // Construction types
    expect(improvementType.enum).toContain('GeneralBuilding');
    expect(improvementType.enum).toContain('ResidentialConstruction');
    expect(improvementType.enum).toContain('CommercialConstruction');
    // Administrative types
    expect(improvementType.enum).toContain('AdministrativeApproval');
    expect(improvementType.enum).toContain('Variance');
    expect(improvementType.enum).toContain('Rezoning');
    // Specific improvement types
    expect(improvementType.enum).toContain('PoolSpaInstallation');
    expect(improvementType.enum).toContain('Electrical');
    expect(improvementType.enum).toContain('Plumbing');
    expect(improvementType.enum).toContain('Roofing');
  });
});
