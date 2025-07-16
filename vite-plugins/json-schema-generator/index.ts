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
  type: 'object' | string;
  title: string;
  description: string;
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: boolean;
  allOf?: unknown[];
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
      enum?: string[];
    };
    relationships: {
      type: string;
      properties: Record<
        string,
        {
          type: string | 'array' | (string | 'array')[];
          cid?: string;
          items?: {
            type: string;
            cid: string;
            description: string;
          };
          description: string;
          minItems?: number;
        }
      >;
      required: string[];
      additionalProperties: boolean;
      description: string;
    };
  };
}

function mapLexiconTypeToJSONSchema(
  property: LexiconProperty,
  isRequired: boolean
): Record<string, unknown> {
  const schema: Record<string, unknown> = {};

  // If property has minimum constraint, it cannot be null
  const effectiveRequired = isRequired || property.minimum !== undefined;

  // Handle oneOf first (before checking type)
  if (property.oneOf) {
    // Check if this is a simple type union (only contains basic types without additional properties)
    const isSimpleTypeUnion = property.oneOf.every(
      subSchema =>
        subSchema.type &&
        typeof subSchema.type === 'string' &&
        !subSchema.properties &&
        !subSchema.enum &&
        !subSchema.pattern &&
        !subSchema.format &&
        !subSchema.minLength &&
        !subSchema.minimum &&
        !subSchema.items &&
        !subSchema.additionalProperties
    );

    if (isSimpleTypeUnion) {
      // Use simple array syntax for basic type unions
      const types = property.oneOf.map(subSchema => subSchema.type as string);

      if (!effectiveRequired) {
        types.push('null');
      }

      schema.type = types.length === 1 ? types[0] : types;

      // Add description if available
      if (property.comment) {
        schema.description = property.comment;
      }

      return schema;
    } else {
      // Use oneOf for complex schemas
      schema.oneOf = property.oneOf.map(subSchema => mapLexiconTypeToJSONSchema(subSchema, true));

      // If not required, add null as an option
      if (!effectiveRequired) {
        schema.oneOf.push({ type: 'null' });
      }

      // Add description if available
      if (property.comment) {
        schema.description = property.comment;
      }

      return schema;
    }
  }

  switch (property.type) {
    case 'string':
      schema.type = effectiveRequired ? 'string' : ['string', 'null'];
      if (property.enum) {
        schema.enum = effectiveRequired ? property.enum : [...property.enum, null];
      }
      if (property.pattern) {
        schema.pattern = property.pattern;
      }
      if (property.minLength !== undefined) {
        schema.minLength = property.minLength;
      }

      if (property.minimum !== undefined) {
        schema.minimum = property.minimum;
      }

      if (property.format) {
        schema.format = property.format;
      }

      break;
    case 'integer':
      schema.type = effectiveRequired ? 'integer' : ['integer', 'null'];
      if (property.minimum !== undefined) {
        schema.minimum = property.minimum;
      }
      break;
    case 'decimal':
    case 'number':
      schema.type = effectiveRequired ? 'number' : ['number', 'null'];
      if (property.minimum !== undefined) {
        schema.minimum = property.minimum;
      }
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
    case 'object':
      // Handle object types with nested properties
      if (effectiveRequired) {
        schema.type = 'object';
      } else {
        schema.type = ['object', 'null'];
      }

      // Add nested properties if they exist
      if (property.properties) {
        schema.properties = {};
        const requiredProps: string[] = [];

        for (const [propName, propDef] of Object.entries(property.properties)) {
          (schema.properties as Record<string, unknown>)[propName] = mapLexiconTypeToJSONSchema(
            propDef,
            propDef.required || false
          );
          if (propDef.required) {
            requiredProps.push(propName);
          }
        }

        if (requiredProps.length > 0) {
          schema.required = requiredProps;
        }

        // Handle additionalProperties
        if (property.additionalProperties !== undefined) {
          if (typeof property.additionalProperties === 'boolean') {
            schema.additionalProperties = property.additionalProperties;
          } else {
            schema.additionalProperties = mapLexiconTypeToJSONSchema(
              property.additionalProperties,
              false
            );
          }
        } else {
          schema.additionalProperties = false;
        }
      }

      // Add pattern properties if they exist
      if (property.patternProperties) {
        schema.patternProperties = {};

        for (const [pattern, propDef] of Object.entries(property.patternProperties)) {
          (schema.patternProperties as Record<string, unknown>)[pattern] =
            mapLexiconTypeToJSONSchema(propDef, true);
        }

        if (!schema.properties && property.additionalProperties === undefined) {
          schema.additionalProperties = false;
        }
      }

      // Handle allOf
      if (property.allOf) {
        schema.allOf = property.allOf.map(subSchema => mapLexiconTypeToJSONSchema(subSchema, true));
      }

      break;
    case 'array':
      schema.type = effectiveRequired ? 'array' : ['array', 'null'];

      // Add items schema if it exists
      if (property.items) {
        schema.items = mapLexiconTypeToJSONSchema(property.items, true);
      }

      // Add minimum items constraint if it exists
      if (property.minItems !== undefined) {
        schema.minItems = property.minItems;
      }

      break;
    default:
      schema.type = isRequired ? 'string' : ['string', 'null'];
  }

  // Handle const keyword
  if (property.const !== undefined) {
    schema.const = property.const;
  }

  // Handle not keyword
  if (property.not) {
    schema.not = mapLexiconTypeToJSONSchema(property.not, true);
  }

  if (property.comment) {
    schema.description = property.comment;
  }

  return schema;
}

