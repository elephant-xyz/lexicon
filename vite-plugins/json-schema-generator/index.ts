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
  properties: Record<string, unknown>;
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
      type: string | 'array';
      cid?: string;
      items?: {
        type: string;
        cid: string;
        description: string;
      };
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
          type: string | 'array';
          cid?: string;
          items?: {
            type: string;
            cid: string;
            description: string;
          };
          description: string;
        }
      >;
      required: string[];
      additionalProperties: boolean;
      description: string;
    };
  };
}

function mapLexiconTypeToJSONSchema(property: LexiconProperty, isRequired: boolean): Record<string, unknown> {
  const schema: Record<string, unknown> = {};

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
  const properties: Record<string, unknown> = {};
  const allRequiredFields: string[] = [];

  // Use the required field from the lexicon class if it exists
  const lexiconRequiredFields = lexiconClass.required || [];

  // Filter out deprecated properties
  const deprecatedPropsSet = new Set(lexiconClass.deprecated_properties);
  const activeProperties = Object.entries(lexiconClass.properties).filter(
    ([key]) => !deprecatedPropsSet.has(key)
  );

  // Add class-level fields (like source_url) to properties
  for (const [fieldName, fieldDef] of Object.entries(lexiconClass)) {
    // Skip standard class fields and properties (which are handled separately)
    if (['type', 'container_name', 'is_deprecated', 'deprecated_properties', 'description', 'required', 'properties', 'relationships'].includes(fieldName)) {
      continue;
    }
    
    // Add class-level fields to properties
    if (typeof fieldDef === 'object' && fieldDef !== null && 'type' in fieldDef) {
      properties[fieldName] = mapLexiconTypeToJSONSchema(fieldDef as LexiconProperty, false);
      allRequiredFields.push(fieldName);
    }
  }

  // Add regular properties
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
  // Determine if this is a one-to-many relationship based on relationship type
  const isOneToMany = isOneToManyRelationship(relationship.relationship_type);
  
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
      to: isOneToMany ? {
        type: 'array',
        items: {
          type: 'string',
          cid: classCids[relationship.to] || '',
          description: `Reference to ${relationship.to} class schema`,
        },
        description: `Array of references to ${relationship.to} class schemas`,
      } : {
        type: 'string',
        cid: classCids[relationship.to] || '',
        description: `Reference to ${relationship.to} class schema`,
      },
    },
    required: ['from', 'to'],
    additionalProperties: false,
  };
}

function isOneToManyRelationship(relationshipType: string): boolean {
  // Define which relationship types should be arrays (one-to-many)
  const oneToManyTypes = [
    'property_has_layout',
    'property_has_sales_history', 
    'property_has_tax',
    'property_has_file',
    'layout_has_file',
    'property_has_environmental_risk'
  ];
  
  return oneToManyTypes.includes(relationshipType);
}

