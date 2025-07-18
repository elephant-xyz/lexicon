#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { canonicalize } from 'json-canonicalize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Blockchain classes from the lexicon data
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

// Helper function to check if a property is effectively required
function isEffectivelyRequired(property) {
  return property.required === true;
}

// Helper function to check if a property is nested required
function isNestedRequired(property) {
  return property.required === true;
}

// Map lexicon type to JSON Schema
function mapLexiconTypeToJSONSchema(property, parentRequiredLogic) {
  const schema = {};

  // Skip source_http_request properties as they are special validation properties
  if (property.type === 'source_http_request') {
    return schema;
  }

  // Handle type arrays (e.g., ["string", "null"])
  if (Array.isArray(property.type)) {
    schema.type = property.type;
    // Continue processing other constraints even for array types
  } else {
    // Handle single types
    switch (property.type) {
      case 'string':
        schema.type = 'string';
        break;
      case 'integer':
        schema.type = 'integer';
        break;
      case 'decimal':
      case 'number':
        schema.type = 'number';
        break;
      case 'boolean':
        schema.type = 'boolean';
        break;
      case 'date':
        schema.type = 'string';
        schema.format = 'date';
        break;
      case 'datetime':
        schema.type = 'string';
        schema.format = 'date-time';
        break;
      case 'object':
        schema.type = 'object';
        if (property.properties) {
          schema.properties = {};
          for (const [propName, propData] of Object.entries(property.properties)) {
            schema.properties[propName] = mapLexiconTypeToJSONSchema(propData, parentRequiredLogic);
          }
        }
        break;
      case 'array':
        schema.type = 'array';
        if (property.items) {
          schema.items = mapLexiconTypeToJSONSchema(property.items, parentRequiredLogic);
        }
        break;
      default:
        schema.type = property.type;
    }
  }

  // Add constraints for string types (including nullable strings)
  if (property.type === 'string' || (Array.isArray(property.type) && property.type.includes('string'))) {
    if (property.enum) {
      schema.enum = property.enum;
    }
    if (property.pattern) {
      schema.pattern = property.pattern;
    }
    if (property.minLength !== undefined) {
      schema.minLength = property.minLength;
    } else {
      // Add default minLength: 1 for blockchain classes
      schema.minLength = 1;
    }
    if (property.minimum !== undefined) {
      schema.minimum = property.minimum;
    }
    if (property.format) {
      schema.format = property.format;
    }
  }

  // Add constraints for integer types (including nullable integers)
  if (property.type === 'integer' || (Array.isArray(property.type) && property.type.includes('integer'))) {
    if (property.minimum !== undefined) {
      schema.minimum = property.minimum;
    } else {
      // Add default minimum: 1 for blockchain classes
      schema.minimum = 1;
    }
  }

  // Add constraints for number types
  if (property.type === 'decimal' || property.type === 'number' || (Array.isArray(property.type) && (property.type.includes('decimal') || property.type.includes('number')))) {
    if (property.minimum !== undefined) {
      schema.minimum = property.minimum;
    } else {
      // Add default minimum: 1 for blockchain classes
      schema.minimum = 1;
    }
  }

  // Add constraints for array types
  if (property.type === 'array') {
    if (property.minItems !== undefined) {
      schema.minItems = property.minItems;
    } else {
      // Add default minItems: 1 for blockchain classes
      schema.minItems = 1;
    }
  }

  // Handle oneOf
  if (property.oneOf) {
    schema.oneOf = property.oneOf.map(subSchema => mapLexiconTypeToJSONSchema(subSchema, parentRequiredLogic));
  }

  // Handle allOf
  if (property.allOf) {
    schema.allOf = property.allOf.map(subSchema =>
      mapLexiconTypeToJSONSchema(subSchema, parentRequiredLogic)
    );
  }

  // Handle const
  if (property.const !== undefined) {
    schema.const = property.const;
  }

  // Handle not
  if (property.not) {
    schema.not = mapLexiconTypeToJSONSchema(property.not, parentRequiredLogic);
  }

  // Handle additionalProperties
  if (property.additionalProperties !== undefined) {
    if (typeof property.additionalProperties === 'boolean') {
      schema.additionalProperties = property.additionalProperties;
    } else {
      schema.additionalProperties = mapLexiconTypeToJSONSchema(property.additionalProperties, parentRequiredLogic);
    }
  }

  // Handle patternProperties
  if (property.patternProperties) {
    schema.patternProperties = {};
    for (const [pattern, patternProp] of Object.entries(property.patternProperties)) {
      schema.patternProperties[pattern] = mapLexiconTypeToJSONSchema(patternProp, parentRequiredLogic);
    }
  }

  return schema;
}

