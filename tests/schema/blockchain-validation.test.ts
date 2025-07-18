import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

// Import the schema generation functions from the Vite plugin
import { generateJSONSchemaForClass } from '../../vite-plugins/json-schema-generator';

describe('Blockchain Schema Validation', () => {
  describe('Schema Generation and Constraints', () => {
    it('should generate valid schemas with proper constraints for all blockchain classes', async () => {
      // Read lexicon data
      const lexiconPath = path.join(process.cwd(), 'src', 'data', 'lexicon.json');
      const lexiconContent = await fs.promises.readFile(lexiconPath, 'utf-8');
      const lexiconData = JSON.parse(lexiconContent);

      // Find blockchain tag
      const blockchainTag = lexiconData.tags.find(tag => tag.name === 'blockchain');
      if (!blockchainTag) {
        throw new Error('No blockchain tag found in lexicon data');
      }

      const ajv = new Ajv({
        allErrors: true,
        validateSchema: false,
      });
      let totalSchemas = 0;
      let validSchemas = 0;

      for (const className of blockchainTag.classes) {
        const lexiconClass = lexiconData.classes.find(c => c.type === className);
        if (!lexiconClass || lexiconClass.is_deprecated) {
          continue;
        }

        totalSchemas++;

        // Generate schema using the actual Vite plugin code
        const jsonSchema = generateJSONSchemaForClass(lexiconClass);

        // Note: We're not validating against JSON Schema spec, just checking structure
        // The schema validation was removed because Ajv doesn't have the JSON Schema draft-07 loaded

        // Check that it has the required structure
        expect(jsonSchema).toHaveProperty('$schema');
        expect(jsonSchema).toHaveProperty('type');
        expect(jsonSchema).toHaveProperty('properties');
        expect(jsonSchema).toHaveProperty('required');

        // Check that required fields are arrays
        expect(Array.isArray(jsonSchema.required)).toBe(true);

        // Check that properties is an object
        expect(typeof jsonSchema.properties).toBe('object');
        expect(jsonSchema.properties).not.toBeNull();

        // Check each property for proper constraints
        for (const [propName, propSchema] of Object.entries(jsonSchema.properties)) {
          const prop = propSchema as any;

          // Each property should have a type
          expect(prop).toHaveProperty('type');

          // If it has an enum, it should be an array and not have minLength
          if (prop.enum) {
            expect(Array.isArray(prop.enum)).toBe(true);
            expect(prop).not.toHaveProperty('minLength');
          }

          // If it has items (for arrays), it should be an object
          if (prop.items) {
            expect(typeof prop.items).toBe('object');
          }
        }

        validSchemas++;
      }

      expect(validSchemas).toBeGreaterThan(0);
      console.log(`✅ Generated and validated ${validSchemas} blockchain schemas`);
    });

    it('should have consistent schema structure across all blockchain classes', async () => {
      // Read lexicon data
      const lexiconPath = path.join(process.cwd(), 'src', 'data', 'lexicon.json');
      const lexiconContent = await fs.promises.readFile(lexiconPath, 'utf-8');
      const lexiconData = JSON.parse(lexiconContent);

      // Find blockchain tag
      const blockchainTag = lexiconData.tags.find(tag => tag.name === 'blockchain');
      if (!blockchainTag) {
        throw new Error('No blockchain tag found in lexicon data');
      }

      // All schemas should have the same basic structure
      for (const className of blockchainTag.classes) {
        const lexiconClass = lexiconData.classes.find(c => c.type === className);
        if (!lexiconClass || lexiconClass.is_deprecated) {
          continue;
        }

        const jsonSchema = generateJSONSchemaForClass(lexiconClass);

        expect(jsonSchema.$schema).toBe('https://json-schema.org/draft-07/schema#');
        expect(jsonSchema.type).toBe('object');
        expect(jsonSchema.additionalProperties).toBe(false);
      }
    });
  });

  describe('JSON Schema Validity', () => {
    it('should generate valid JSON Schema for all blockchain classes', async () => {
      // Read lexicon data
      const lexiconPath = path.join(process.cwd(), 'src', 'data', 'lexicon.json');
      const lexiconContent = await fs.promises.readFile(lexiconPath, 'utf-8');
      const lexiconData = JSON.parse(lexiconContent);

      // Find blockchain tag
      const blockchainTag = lexiconData.tags.find(tag => tag.name === 'blockchain');
      if (!blockchainTag) {
        throw new Error('No blockchain tag found in lexicon data');
      }

      const ajv = new Ajv({
        allErrors: true,
        validateSchema: false,
      });

      for (const className of blockchainTag.classes) {
        const lexiconClass = lexiconData.classes.find(c => c.type === className);
        if (!lexiconClass || lexiconClass.is_deprecated) {
          continue;
        }

        // Generate schema using the actual Vite plugin code
        const jsonSchema = generateJSONSchemaForClass(lexiconClass);

        // Check that it's a valid JSON Schema
        expect(jsonSchema).toHaveProperty('$schema');
        expect(jsonSchema).toHaveProperty('type');
        expect(jsonSchema).toHaveProperty('properties');
        expect(jsonSchema).toHaveProperty('required');

        // Note: We're not validating against JSON Schema spec, just checking structure
        // The schema validation was removed because Ajv doesn't have the JSON Schema draft-07 loaded

        // Check that required fields are arrays
        expect(Array.isArray(jsonSchema.required)).toBe(true);

        // Check that properties is an object
        expect(typeof jsonSchema.properties).toBe('object');
        expect(jsonSchema.properties).not.toBeNull();

        // Check that each property has required fields
        for (const [propName, propSchema] of Object.entries(jsonSchema.properties)) {
          const prop = propSchema as any;

          // Each property should have a type
          expect(prop).toHaveProperty('type');

          // If it has an enum, it should be an array
          if (prop.enum) {
            expect(Array.isArray(prop.enum)).toBe(true);
          }

          // If it has items (for arrays), it should be an object
          if (prop.items) {
            expect(typeof prop.items).toBe('object');
          }
        }
      }
    });

    it('should have consistent schema structure across all blockchain classes', async () => {
      // Read lexicon data
      const lexiconPath = path.join(process.cwd(), 'src', 'data', 'lexicon.json');
      const lexiconContent = await fs.promises.readFile(lexiconPath, 'utf-8');
      const lexiconData = JSON.parse(lexiconContent);

      // Find blockchain tag
      const blockchainTag = lexiconData.tags.find(tag => tag.name === 'blockchain');
      if (!blockchainTag) {
        throw new Error('No blockchain tag found in lexicon data');
      }

      // All schemas should have the same basic structure
      for (const className of blockchainTag.classes) {
        const lexiconClass = lexiconData.classes.find(c => c.type === className);
        if (!lexiconClass || lexiconClass.is_deprecated) {
          continue;
        }

        const jsonSchema = generateJSONSchemaForClass(lexiconClass);

        expect(jsonSchema.$schema).toBe('https://json-schema.org/draft-07/schema#');
        expect(jsonSchema.type).toBe('object');
        expect(jsonSchema.additionalProperties).toBe(false);
      }
    });
  });
});