function generateHTTPRequestValidationRules(): Record<string, unknown> {
  return {
    allOf: [
      {
        if: {
          properties: {
            method: {
              enum: ['GET'],
            },
          },
        },
        then: {
          not: {
            anyOf: [
              {
                required: ['body'],
              },
              {
                required: ['json'],
              },
              {
                required: ['headers'],
              },
            ],
          },
        },
      },
      {
        if: {
          properties: {
            method: {
              enum: ['POST', 'PUT', 'PATCH'],
            },
            headers: {
              properties: {
                'content-type': {
                  const: 'application/json',
                },
              },
            },
          },
        },
        then: {
          required: ['json'],
          not: {
            required: ['body'],
          },
        },
      },
      {
        if: {
          properties: {
            method: {
              enum: ['POST', 'PUT', 'PATCH'],
            },
            headers: {
              properties: {
                'content-type': {
                  not: {
                    const: 'application/json',
                  },
                },
              },
            },
          },
        },
        then: {
          required: ['body'],
          not: {
            required: ['json'],
          },
        },
      },
      {
        if: {
          required: ['json'],
        },
        then: {
          properties: {
            headers: {
              required: ['content-type'],
              properties: {
                'content-type': {
                  const: 'application/json',
                },
              },
            },
          },
        },
      },
      {
        if: {
          required: ['body'],
        },
        then: {
          properties: {
            headers: {
              required: ['content-type'],
              properties: {
                'content-type': {
                  not: {
                    const: 'application/json',
                  },
                },
              },
            },
          },
        },
      },
    ],
  };
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
    if (
      [
        'type',
        'container_name',
        'is_deprecated',
        'deprecated_properties',
        'description',
        'required',
        'properties',
        'relationships',
      ].includes(fieldName)
    ) {
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

  // Create base schema
  const baseSchema = {
    $schema: 'https://json-schema.org/draft-07/schema#',
    type: 'object',
    title: lexiconClass.type,
    description: `JSON Schema for ${lexiconClass.type} class in Elephant Lexicon`,
    properties,
    required: allRequiredFields, // All properties are required in JSON Schema
    additionalProperties: false,
  };

  // Add HTTP request validation rules if source_http_request is present
  if (properties.source_http_request) {
    const validationRules = generateHTTPRequestValidationRules();
    return {
      ...baseSchema,
      allOf: [
        {
          // HTTP request specific validation
          if: {
            properties: {
              source_http_request: {
                type: 'object',
              },
            },
          },
          then: {
            properties: {
              source_http_request: validationRules,
            },
          },
        },
      ],
    };
  }

  return baseSchema;
}

function generateJSONSchemaForRelationship(
  relationship: DataGroupRelationship,
  classCids: Record<string, string>
): RelationshipSchema {
  // Determine if this is a one-to-many relationship based on relationship type

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

// Updated function to accept the one-to-many relationships array
function isOneToManyRelationship(
  relationshipType: string | undefined,
  oneToManyRelationships: string[]
): boolean {
  if (!relationshipType) return false;
  return oneToManyRelationships.includes(relationshipType);
}

function generateJSONSchemaForDataGroup(
  dataGroup: DataGroup,
  relationshipCidsMap: Record<string, { cid: string; relationshipType: string }>,
  allDataGroupLabels: string[]
): DataGroupSchema {
  const relationshipProperties: Record<
    string,
    {
      type: string | 'array' | (string | 'array')[];
      cid?: string;
      items?: {
        type: string;
        cid: string;
        description: string;
      };
      description: string;
      minItems?: number;
    }
  > = {};
  const requiredRelationships: string[] = [];

  // Get the required relationships from the data group
  const dataGroupRequired = dataGroup.required || [];

  // Get the one-to-many relationships from the data group
  const oneToManyRelationships = dataGroup.one_to_many_relationships || [];

  // Create properties object with relationship_type as keys
  Object.entries(relationshipCidsMap).forEach(([key, { cid, relationshipType }]) => {
    const isOneToMany = isOneToManyRelationship(relationshipType, oneToManyRelationships);
    const isRequired = dataGroupRequired.includes(relationshipType);

    relationshipProperties[relationshipType] = isOneToMany
      ? {
          type: isRequired ? 'array' : ['array', 'null'],
          items: {
            type: 'string',
            cid,
            description: `Reference to ${key} relationship schema`,
          },
          minItems: 1,
          description: isRequired
            ? `Array of references to ${key} relationship schemas (required)`
            : `Array of references to ${key} relationship schemas (can be null)`,
        }
      : {
          type: isRequired ? 'string' : ['string', 'null'],
          cid,
          description: isRequired
            ? `Reference to ${key} relationship schema (required)`
            : `Reference to ${key} relationship schema (can be null)`,
        };

    // Add to required list if this relationship is required
    if (isRequired) {
      requiredRelationships.push(relationshipType);
    }
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
        enum: allDataGroupLabels,
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
      // 📦 Generating Class Schemas...

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
              // ✅ ${relKey} - saved locally
            }

            // Generate and upload examples for this relationship type
            const examplesForType = relationshipExamples.filter(
              example =>
                example.type === relationship.relationship_type ||
                example.type === `has_${relationship.to}`
            );

            const exampleCids: string[] = [];
            for (const example of examplesForType) {
              if (enableIPFSUpload) {
                const canonicalizedExample = canonicalize(example);
                const exampleCid = await uploadToIPFS(
                  canonicalizedExample,
                  `${relKey}_${example.type}_example.json`
                );
                exampleCids.push(exampleCid);
                // ✅ ${relKey} ${example.type} example - CID: ${exampleCid}
              } else {
                // Save example locally and generate a placeholder CID for manifest
                const localExamplePath = path.join(
                  options.outputDir,
                  `${relKey}_${example.type}_example.json`
                );
                await fs.writeFile(localExamplePath, canonicalize(example));
                // Generate a placeholder CID for local development
                const placeholderCid = `local_${relKey}_${example.type}_example`;
                exampleCids.push(placeholderCid);
                // ✅ ${relKey} ${example.type} example - saved locally
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
      // 📊 Generating Data Group Schemas and Examples...
      const allDataGroupLabels = lexiconData.data_groups.map(g => g.label);
      for (const dataGroup of lexiconData.data_groups) {
        // Get all relationships for this data group that are in blockchain
        const groupRelationshipCidsMap: Record<string, { cid: string; relationshipType: string }> =
          {};

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
          // 📊 Generating schema for ${dataGroup.label}...

          // Generate data group schema
          const groupSchema = generateJSONSchemaForDataGroup(
            dataGroup,
            groupRelationshipCidsMap,
            allDataGroupLabels
          );

          // Canonicalize and upload
          const canonicalized = canonicalize(groupSchema);

          let ipfsCid = '';
          if (enableIPFSUpload) {
            ipfsCid = await uploadToIPFS(canonicalized, `${groupKey}.json`);
            // ✅ ${dataGroup.label} - CID: ${ipfsCid}
          } else {
            // Save locally instead
            const localPath = path.join(options.outputDir, `${groupKey}.json`);
            await fs.writeFile(localPath, canonicalized);
            // ✅ ${dataGroup.label} - saved locally
          }

          schemaManifest[groupKey] = {
            ipfsCid,
            type: 'dataGroup',
          };

          // Generate and upload example if it exists
          if (dataGroup.example) {
            // 📝 Generating example for ${dataGroup.label}...
            const canonicalizedExample = canonicalize(dataGroup.example);

            if (enableIPFSUpload) {
              const exampleCid = await uploadToIPFS(
                canonicalizedExample,
                `${groupKey}_example.json`
              );
              // ✅ ${dataGroup.label} example - CID: ${exampleCid}
              schemaManifest[`${groupKey}_example`] = {
                ipfsCid: exampleCid,
                type: 'class',
              };
            } else {
              // Save example locally
              const localExamplePath = path.join(options.outputDir, `${groupKey}_example.json`);
              await fs.writeFile(localExamplePath, canonicalizedExample);
              // ✅ ${dataGroup.label} example - saved locally
            }
          }
        }
      }

      // Write manifest file
      const manifestPath = path.join(options.outputDir, 'schema-manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(schemaManifest, null, 2));

      // ✨ JSON Schema generation complete!
    },
  };
}