// Generate JSON Schema for a class
function generateJSONSchemaForClass(lexiconClass) {
  const properties = {};
  const required = [];

  // Process each property
  for (const [propName, propData] of Object.entries(lexiconClass.properties)) {
    // Skip deprecated properties
    if (lexiconClass.deprecated_properties?.includes(propName)) {
      continue;
    }

    // Skip source_http_request properties
    if (propName === 'source_http_request') {
      continue;
    }

    properties[propName] = mapLexiconTypeToJSONSchema(propData, undefined);

    // Check if property is required
    if (isEffectivelyRequired(propData)) {
      required.push(propName);
    }
  }

  // Add HTTP request validation rules if they exist
  const httpRequestRules = generateHTTPRequestValidationRules();
  if (Object.keys(httpRequestRules).length > 0) {
    properties.source_http_request = {
      type: 'object',
      properties: httpRequestRules,
      required: ['url', 'method'],
      additionalProperties: false,
    };
    required.push('source_http_request');
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: lexiconClass.type,
    description: lexiconClass.description || `Schema for ${lexiconClass.type}`,
    properties,
    required,
    additionalProperties: false,
  };
}

// Generate HTTP request validation rules
function generateHTTPRequestValidationRules() {
  return {
    url: {
      type: 'string',
      format: 'uri',
      description: 'The URL to make the HTTP request to',
    },
    method: {
      type: 'string',
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      description: 'The HTTP method to use',
    },
    headers: {
      type: 'object',
      properties: {
        'content-type': {
          type: 'string',
          description: 'Content-Type header',
        },
        authorization: {
          type: 'string',
          description: 'Authorization header',
        },
      },
      additionalProperties: true,
    },
    body: {
      type: 'string',
      description: 'Request body',
    },
  };
}

// Main function to generate schemas
async function generateBlockchainSchemas() {
  const lexiconPath = path.join(__dirname, '..', 'src', 'data', 'lexicon.json');
  const outputDir = path.join(__dirname, '..', 'public', 'json-schemas');

  console.log('🔧 Generating blockchain schemas...');
  console.log(`📁 Reading lexicon from: ${lexiconPath}`);
  console.log(`📁 Output directory: ${outputDir}`);

  try {
    // Read lexicon data
    const lexiconContent = await fs.promises.readFile(lexiconPath, 'utf-8');
    const lexiconData = JSON.parse(lexiconContent);

    // Find blockchain tag
    const blockchainTag = lexiconData.tags.find(tag => tag.name === 'blockchain');
    if (!blockchainTag) {
      throw new Error('No blockchain tag found in lexicon data');
    }

    // Create output directory
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Generate schemas for each blockchain class
    let generatedCount = 0;
    for (const className of BLOCKCHAIN_CLASSES) {
      const lexiconClass = lexiconData.classes.find(c => c.type === className);
      if (!lexiconClass || lexiconClass.is_deprecated) {
        console.log(`⚠️  Skipping ${className} - not found or deprecated`);
        continue;
      }

      console.log(`📄 Generating schema for ${className}...`);

      // Generate JSON Schema
      const jsonSchema = generateJSONSchemaForClass(lexiconClass);

      // Canonicalize the schema
      const canonicalized = canonicalize(jsonSchema);

      // Save locally
      const localPath = path.join(outputDir, `${className}.json`);
      await fs.promises.writeFile(localPath, canonicalized);
      console.log(`✅ ${className} - saved locally`);

      generatedCount++;
    }

    console.log(`\n🎉 Successfully generated ${generatedCount} blockchain schemas!`);
    console.log(`📁 Schemas saved to: ${outputDir}`);

    // List generated files
    const files = await fs.promises.readdir(outputDir);
    const schemaFiles = files.filter(file => file.endsWith('.json') && !file.includes('example') && !file.includes('manifest'));
    console.log(`📋 Generated files: ${schemaFiles.join(', ')}`);

  } catch (error) {
    console.error('❌ Error generating schemas:', error);
    process.exit(1);
  }
}

// Run the script
generateBlockchainSchemas(); 