import { describe, it, expect } from 'vitest';
import inspectionSchema from './inspection.json';

describe('inspection.json Schema', () => {
  it('should be a valid JSON Schema object', () => {
    expect(inspectionSchema).toBeDefined();
    expect(typeof inspectionSchema).toBe('object');
    expect(inspectionSchema).not.toBeNull();
  });

  it('should have the correct JSON Schema version', () => {
    expect(inspectionSchema.$schema).toBe('https://json-schema.org/draft-07/schema#');
  });

  it('should have the correct title and description', () => {
    expect(inspectionSchema.title).toBe('inspection');
    expect(inspectionSchema.description).toBe(
      'JSON Schema for inspection class in Elephant Lexicon'
    );
  });

  it('should have the correct type and additionalProperties settings', () => {
    expect(inspectionSchema.type).toBe('object');
    expect(inspectionSchema.additionalProperties).toBe(false);
  });

  it('should have the correct properties structure', () => {
    expect(inspectionSchema.properties).toBeDefined();
    expect(inspectionSchema.properties).toHaveProperty('inspection_number');
    expect(inspectionSchema.properties).toHaveProperty('inspection_status');
    expect(inspectionSchema.properties).toHaveProperty('scheduled_date');
    expect(inspectionSchema.properties).toHaveProperty('requested_date');
    expect(inspectionSchema.properties).toHaveProperty('completed_date');
    expect(inspectionSchema.properties).toHaveProperty('completed_time');
    expect(inspectionSchema.properties).toHaveProperty('permit_number');
  });

  it('should have correct inspection_number property definition', () => {
    const inspectionNumber = inspectionSchema.properties.inspection_number;
    expect(inspectionNumber.type).toBe('string');
    expect(inspectionNumber.description).toBe('Unique identifier for the inspection.');
  });

  it('should have correct inspection_status property definition with enum values', () => {
    const inspectionStatus = inspectionSchema.properties.inspection_status;
    expect(inspectionStatus.type).toBe('string');
    expect(inspectionStatus.enum).toEqual([
      'Passed',
      'Failed',
      'Pending',
      'Scheduled',
      'Cancelled',
      'In Progress',
      null,
    ]);
    expect(inspectionStatus.description).toBe(
      'Current status of the inspection indicating whether it has been completed and the outcome.'
    );
  });

  it('should have correct scheduled_date property definition', () => {
    const scheduledDate = inspectionSchema.properties.scheduled_date;
    expect(scheduledDate.type).toBe('string');
    expect(scheduledDate.format).toBe('date');
    expect(scheduledDate.description).toBe('The date when the inspection is scheduled to occur.');
  });

  it('should have correct requested_date property definition', () => {
    const requestedDate = inspectionSchema.properties.requested_date;
    expect(requestedDate.type).toBe('string');
    expect(requestedDate.format).toBe('date');
    expect(requestedDate.description).toBe('The date when the inspection was requested.');
  });

  it('should have correct completed_date property definition', () => {
    const completedDate = inspectionSchema.properties.completed_date;
    expect(completedDate.type).toBe('string');
    expect(completedDate.format).toBe('date');
    expect(completedDate.description).toBe('The date when the inspection was completed.');
  });

  it('should have correct completed_time property definition with time format', () => {
    const completedTime = inspectionSchema.properties.completed_time;
    expect(completedTime.type).toBe('string');
    expect(completedTime.format).toBe('time');
    expect(completedTime.description).toBe(
      'The time when the inspection was completed in ISO 8601 time format (HH:MM:SS or HH:MM:SS.sss).'
    );
  });

  it('should have correct permit_number property definition', () => {
    const permitNumber = inspectionSchema.properties.permit_number;
    expect(permitNumber.type).toBe('string');
    expect(permitNumber.description).toBe(
      'The permit number associated with this inspection, identifying the construction or renovation permit being inspected.'
    );
  });

  it('should have required properties array', () => {
    expect(inspectionSchema.required).toBeDefined();
    expect(Array.isArray(inspectionSchema.required)).toBe(true);
  });

  it('should validate that all date fields use the date format', () => {
    const dateFields = ['scheduled_date', 'requested_date', 'completed_date'];
    dateFields.forEach(field => {
      expect(inspectionSchema.properties[field].format).toBe('date');
    });
  });

  it('should have valid status enum values for inspection workflow', () => {
    const validStatuses = [
      'Passed',
      'Failed',
      'Pending',
      'Scheduled',
      'Cancelled',
      'In Progress',
      null,
    ];
    expect(inspectionSchema.properties.inspection_status.enum).toEqual(validStatuses);
  });

  it('should use ISO 8601 time format for completed_time', () => {
    const completedTime = inspectionSchema.properties.completed_time;
    // Verify it uses the standard time format instead of custom pattern
    expect(completedTime.format).toBe('time');
    expect(completedTime).not.toHaveProperty('pattern');
  });
});
