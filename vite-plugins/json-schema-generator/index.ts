import { Plugin } from 'vite';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LexiconData, LexiconClass, LexiconProperty } from '../../src/types/lexicon';
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

function mapLexiconTypeToJSONSchema(property: LexiconProperty): any {
  const schema: any = {
    type: null,
    nullable: true
  };

  switch (property.type) {
    case 'string':
      schema.type = ['string', 'null'];
      if (property.enum) {
        schema.enum = [...property.enum, null];
      }
      if (property.pattern) {
        schema.pattern = property.pattern;
      }
      if (property.format) {
        schema.format = property.format;
      }
      break;
    case 'integer':
      schema.type = ['integer', 'null'];
      break;
    case 'decimal':
    case 'number':
      schema.type = ['number', 'null'];
      break;
    case 'boolean':
      schema.type = ['boolean', 'null'];
      break;
    case 'date':
      schema.type = ['string', 'null'];
      schema.format = 'date';
      break;
    case 'datetime':
      schema.type = ['string', 'null'];
      schema.format = 'date-time';
      break;
    default:
      schema.type = ['string', 'null'];
  }

  if (property.comment) {
    schema.description = property.comment;
  }

  return schema;
}

function generateJSONSchemaForClass(lexiconClass: LexiconClass): JSONSchema {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  // Filter out deprecated properties
  const activeProperties = Object.entries(lexiconClass.properties)
    .filter(([key]) => !lexiconClass.deprecated_properties.includes(key));

  for (const [propName, propDef] of activeProperties) {
    properties[propName] = mapLexiconTypeToJSONSchema(propDef);
    // All fields are required as per requirements
    required.push(propName);
  }

  return {
    $schema: 'https://json-schema.org/draft-07/schema#',
    type: 'object',
    title: lexiconClass.type,
    description: `JSON Schema for ${lexiconClass.type} class in Elephant Lexicon`,
    properties,
    required,
    additionalProperties: false
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
        const schemaManifest: Record<string, { ipfsCid: string }> = {};
        
        for (const className of blockchainTag.classes) {
          const lexiconClass = lexiconData.classes.find(c => c.type === className);
          if (!lexiconClass || lexiconClass.is_deprecated) {
            continue;
          }
          
          console.log(`  📄 Generating schema for ${className}...`);
          
          // Generate JSON Schema
          const jsonSchema = generateJSONSchemaForClass(lexiconClass);
          
          // Canonicalize the schema
          const canonicalized = canonicalize(jsonSchema);
          
          // Upload to IPFS
          const ipfsCid = await uploadToIPFS(canonicalized, `${className}.json`);
          
          schemaManifest[className] = {
            ipfsCid
          };
          
          console.log(`  ✅ ${className} - CID: ${ipfsCid}`);
        }
        
        // Write manifest file
        const manifestPath = path.join(options.outputDir, 'schema-manifest.json');
        await fs.writeFile(manifestPath, JSON.stringify(schemaManifest, null, 2));
        
        console.log('✨ JSON Schema generation complete!');
        
      } catch (error) {
        console.error('❌ Error generating JSON Schemas:', error);
        throw error;
      }
    }
  };
}