import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';

// Blockchain classes that actually exist in the lexicon data
const BLOCKCHAIN_CLASSES = [
  'property',
  'property_seed',
  'unnormalized_address',
  'address',
  'company',
  'structure',
  'tax',
  'loan',
  'school',
  'sales_history',
  'person',
  'layout',
  'utility',
  'environmental_risk',
  'homeowners_association',
  'file',
  'relationship',
  'nearby_location',
  'lot',
  'flood_storm_information',
  'property_ranking_overall',
  'environment_characteristics',
  'safety_security',
  'transportation_access',
  'tax_exemption',
  'tax_authority',
];

describe('Blockchain Schema Validation Constraints', () => {
  const schemasDir = path.join(process.cwd(), 'public', 'json-schemas');

  // Helper function to check if a property has the required constraints
  const checkPropertyConstraints = (property: any, propertyName: string): string[] => {
    const issues: string[] = [];

    // Skip source_http_request properties as they are special validation properties
    if (propertyName.includes('source_http_request')) {
      return issues;
    }

    // Check string properties
    if (
      property.type === 'string' ||
      (Array.isArray(property.type) && property.type.includes('string'))
    ) {
      if (property.minLength === undefined) {
        issues.push(`String property "${propertyName}" missing minLength constraint`);
      }
    }

    // Check integer properties
    if (
      property.type === 'integer' ||
      (Array.isArray(property.type) && property.type.includes('integer'))
    ) {
      if (property.minimum === undefined) {
        issues.push(`Integer property "${propertyName}" missing minimum constraint`);
      }
    }

    // Check array properties
    if (property.type === 'array') {
      if (property.minItems === undefined) {
        issues.push(`Array property "${propertyName}" missing minItems constraint`);
      }
    }

    // Recursively check nested properties
    if (property.properties) {
      for (const [nestedPropName, nestedProp] of Object.entries(property.properties)) {
        const nestedIssues = checkPropertyConstraints(
          nestedProp,
          `${propertyName}.${nestedPropName}`
        );
        issues.push(...nestedIssues);
      }
    }

    // Check items for arrays
    if (property.items) {
      const itemIssues = checkPropertyConstraints(property.items, `${propertyName}[items]`);
      issues.push(...itemIssues);
    }

    return issues;
  };

  // Helper function to check if a schema file exists and has proper constraints
  const validateBlockchainSchema = (className: string): string[] => {
    const schemaPath = path.join(schemasDir, `${className}.json`);
    const issues: string[] = [];

    // Check if schema file exists
    if (!fs.existsSync(schemaPath)) {
      issues.push(`Schema file for "${className}" does not exist`);
      return issues;
    }

    try {
      const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);

      // Check if schema has properties
      if (!schema.properties) {
        issues.push(`Schema for "${className}" has no properties`);
        return issues;
      }

      // Check each property for required constraints
      for (const [propertyName, property] of Object.entries(schema.properties)) {
        const propertyIssues = checkPropertyConstraints(property, propertyName);
        issues.push(...propertyIssues);
      }
    } catch (error) {
      issues.push(`Error reading schema for "${className}": ${error}`);
    }

    return issues;
  };

  it('should have proper validation constraints for all blockchain classes', () => {
    const allIssues: string[] = [];

    for (const className of BLOCKCHAIN_CLASSES) {
      const issues = validateBlockchainSchema(className);
      if (issues.length > 0) {
        allIssues.push(`\n${className}:`);
        allIssues.push(...issues.map(issue => `  - ${issue}`));
      }
    }

    if (allIssues.length > 0) {
      throw new Error(`Validation constraint issues found:\n${allIssues.join('\n')}`);
    }
  });

  it('should have minLength: 1 for all string properties in blockchain schemas', () => {
    const allIssues: string[] = [];

    for (const className of BLOCKCHAIN_CLASSES) {
      const schemaPath = path.join(schemasDir, `${className}.json`);

      if (!fs.existsSync(schemaPath)) {
        allIssues.push(`Schema file for "${className}" does not exist`);
        continue;
      }

      try {
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        const schema = JSON.parse(schemaContent);

        if (!schema.properties) continue;

        for (const [propertyName, property] of Object.entries(schema.properties)) {
          // Skip source_http_request properties as they are special validation properties
          if (propertyName.includes('source_http_request')) {
            continue;
          }

          const typedProperty = property as any;

          // Check if it's a string property (including nullable strings)
          if (
            typedProperty.type === 'string' ||
            (Array.isArray(typedProperty.type) && typedProperty.type.includes('string'))
          ) {
            if (typedProperty.minLength !== 1) {
              allIssues.push(
                `${className}.${propertyName}: Expected minLength: 1, got: ${typedProperty.minLength}`
              );
            }
          }
        }
      } catch (error) {
        allIssues.push(`Error reading schema for "${className}": ${error}`);
      }
    }

    if (allIssues.length > 0) {
      throw new Error(`String property minLength issues:\n${allIssues.join('\n')}`);
    }
  });

  it('should have minimum: 1 for all integer properties in blockchain schemas', () => {
    const allIssues: string[] = [];

    for (const className of BLOCKCHAIN_CLASSES) {
      const schemaPath = path.join(schemasDir, `${className}.json`);

      if (!fs.existsSync(schemaPath)) {
        allIssues.push(`Schema file for "${className}" does not exist`);
        continue;
      }

      try {
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        const schema = JSON.parse(schemaContent);

        if (!schema.properties) continue;

        for (const [propertyName, property] of Object.entries(schema.properties)) {
          // Skip source_http_request properties as they are special validation properties
          if (propertyName.includes('source_http_request')) {
            continue;
          }

          const typedProperty = property as any;

          // Check if it's an integer property (including nullable integers)
          if (
            typedProperty.type === 'integer' ||
            (Array.isArray(typedProperty.type) && typedProperty.type.includes('integer'))
          ) {
            if (typedProperty.minimum !== 1) {
              allIssues.push(
                `${className}.${propertyName}: Expected minimum: 1, got: ${typedProperty.minimum}`
              );
            }
          }
        }
      } catch (error) {
        allIssues.push(`Error reading schema for "${className}": ${error}`);
      }
    }

    if (allIssues.length > 0) {
      throw new Error(`Integer property minimum issues:\n${allIssues.join('\n')}`);
    }
  });

  it('should have minItems: 1 for all array properties in blockchain schemas', () => {
    const allIssues: string[] = [];

    for (const className of BLOCKCHAIN_CLASSES) {
      const schemaPath = path.join(schemasDir, `${className}.json`);

      if (!fs.existsSync(schemaPath)) {
        allIssues.push(`Schema file for "${className}" does not exist`);
        continue;
      }

      try {
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        const schema = JSON.parse(schemaContent);

        if (!schema.properties) continue;

        for (const [propertyName, property] of Object.entries(schema.properties)) {
          // Skip source_http_request properties as they are special validation properties
          if (propertyName.includes('source_http_request')) {
            continue;
          }

          const typedProperty = property as any;

          // Check if it's an array property
          if (typedProperty.type === 'array') {
            if (typedProperty.minItems !== 1) {
              allIssues.push(
                `${className}.${propertyName}: Expected minItems: 1, got: ${typedProperty.minItems}`
              );
            }
          }
        }
      } catch (error) {
        allIssues.push(`Error reading schema for "${className}": ${error}`);
      }
    }

    if (allIssues.length > 0) {
      throw new Error(`Array property minItems issues:\n${allIssues.join('\n')}`);
    }
  });

  it('should have nullable types properly formatted in blockchain schemas', () => {
    const allIssues: string[] = [];

    for (const className of BLOCKCHAIN_CLASSES) {
      const schemaPath = path.join(schemasDir, `${className}.json`);

      if (!fs.existsSync(schemaPath)) {
        allIssues.push(`Schema file for "${className}" does not exist`);
        continue;
      }

      try {
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        const schema = JSON.parse(schemaContent);

        if (!schema.properties) continue;

        for (const [propertyName, property] of Object.entries(schema.properties)) {
          // Skip source_http_request properties as they are special validation properties
          if (propertyName.includes('source_http_request')) {
            continue;
          }

          const typedProperty = property as any;

          // Check if it's a nullable type (array with multiple types)
          if (Array.isArray(typedProperty.type) && typedProperty.type.length > 1) {
            // Verify it includes 'null' and another type
            if (!typedProperty.type.includes('null')) {
              allIssues.push(`${className}.${propertyName}: Nullable type should include 'null'`);
            }

            // Check that it has the proper constraints for the non-null type
            const nonNullTypes = typedProperty.type.filter((t: string) => t !== 'null');
            for (const nonNullType of nonNullTypes) {
              if (nonNullType === 'string' && typedProperty.minLength !== 1) {
                allIssues.push(
                  `${className}.${propertyName}: Nullable string should have minLength: 1`
                );
              }
              if (nonNullType === 'integer' && typedProperty.minimum !== 1) {
                allIssues.push(
                  `${className}.${propertyName}: Nullable integer should have minimum: 1`
                );
              }
            }
          }
        }
      } catch (error) {
        allIssues.push(`Error reading schema for "${className}": ${error}`);
      }
    }

    if (allIssues.length > 0) {
      throw new Error(`Nullable type issues:\n${allIssues.join('\n')}`);
    }
  });
});
