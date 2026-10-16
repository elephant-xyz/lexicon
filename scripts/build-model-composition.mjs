/* global console, process */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lexiconPath = path.join(root, 'src/data/lexicon.json');
const choicesPath = path.join(root, 'src/data/model/duplicate-choices.json');
const compositionPath = path.join(root, 'src/data/model/elephant-lexicon.composition.json');
const omissionsPath = path.join(root, 'src/data/model/omissions.json');

const SOURCE_DIGEST = 'sha256:25c991cc323a0642776726674c99a549d53ca30f3a9c89507e261a014183659c';
const SOURCE_REVISION = 'dbf2b2dea8f332aff28b3444ceffd44f9e17364d';
const BASE_LABELS = new Set(['person', 'company', 'address']);
const MAX_DEFINITIONS = 500;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const lexiconBytes = readFileSync(lexiconPath);
const lexiconDigest = `sha256:${createHash('sha256').update(lexiconBytes).digest('hex')}`;
if (lexiconDigest !== SOURCE_DIGEST) {
  fail(`src/data/lexicon.json digest is ${lexiconDigest}, expected ${SOURCE_DIGEST}`);
}

const lexicon = JSON.parse(lexiconBytes.toString('utf8'));
const choices = loadChoices();
const selected = selectClasses(lexicon.classes, choices);

const omissions = {
  source: {
    repository: 'https://github.com/elephant-xyz/lexicon',
    revision: SOURCE_REVISION,
    path: 'src/data/lexicon.json',
    digest: SOURCE_DIGEST,
  },
  decisions: [
    {
      kind: 'topVertex',
      definitionId: 'property',
      reason:
        'Contract 1.0 requires one local top vertex. Reachability from that vertex is not enforced by the current compiler.',
    },
    {
      kind: 'identity',
      strategy: 'contentHash',
      reason:
        'The viewer lexicon does not declare Model identity properties, so every local vertex uses content-hash identity.',
    },
    {
      kind: 'baseLabelsNotRedeclared',
      labels: ['address', 'company', 'person'],
      reason:
        'These labels belong to model-shared-base-v1.5.0. An extension cannot redeclare them, so Elephant fields on these classes stay only in lexicon.json.',
    },
  ],
  duplicateChoices: choices,
  omittedDocumentKeys: ['tags', 'data_groups', 'common_patterns'],
  droppedConstraints: [],
  convertedProperties: [],
  droppedProperties: [],
  omittedRelationships: [],
};

for (const type of ['listing_observation', 'sale_availability_assessment']) {
  omissions.droppedConstraints.push({
    class: type,
    kind: 'allOf',
    reason: 'Composition Contract 1.0 cannot store conditional allOf constraints.',
  });
}

const vertices = [];
for (const entry of selected) {
  if (BASE_LABELS.has(entry.classObject.type)) {
    continue;
  }
  vertices.push(buildVertex(entry.classObject));
}
vertices.sort((left, right) => left.definitionId.localeCompare(right.definitionId));

if (!vertices.some(vertex => vertex.definitionId === 'property')) {
  fail('local top vertex property was not produced');
}

const knownTypes = new Set([...BASE_LABELS, ...vertices.map(vertex => vertex.definitionId)]);
const eligibleRelationships = [];
for (const entry of selected) {
  const fromType = entry.classObject.type;
  const relationships = entry.classObject.relationships ?? {};
  for (const name of Object.keys(relationships).sort()) {
    const spec = relationships[name];
    const targets = Array.isArray(spec.targets) ? spec.targets : [];
    if (targets.length !== 1 || !knownTypes.has(targets[0])) {
      omissions.omittedRelationships.push({
        from: fromType,
        name,
        targets,
        reason:
          targets.length !== 1
            ? 'relationship does not have exactly one target'
            : 'target is not a known class',
      });
      continue;
    }
    eligibleRelationships.push({ fromType, name, spec, target: targets[0] });
  }
}
eligibleRelationships.sort((left, right) =>
  `${left.fromType}\u0000${left.name}`.localeCompare(`${right.fromType}\u0000${right.name}`)
);

const relationshipRoom = MAX_DEFINITIONS - vertices.length;
if (relationshipRoom < 0) {
  fail(`vertex count ${vertices.length} exceeds ${MAX_DEFINITIONS}`);
}
const includedRelationships = eligibleRelationships.slice(0, relationshipRoom);
for (const relationship of eligibleRelationships.slice(relationshipRoom)) {
  omissions.omittedRelationships.push({
    from: relationship.fromType,
    name: relationship.name,
    targets: [relationship.target],
    reason: 'omitted because the composition definition limit is 500',
  });
}

