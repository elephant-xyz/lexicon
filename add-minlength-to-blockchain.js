import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the lexicon data
const lexiconPath = path.join(__dirname, 'src/data/lexicon.json');
const lexiconData = JSON.parse(fs.readFileSync(lexiconPath, 'utf8'));

// Get blockchain classes
const blockchainTag = lexiconData.tags.find(tag => tag.name === 'blockchain');
if (!blockchainTag) {
  console.error('No blockchain tag found');
  process.exit(1);
}

console.log('Blockchain classes:', blockchainTag.classes);

// Function to recursively add minimum constraints to properties
function addMinimumConstraintsToProperties(properties) {
  for (const [propName, propData] of Object.entries(properties)) {
    // Skip if property is deprecated
    if (propData.is_deprecated) continue;

    // Handle string types - add minLength
    if (propData.type === 'string' && propData.minLength === undefined) {
      propData.minLength = 1;
      console.log(`Added minLength: 1 to string property ${propName}`);
    }

    // Handle integer types - add minimum
    if (propData.type === 'integer' && propData.minimum === undefined) {
      propData.minimum = 1;
      console.log(`Added minimum: 1 to integer property ${propName}`);
    }

    // Handle array types - add minItems
    if (propData.type === 'array' && propData.minItems === undefined) {
      propData.minItems = 1;
      console.log(`Added minItems: 1 to array property ${propName}`);
    }

    // Handle nested properties in objects
    if (propData.type === 'object' && propData.properties) {
      addMinimumConstraintsToProperties(propData.properties);
    }

    // Handle items in arrays
    if (propData.type === 'array' && propData.items) {
      if (propData.items.type === 'string' && propData.items.minLength === undefined) {
        propData.items.minLength = 1;
        console.log(`Added minLength: 1 to array items in ${propName}`);
      }
      if (propData.items.type === 'integer' && propData.items.minimum === undefined) {
        propData.items.minimum = 1;
        console.log(`Added minimum: 1 to array items in ${propName}`);
      }
      if (propData.items.type === 'object' && propData.items.properties) {
        addMinimumConstraintsToProperties(propData.items.properties);
      }
    }

    // Handle oneOf arrays
    if (propData.oneOf && Array.isArray(propData.oneOf)) {
      propData.oneOf.forEach((subSchema, index) => {
        if (subSchema.type === 'string' && subSchema.minLength === undefined) {
          subSchema.minLength = 1;
          console.log(`Added minLength: 1 to oneOf[${index}] in ${propName}`);
        }
        if (subSchema.type === 'integer' && subSchema.minimum === undefined) {
          subSchema.minimum = 1;
          console.log(`Added minimum: 1 to oneOf[${index}] in ${propName}`);
        }
        if (subSchema.type === 'object' && subSchema.properties) {
          addMinimumConstraintsToProperties(subSchema.properties);
        }
      });
    }

    // Handle additionalProperties
    if (propData.additionalProperties && typeof propData.additionalProperties === 'object') {
      if (
        propData.additionalProperties.type === 'string' &&
        propData.additionalProperties.minLength === undefined
      ) {
        propData.additionalProperties.minLength = 1;
        console.log(`Added minLength: 1 to additionalProperties in ${propName}`);
      }
      if (
        propData.additionalProperties.type === 'integer' &&
        propData.additionalProperties.minimum === undefined
      ) {
        propData.additionalProperties.minimum = 1;
        console.log(`Added minimum: 1 to additionalProperties in ${propName}`);
      }
      if (
        propData.additionalProperties.type === 'object' &&
        propData.additionalProperties.properties
      ) {
        addMinimumConstraintsToProperties(propData.additionalProperties.properties);
      }
    }
  }
}

// Process each blockchain class
let totalChanges = 0;
for (const className of blockchainTag.classes) {
  const lexiconClass = lexiconData.classes.find(c => c.type === className);
  if (!lexiconClass) {
    console.warn(`Class ${className} not found`);
    continue;
  }

  if (lexiconClass.is_deprecated) {
    console.log(`Skipping deprecated class: ${className}`);
    continue;
  }

  console.log(`\nProcessing class: ${className}`);
  const beforeCount =
    (JSON.stringify(lexiconClass).match(/minLength/g)?.length || 0) +
    (JSON.stringify(lexiconClass).match(/minimum/g)?.length || 0) +
    (JSON.stringify(lexiconClass).match(/minItems/g)?.length || 0);

  addMinimumConstraintsToProperties(lexiconClass.properties);

  const afterCount =
    (JSON.stringify(lexiconClass).match(/minLength/g)?.length || 0) +
    (JSON.stringify(lexiconClass).match(/minimum/g)?.length || 0) +
    (JSON.stringify(lexiconClass).match(/minItems/g)?.length || 0);
  const changes = afterCount - beforeCount;
  totalChanges += changes;
  console.log(`Added ${changes} minimum constraints to ${className}`);
}

// Write the updated data back to the file
fs.writeFileSync(lexiconPath, JSON.stringify(lexiconData, null, 2));
console.log(`\nTotal minimum constraints added: ${totalChanges}`);
console.log('Updated lexicon.json successfully!');
