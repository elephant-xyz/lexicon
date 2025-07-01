import { Plugin } from 'vite';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  LexiconData,
  LexiconClass,
  LexiconProperty,
  DataGroup,
  DataGroupRelationship,
} from '../../src/types/lexicon';
import { uploadToIPFS } from './ipfs-uploader';
import { canonicalize } from 'json-canonicalize';

interface JSONSchemaGeneratorOptions {
  lexiconPath: string;
  outputDir: string;
}

interface JSONSchema {
  $schema: string;
  type: 'object';
  title: string;
  description: string;
  properties: Record<string, any>;
  required: string[];
  additionalProperties: boolean;
}

interface RelationshipSchema extends JSONSchema {
  properties: {
    from: {
      type: string;
      cid: string;
      description: string;
    };
    to: {
      type: string;
      cid: string;
      description: string;
    };
  };
}

interface DataGroupSchema extends JSONSchema {
  properties: {
    label: {
      type: string;
      description: string;
    };
    relationships: {
      type: string;
      properties: Record<
        string,
        {
          type: string;
          cid: string;
          description: string;
        }
      >;
      required: string[];
      additionalProperties: boolean;
      description: string;
    };
  };
}

function mapLexiconTypeToJSONSchema(property: LexiconProperty, isRequired: boolean): any {
  const schema: any = {};

  switch (property.type) {
    case 'string':
      schema.type = isRequired ? 'string' : ['string', 'null'];
      if (property.enum) {
        schema.enum = isRequired ? property.enum : [...property.enum, null];
      }
      if (property.pattern) {
        schema.pattern = property.pattern;
      }
      if (property.format) {
        schema.format = property.format;
      }
      break;
    case 'integer':
      schema.type = isRequired ? 'integer' : ['integer', 'null'];
      break;
    case 'decimal':
    case 'number':
      schema.type = isRequired ? 'number' : ['number', 'null'];
      break;
    case 'boolean':
      schema.type = isRequired ? 'boolean' : ['boolean', 'null'];
      break;
    case 'date':
      schema.type = isRequired ? 'string' : ['string', 'null'];
      schema.format = 'date';
      break;
    case 'datetime':
      schema.type = isRequired ? 'string' : ['string', 'null'];
      schema.format = 'date-time';
      break;
    default:
      schema.type = isRequired ? 'string' : ['string', 'null'];
  }

  if (property.comment) {
    schema.description = property.comment;
  }

  return schema;
}

function generateJSONSchemaForClass(lexiconClass: LexiconClass): JSONSchema {
  const properties: Record<string, any> = {};
  const allRequiredFields: string[] = [];

  // Use the required field from the lexicon class if it exists
  const lexiconRequiredFields = lexiconClass.required || [];

  // Filter out deprecated properties
  const deprecatedPropsSet = new Set(lexiconClass.deprecated_properties);
  const activeProperties = Object.entries(lexiconClass.properties).filter(
    ([key]) => !deprecatedPropsSet.has(key)
  );

  for (const [propName, propDef] of activeProperties) {
    // Fields in lexicon's required array cannot be null
    // Fields NOT in lexicon's required array can be null
    const isRequired = lexiconRequiredFields.includes(propName);
    properties[propName] = mapLexiconTypeToJSONSchema(propDef, isRequired);

    // ALL active properties go into the JSON Schema required array
    allRequiredFields.push(propName);
  }

  return {
    $schema: 'https://json-schema.org/draft-07/schema#',
    type: 'object',
    title: lexiconClass.type,
    description: `JSON Schema for ${lexiconClass.type} class in Elephant Lexicon`,
    properties,
    required: allRequiredFields, // All properties are required in JSON Schema
    additionalProperties: false,
  };
}

function generateJSONSchemaForRelationship(
  relationship: DataGroupRelationship,
  classCids: Record<string, string>
): RelationshipSchema {
  return {
    $schema: 'https://json-schema.org/draft-07/schema#',
    type: 'object',
    title: `${relationship.from}_to_${relationship.to}`,
    description: `JSON Schema for relationship from ${relationship.from} to ${relationship.to}`,
    properties: {
      from: {
        type: 'string',
        cid: classCids[relationship.from] || '',
        description: `Reference to ${relationship.from} class schema`,
      },
      to: {
        type: 'string',
        cid: classCids[relationship.to] || '',
        description: `Reference to ${relationship.to} class schema`,
      },
    },
    required: ['from', 'to'],
    additionalProperties: false,
  };
}

function generateJSONSchemaForDataGroup(
  dataGroup: DataGroup,
  relationshipCidsMap: Record<string, { cid: string; relationshipType: string }>
): DataGroupSchema {
  const relationshipProperties: Record<string, any> = {};
  const requiredRelationships: string[] = [];

  // Create properties object with relationship_type as keys
  Object.entries(relationshipCidsMap).forEach(([key, { cid, relationshipType }]) => {
    relationshipProperties[relationshipType] = {
      type: 'string',
      cid,
      description: `Reference to ${key} relationship schema`,
    };
    requiredRelationships.push(relationshipType);
  });

  return {
    $schema: 'https://json-schema.org/draft-07/schema#',
    type: 'object',
    title: dataGroup.label,
    description: `JSON Schema for ${dataGroup.label} data group`,
    properties: {
      label: {
        type: 'string',
        description: 'Data group label',
      },
      relationships: {
        type: 'object',
        properties: relationshipProperties,
        required: requiredRelationships,
        additionalProperties: false,
        description: 'Object of relationships in this data group, keyed by relationship_type',
      },
    },
    required: ['label', 'relationships'],
    additionalProperties: false,
  };
}