const relationships = includedRelationships.map(buildRelationship);
const definitions = [...vertices, ...relationships];
const definitionIds = definitions.map(definition => definition.definitionId);
if (new Set(definitionIds).size !== definitionIds.length) {
  fail('definition ids are not unique');
}

const composition = {
  manifest: {
    contractVersion: '1.0',
    packageKind: 'extension',
    namespace: 'https://schemas.elephant.xyz/lexicon',
    imports: [
      {
        alias: 'base',
        accountId: 'model',
        vocabularyId: 'model-shared-base',
        releaseId: 'model-shared-base-v1.5.0',
        releaseDigest: 'sha256:83ab8d88a50867f1cceb01cc7499de871fec36df2e06ba3f76ef51dad25c1272',
        namespace: 'https://schemas.prism.ai/base',
        packageKind: 'base',
      },
    ],
    exports: definitionIds,
    sources: [
      {
        alias: 'elephant-lexicon',
        repository: 'https://github.com/elephant-xyz/lexicon',
        revision: SOURCE_REVISION,
        path: 'src/data/lexicon.json',
        digest: SOURCE_DIGEST,
      },
    ],
    topVertex: {
      scope: 'local',
      definitionId: 'property',
    },
  },
  definitions,
};

omissions.counts = {
  vertices: vertices.length,
  relationshipsEligible: eligibleRelationships.length,
  relationshipsIncluded: relationships.length,
  relationshipsOmitted: omissions.omittedRelationships.length,
  definitions: definitions.length,
  convertedProperties: omissions.convertedProperties.length,
  droppedProperties: omissions.droppedProperties.length,
};

writeJson(compositionPath, composition);
writeJson(omissionsPath, omissions);
console.log(
  `wrote ${definitions.length} definitions (${vertices.length} vertices, ${relationships.length} relationships)`
);

function loadChoices() {
  let document;
  try {
    document = JSON.parse(readFileSync(choicesPath, 'utf8'));
  } catch {
    fail(`duplicate choices file is missing or invalid: ${choicesPath}`);
  }
  for (const type of ['product_api', 'product_configuration', 'ticket']) {
    const choice = document[type];
    if (!choice?.bodySha256 || !Number.isInteger(choice.classIndex)) {
      fail(`duplicate-choices.json must name one body for ${type}`);
    }
  }
  return document;
}

function selectClasses(classes, choiceDocument) {
  const grouped = new Map();
  classes.forEach((classObject, classIndex) => {
    const entries = grouped.get(classObject.type) ?? [];
    entries.push({ classIndex, classObject });
    grouped.set(classObject.type, entries);
  });

  const selected = [];
  for (const [type, entries] of grouped) {
    if (entries.length === 1) {
      selected.push(entries[0]);
      continue;
    }
    const choice = choiceDocument[type];
    if (!choice) {
      fail(`no explicit duplicate choice for ${type}`);
    }
    const matches = entries.filter(entry => bodyDigest(entry.classObject) === choice.bodySha256);
    if (matches.length !== 1) {
      fail(
        `duplicate choice for ${type} must match exactly one class body; matched ${matches.length}`
      );
    }
    if (matches[0].classIndex !== choice.classIndex) {
      fail(
        `duplicate choice for ${type} digest matches class index ${matches[0].classIndex}, not ${choice.classIndex}`
      );
    }
    selected.push(matches[0]);
  }
  return selected;
}

function buildVertex(classObject) {
  const properties = {};
  const required = [];
  const requiredNames = new Set(classObject.required ?? []);
  for (const name of Object.keys(classObject.properties ?? {}).sort()) {
    const mapped = mapProperty(classObject.type, name, classObject.properties[name], requiredNames);
    if (!mapped) {
      continue;
    }
    properties[name] = mapped.property;
    if (mapped.isRequired) {
      required.push(name);
    }
  }

  const body = {
    schemaVersion: '1.0',
    kind: 'vertex',
    name: classObject.type,
    source: {
      sourceAlias: 'elephant-lexicon',
      collection: 'vertices',
      type: classObject.type,
    },
    properties,
    required,
    identity: { strategy: 'contentHash' },
    indexes: {},
  };
  if (typeof classObject.description === 'string' && classObject.description.length > 0) {
    body.description = clipText(classObject.type, '(description)', classObject.description, 4096);
  }
  if (classObject.is_deprecated === true) {
    body.isDeprecated = true;
  }
  const deprecatedProperties = mapDeprecatedProperties(classObject);
  if (Object.keys(deprecatedProperties).length > 0) {
    body.deprecatedProperties = deprecatedProperties;
  }
  return { definitionId: classObject.type, body };
}