function generateJSONSchemaForDataGroup(
  dataGroup: DataGroup,
  relationshipCidsMap: Record<string, { cid: string; relationshipType: string }>
): DataGroupSchema {
  const relationshipProperties: Record<string, any> = {};
  const requiredRelationships: string[] = [];

  // Create properties object with relationship_type as keys
  Object.entries(relationshipCidsMap).forEach(([key, { cid, relationshipType }]) => {
    const isOneToMany = isOneToManyRelationship(relationshipType);
    
    relationshipProperties[relationshipType] = isOneToMany ? {
      type: 'array',
      items: {
        type: 'string',
        cid,
        description: `Reference to ${key} relationship schema`,
      },
      description: `Array of references to ${key} relationship schemas`,
    } : {
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
      // 🔨 Generating JSON Schemas for blockchain classes...

      // Check if IPFS upload is available
      const pinataJWT = process.env.PINATA_JWT;
      const enableIPFSUpload = !!pinataJWT;
      
      if (!enableIPFSUpload) {
        // ⚠️  PINATA_JWT not set - skipping IPFS upload. Schemas will be generated locally only.
      }

      try {
        // Read lexicon data
        const lexiconContent = await fs.readFile(options.lexiconPath, 'utf-8');
        const lexiconData: LexiconData = JSON.parse(lexiconContent);

        // Find blockchain tag
        const blockchainTag = lexiconData.tags.find(tag => tag.name === 'blockchain');
        if (!blockchainTag) {
          // ⚠️  No blockchain tag found in lexicon data
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
              // 📄 Generating schema for ${className}...

              // Generate JSON Schema
              const jsonSchema = generateJSONSchemaForClass(lexiconClass);

              // Canonicalize the schema
              const canonicalized = canonicalize(jsonSchema);

              let ipfsCid = '';
              if (enableIPFSUpload) {
                // Upload to IPFS
                ipfsCid = await uploadToIPFS(canonicalized, `${className}.json`);
                // ✅ ${className} - CID: ${ipfsCid}
              } else {
                // Save locally instead
                const localPath = path.join(options.outputDir, `${className}.json`);
                await fs.writeFile(localPath, canonicalized);
                // ✅ ${className} - saved locally
              }

              // Generate and upload example if it exists
              let exampleCid = '';
              if (lexiconClass.example && enableIPFSUpload) {
                // 📝 Generating example for ${className}...
                const canonicalizedExample = canonicalize(lexiconClass.example);
                exampleCid = await uploadToIPFS(canonicalizedExample, `${className}_example.json`);
                // ✅ ${className} example - CID: ${exampleCid}
              } else if (lexiconClass.example) {
                // Save example locally
                const localExamplePath = path.join(options.outputDir, `${className}_example.json`);
                await fs.writeFile(localExamplePath, canonicalize(lexiconClass.example));
                // ✅ ${className} example - saved locally
              }

              return { className, ipfsCid, exampleCid };
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
            // Store example CID if it exists
            if (result.exampleCid) {
              schemaManifest[`${result.className}_example`] = {
                ipfsCid: result.exampleCid,
                type: 'class',
              };
            }
          }
        }

        // Second pass: Generate relationship schemas and examples
        // 🔗 Generating Relationship Schemas and Examples...
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

        // Find relationship class examples
        const relationshipClass = lexiconData.classes.find(c => c.type === 'relationship');
        const relationshipExamples = relationshipClass?.examples || [];

        // Create upload promises for parallel execution
        const relationshipUploadPromises = Array.from(uniqueRelationships.entries()).map(
          ([relKey, relationship]) => {
            return (async () => {
              // 🔗 Generating schema for ${relKey}...

              // Generate relationship schema
              const relSchema = generateJSONSchemaForRelationship(relationship, classCids);

              // Canonicalize and upload
              const canonicalized = canonicalize(relSchema);
              
              let ipfsCid = '';
              if (enableIPFSUpload) {
                ipfsCid = await uploadToIPFS(canonicalized, `${relKey}.json`);
                // ✅ ${relKey} - CID: ${ipfsCid}
              } else {
                // Save locally instead
                const localPath = path.join(options.outputDir, `${relKey}.json`);
                await fs.writeFile(localPath, canonicalized);
                console.log(`  ✅ ${relKey} - saved locally`);
              }

              // Generate and upload examples for this relationship type
              const examplesForType = relationshipExamples.filter(example => 
                example.type === relationship.relationship_type || 
                example.type === `has_${relationship.to}`
              );

              const exampleCids: string[] = [];
              for (const example of examplesForType) {
                if (enableIPFSUpload) {
                  const canonicalizedExample = canonicalize(example);
                  const exampleCid = await uploadToIPFS(canonicalizedExample, `${relKey}_${example.type}_example.json`);
                  exampleCids.push(exampleCid);
                  console.log(`  ✅ ${relKey} ${example.type} example - CID: ${exampleCid}`);
                } else {
                  // Save example locally and generate a placeholder CID for manifest
                  const localExamplePath = path.join(options.outputDir, `${relKey}_${example.type}_example.json`);
                  await fs.writeFile(localExamplePath, canonicalize(example));
                  // Generate a placeholder CID for local development
                  const placeholderCid = `local_${relKey}_${example.type}_example`;
                  exampleCids.push(placeholderCid);
                  console.log(`  ✅ ${relKey} ${example.type} example - saved locally`);
                }
              }

              return { relKey, ipfsCid, exampleCids, examplesForType };
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
          
          // Store example CIDs with proper keys
          for (let i = 0; i < result.exampleCids.length; i++) {
            const example = result.examplesForType[i];
            const exampleKey = `relationship_${example.type}_example`;
            schemaManifest[exampleKey] = {
              ipfsCid: result.exampleCids[i],
              type: 'class',
            };
          }
        }

        // Third pass: Generate data group schemas and examples
        console.log('\n📊 Generating Data Group Schemas and Examples...');
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
            
            let ipfsCid = '';
            if (enableIPFSUpload) {
              ipfsCid = await uploadToIPFS(canonicalized, `${groupKey}.json`);
              console.log(`  ✅ ${dataGroup.label} - CID: ${ipfsCid}`);
            } else {
              // Save locally instead
              const localPath = path.join(options.outputDir, `${groupKey}.json`);
              await fs.writeFile(localPath, canonicalized);
              console.log(`  ✅ ${dataGroup.label} - saved locally`);
            }

            schemaManifest[groupKey] = {
              ipfsCid,
              type: 'dataGroup',
            };

            // Generate and upload example if it exists
            if (dataGroup.example) {
              console.log(`  📝 Generating example for ${dataGroup.label}...`);
              const canonicalizedExample = canonicalize(dataGroup.example);
              
              if (enableIPFSUpload) {
                const exampleCid = await uploadToIPFS(canonicalizedExample, `${groupKey}_example.json`);
                console.log(`  ✅ ${dataGroup.label} example - CID: ${exampleCid}`);
                schemaManifest[`${groupKey}_example`] = {
                  ipfsCid: exampleCid,
                  type: 'class',
                };
              } else {
                // Save example locally
                const localExamplePath = path.join(options.outputDir, `${groupKey}_example.json`);
                await fs.writeFile(localExamplePath, canonicalizedExample);
                console.log(`  ✅ ${dataGroup.label} example - saved locally`);
              }
            }
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