export function jsonSchemaGeneratorPlugin(options: JSONSchemaGeneratorOptions): Plugin {
  return {
    name: 'json-schema-generator',
    async buildStart() {
      console.log('🔨 Generating JSON Schemas for blockchain classes...');

      try {
        // Read lexicon data
        const lexiconContent = await fs.readFile(options.lexiconPath, 'utf-8');
        const lexiconData: LexiconData = JSON.parse(lexiconContent);

        // Find blockchain tag
        const blockchainTag = lexiconData.tags.find(tag => tag.name === 'blockchain');
        if (!blockchainTag) {
          console.warn('⚠️  No blockchain tag found in lexicon data');
          return;
        }

        // Create output directory
        await fs.mkdir(options.outputDir, { recursive: true });

        // Generate schemas for each blockchain class
        const schemaManifest: Record<
          string,
          { ipfsCid: string; type: 'class' | 'relationship' | 'dataGroup' }
        > = {};
        const classCids: Record<string, string> = {};

        // First pass: Generate class schemas
        console.log('\n📦 Generating Class Schemas...');

        // Create upload promises for parallel execution
        const classUploadPromises = blockchainTag.classes
          .map(className => {
            const lexiconClass = lexiconData.classes.find(c => c.type === className);
            if (!lexiconClass || lexiconClass.is_deprecated) {
              return null;
            }

            return (async () => {
              console.log(`  📄 Generating schema for ${className}...`);

              // Generate JSON Schema
              const jsonSchema = generateJSONSchemaForClass(lexiconClass);

              // Canonicalize the schema
              const canonicalized = canonicalize(jsonSchema);

              // Upload to IPFS
              const ipfsCid = await uploadToIPFS(canonicalized, `${className}.json`);

              console.log(`  ✅ ${className} - CID: ${ipfsCid}`);

              return { className, ipfsCid };
            })();
          })
          .filter(promise => promise !== null);

        // Execute all class uploads in parallel
        const classResults = await Promise.all(classUploadPromises);

        // Store results
        for (const result of classResults) {
          if (result) {
            classCids[result.className] = result.ipfsCid;
            schemaManifest[result.className] = {
              ipfsCid: result.ipfsCid,
              type: 'class',
            };
          }
        }

        // Second pass: Generate relationship schemas
        console.log('\n🔗 Generating Relationship Schemas...');
        const relationshipCids: Record<string, string> = {};

        // Collect unique relationships
        const uniqueRelationships = new Map<string, DataGroupRelationship>();
        for (const dataGroup of lexiconData.data_groups) {
          for (const relationship of dataGroup.relationships) {
            // Only process relationships where both classes are in blockchain tag
            if (
              blockchainTag.classes.includes(relationship.from) &&
              blockchainTag.classes.includes(relationship.to)
            ) {
              const relKey = `${relationship.from}_to_${relationship.to}`;
              if (!uniqueRelationships.has(relKey)) {
                uniqueRelationships.set(relKey, relationship);
              }
            }
          }
        }

        // Create upload promises for parallel execution
        const relationshipUploadPromises = Array.from(uniqueRelationships.entries()).map(
          ([relKey, relationship]) => {
            return (async () => {
              console.log(`  🔗 Generating schema for ${relKey}...`);

              // Generate relationship schema
              const relSchema = generateJSONSchemaForRelationship(relationship, classCids);

              // Canonicalize and upload
              const canonicalized = canonicalize(relSchema);
              const ipfsCid = await uploadToIPFS(canonicalized, `${relKey}.json`);

              console.log(`  ✅ ${relKey} - CID: ${ipfsCid}`);

              return { relKey, ipfsCid };
            })();
          }
        );

        // Execute all relationship uploads in parallel
        const relationshipResults = await Promise.all(relationshipUploadPromises);

        // Store results
        for (const result of relationshipResults) {
          relationshipCids[result.relKey] = result.ipfsCid;
          schemaManifest[result.relKey] = {
            ipfsCid: result.ipfsCid,
            type: 'relationship',
          };
        }

        // Third pass: Generate data group schemas
        console.log('\n📊 Generating Data Group Schemas...');
        for (const dataGroup of lexiconData.data_groups) {
          // Get all relationships for this data group that are in blockchain
          const groupRelationshipCidsMap: Record<
            string,
            { cid: string; relationshipType: string }
          > = {};

          for (const relationship of dataGroup.relationships) {
            const relKey = `${relationship.from}_to_${relationship.to}`;
            if (relationshipCids[relKey]) {
              groupRelationshipCidsMap[relKey] = {
                cid: relationshipCids[relKey],
                relationshipType: relationship.relationship_type || `has_${relationship.to}`,
              };
            }
          }

          // Only generate schema if there are blockchain relationships
          if (Object.keys(groupRelationshipCidsMap).length > 0) {
            const groupKey = dataGroup.label.replace(/\s+/g, '_');
            console.log(`  📊 Generating schema for ${dataGroup.label}...`);

            // Generate data group schema
            const groupSchema = generateJSONSchemaForDataGroup(dataGroup, groupRelationshipCidsMap);

            // Canonicalize and upload
            const canonicalized = canonicalize(groupSchema);
            const ipfsCid = await uploadToIPFS(canonicalized, `${groupKey}.json`);

            schemaManifest[groupKey] = {
              ipfsCid,
              type: 'dataGroup',
            };

            console.log(`  ✅ ${dataGroup.label} - CID: ${ipfsCid}`);
          }
        }

        // Write manifest file
        const manifestPath = path.join(options.outputDir, 'schema-manifest.json');
        await fs.writeFile(manifestPath, JSON.stringify(schemaManifest, null, 2));

        console.log('✨ JSON Schema generation complete!');
      } catch (error) {
        console.error('❌ Error generating JSON Schemas:', error);
        throw error;
      }
    },
  };
}