function buildRelationship(relationship) {
  const definitionId = `${relationship.fromType}__${relationship.name}`;
  if (!IDENTIFIER.test(definitionId) || definitionId.length > 128) {
    fail(`relationship id ${definitionId} is not a valid definition id`);
  }
  const targetScope = BASE_LABELS.has(relationship.target)
    ? { scope: 'import', importAlias: 'base', definitionId: relationship.target }
    : { scope: 'local', definitionId: relationship.target };
  const fromScope = BASE_LABELS.has(relationship.fromType)
    ? { scope: 'import', importAlias: 'base', definitionId: relationship.fromType }
    : { scope: 'local', definitionId: relationship.fromType };
  const body = {
    schemaVersion: '1.0',
    kind: 'relationship',
    name: relationship.name,
    source: {
      sourceAlias: 'elephant-lexicon',
      collection: 'edges',
      type: relationship.name,
    },
    properties: {},
    required: [],
    from: fromScope,
    to: targetScope,
    cardinality: 'unspecified',
  };
  if (typeof relationship.spec.comment === 'string' && relationship.spec.comment.length > 0) {
    body.description = clipText(
      relationship.fromType,
      relationship.name,
      relationship.spec.comment,
      4096
    );
  }
  return { definitionId, body };
}

function mapProperty(classType, name, spec, requiredNames) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    recordDrop(classType, name, 'property schema is not an object');
    return null;
  }
  const typeList = Array.isArray(spec.type)
    ? spec.type
    : spec.type === undefined
      ? []
      : [spec.type];
  const nullable = typeList.includes('null');
  const types = typeList.filter(type => type !== 'null');
  if (types.length !== 1) {
    if (types.length === 0 && Array.isArray(spec.enum)) {
      types.push('string');
    } else {
      recordDrop(classType, name, `unsupported type ${JSON.stringify(spec.type)}`);
      return null;
    }
  }

  const sourceType = types[0];
  let property;
  if (sourceType === 'decimal') {
    property = { type: 'number' };
    omissions.convertedProperties.push({
      class: classType,
      property: name,
      from: 'decimal',
      to: 'number',
    });
  } else if (sourceType === 'date' || sourceType === 'dateTime') {
    property = { type: 'string', format: sourceType === 'date' ? 'date' : 'date-time' };
    omissions.convertedProperties.push({
      class: classType,
      property: name,
      from: sourceType,
      to: property.format,
    });
  } else if (
    sourceType === 'string' ||
    sourceType === 'integer' ||
    sourceType === 'number' ||
    sourceType === 'boolean'
  ) {
    property = { type: sourceType };
  } else if (sourceType === 'array') {
    const items = mapArrayItems(classType, name, spec.items);
    if (!items) {
      return null;
    }
    property = { type: 'array', items };
    if (Number.isInteger(spec.minItems)) {
      property.minItems = spec.minItems;
    }
    if (Number.isInteger(spec.maxItems)) {
      property.maxItems = spec.maxItems;
    }
  } else {
    recordDrop(classType, name, `unsupported type ${sourceType}`);
    return null;
  }

  if (property.type === 'string') {
    applyStringFacets(classType, name, spec, property);
  }
  if (property.type === 'integer' || property.type === 'number') {
    if (typeof spec.minimum === 'number') {
      property.minimum = spec.minimum;
    }
    if (typeof spec.maximum === 'number') {
      property.maximum = spec.maximum;
    }
    if (spec.enum !== undefined) {
      recordConversion(
        classType,
        name,
        'enum',
        'omitted because numeric properties cannot declare enum'
      );
    }
  }
  if (property.type === 'boolean' && spec.enum !== undefined) {
    recordConversion(
      classType,
      name,
      'enum',
      'omitted because boolean properties cannot declare enum'
    );
  }
  if (typeof spec.comment === 'string' && spec.comment.length > 0) {
    property.comment = clipText(classType, name, spec.comment, 32768);
  }
  if (typeof spec.description === 'string' && spec.description.length > 0) {
    property.description = clipText(classType, name, spec.description, 4096);
  }
  for (const facet of ['maxLength', 'const', 'restrictions', 'uniqueItems']) {
    if (spec[facet] !== undefined) {
      recordConversion(
        classType,
        name,
        facet,
        'facet is not part of the composition property schema'
      );
    }
  }
  if (spec.format !== undefined && property.format === undefined && property.type === 'string') {
    if (typeof spec.format === 'string' && spec.format.length > 0 && spec.format.length <= 128) {
      property.format = spec.format;
    } else {
      recordConversion(classType, name, 'format', 'format is not a short string');
    }
  } else if (
    spec.format !== undefined &&
    property.format !== undefined &&
    spec.format !== property.format
  ) {
    recordConversion(
      classType,
      name,
      'format',
      `source format ${spec.format} was replaced by ${property.format}`
    );
  }

  const isRequired = requiredNames.has(name) || (spec.required === true && spec.optional !== true);
  if (isRequired) {
    property.required = true;
  }
  if (nullable) {
    recordConversion(classType, name, 'null', 'nullability was removed from the property type');
  }
  return { property, isRequired };
}

function mapArrayItems(classType, name, items) {
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    recordDrop(classType, name, 'array items schema is missing');
    return null;
  }
  const typeList = Array.isArray(items.type) ? items.type : [items.type];
  const types = typeList.filter(type => type !== 'null');
  if (types.length !== 1 || !['string', 'integer', 'number', 'boolean'].includes(types[0])) {
    recordDrop(classType, name, `array items type ${JSON.stringify(items.type)} is not a scalar`);
    return null;
  }
  const mapped = { type: types[0] };
  if (types[0] === 'string') {
    applyStringFacets(classType, name, items, mapped);
  }
  if (typeList.includes('null')) {
    recordConversion(classType, name, 'items.null', 'nullability was removed from array items');
  }
  return mapped;
}

function applyStringFacets(classType, name, spec, property) {
  if (Number.isInteger(spec.minLength) && spec.minLength >= 0) {
    property.minLength = spec.minLength;
  }
  if (typeof spec.pattern === 'string' && spec.pattern.length > 0 && spec.pattern.length <= 512) {
    try {
      RegExp(spec.pattern);
      property.pattern = spec.pattern;
    } catch {
      recordConversion(classType, name, 'pattern', 'pattern is not a valid regular expression');
    }
  } else if (typeof spec.pattern === 'string' && spec.pattern.length > 512) {
    recordConversion(classType, name, 'pattern', 'pattern exceeds 512 characters');
  }
  if (Array.isArray(spec.enum)) {
    const values = spec.enum.filter(value => typeof value === 'string');
    if (values.length !== spec.enum.filter(value => value !== null).length || values.length === 0) {
      recordConversion(classType, name, 'enum', 'enum contains values other than strings and null');
    } else if (new Set(values).size !== values.length) {
      recordConversion(classType, name, 'enum', 'enum contains duplicate strings');
    } else {
      property.enum = values;
    }
  }
}

function mapDeprecatedProperties(classObject) {
  const deprecated = {};
  for (const [name, value] of Object.entries(classObject.deprecated_properties ?? {})) {
    if (!IDENTIFIER.test(name) || name.length > 128) {
      recordDrop(classObject.type, name, 'deprecated property name is not an identifier');
      continue;
    }
    deprecated[name] =
      typeof value === 'object' && value && typeof value.comment === 'string'
        ? { comment: clipText(classObject.type, name, value.comment, 32768) }
        : {};
  }
  return deprecated;
}

function clipText(classType, name, value, maximum) {
  if (value.length <= maximum) {
    return value;
  }
  recordConversion(
    classType,
    name,
    'text',
    `text was clipped from ${value.length} to ${maximum} characters`
  );
  return value.slice(0, maximum);
}

function recordDrop(classType, property, reason) {
  omissions.droppedProperties.push({ class: classType, property, reason });
}

function recordConversion(classType, property, facet, reason) {
  omissions.convertedProperties.push({ class: classType, property, facet, reason });
}

function bodyDigest(classObject) {
  return `sha256:${createHash('sha256').update(canonicalJson(classObject)).digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
