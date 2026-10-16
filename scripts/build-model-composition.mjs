/* global console, process, structuredClone */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lexiconPath = path.join(root, 'src/data/lexicon.json');
const choicesPath = path.join(root, 'src/data/model/duplicate-choices.json');
const runtimePath = path.join(root, 'src/data/model/persist-runtime.json');
const compositionPath = path.join(root, 'src/data/model/elephant-lexicon.composition.json');
const omissionsPath = path.join(root, 'src/data/model/omissions.json');

export const SOURCE_DIGEST =
  'sha256:a17a5dbdbfde9017cdfa0ade550d6234369d0efb34bfe0388f80f1b58da8dedd';
export const SOURCE_REVISION = '04943fcf4b7a8fe811c0b03d8aa41d9620c7fc02';
export const CONTRACT_VERSION = '1.1';
const BASE_LABELS = new Set(['person', 'company', 'address']);
const MAX_DEFINITIONS = 2000;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CONSTRAINT_KEYWORDS = new Set([
  'if',
  'then',
  'else',
  'not',
  'allOf',
  'anyOf',
  'oneOf',
  'properties',
  'required',
  'type',
  'const',
  'enum',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'format',
]);

export class CompositionBuildError extends Error {}

/**
 * Builds the Contract 1.1 Elephant extension from the viewer lexicon.
 *
 * Class relationships keep their `<from>__<name>` labels; a relationship with several targets
 * becomes one edge per target labelled `<from>__<name>__<target>`. Data-group relationships keep
 * their `relationship_type` as the label, which is the key Transform languages emit.
 */
export function buildModelComposition({ lexicon, choices, runtime = {} }) {
  const omissions = {
    source: {
      repository: 'https://github.com/elephant-xyz/lexicon',
      revision: SOURCE_REVISION,
      path: 'src/data/lexicon.json',
      digest: SOURCE_DIGEST,
    },
    decisions: [
      {
        kind: 'contractVersion',
        contractVersion: CONTRACT_VERSION,
        reason:
          'Contract 1.1 carries nullability, const, maxLength, uniqueItems, allOf, embeddings and up to 2000 definitions, so the full Elephant graph fits in one extension.',
      },
      {
        kind: 'topVertex',
        definitionId: 'property',
        reason:
          'The contract requires one local top vertex. Reachability from that vertex is not enforced by the current compiler.',
      },
      {
        kind: 'identity',
        strategy: 'contentHash',
        reason:
          'The viewer lexicon does not declare Model identity properties, so every local vertex uses content-hash identity.',
      },
      {
        kind: 'baseLabelsNotRedeclared',
        labels: [...BASE_LABELS].sort(),
        reason:
          'These labels belong to model-shared-base-v1.5.0. An extension cannot redeclare them, so Elephant fields on these classes stay only in lexicon.json.',
      },
      {
        kind: 'classRelationshipLabels',
        rule: '<from>__<name> for one target; <from>__<name>__<target> for each of several targets',
        reason:
          'Persist edges have exactly one from and one to label, so a relationship with several targets becomes one edge per target.',
      },
      {
        kind: 'dataGroupRelationshipLabels',
        rule: 'relationship_type, with the from and to declared by the data group',
        reason:
          'Transform languages emit data-group relationship keys exactly as relationship_type, so the edge label matches them.',
      },
      {
        kind: 'dataGroupEndpointConflict',
        rule: 'when one relationship_type declares several endpoint pairs, keep the single pair named <from>_has_<to>; otherwise fail',
        reason:
          'A Persist edge label has one endpoint pair. The other pairs are source defects and are listed in omittedRelationships.',
      },
    ],
    duplicateChoices: choices,
    omittedDocumentKeys: ['tags', 'common_patterns'],
    typeMappings: [],
    normalizations: [],
    droppedConstraints: [],
    droppedProperties: [],
    omittedRelationships: [],
  };

  const selected = selectClasses(lexicon.classes, choices);
  const vertices = [];
  for (const entry of selected) {
    if (BASE_LABELS.has(entry.classObject.type)) continue;
    vertices.push(buildVertex(entry.classObject, omissions));
  }
  vertices.sort((left, right) => left.definitionId.localeCompare(right.definitionId));
  if (!vertices.some(vertex => vertex.definitionId === 'property')) {
    fail('local top vertex property was not produced');
  }
  applyRuntime(vertices, runtime);

  const knownTypes = new Set([...BASE_LABELS, ...vertices.map(vertex => vertex.definitionId)]);
  const relationships = [
    ...classRelationships(selected, knownTypes, omissions),
    ...dataGroupRelationships(lexicon.data_groups ?? [], knownTypes, omissions),
  ];
  const labels = new Map(vertices.map(vertex => [vertex.definitionId, 'vertex']));
  const emitted = [];
  for (const relationship of relationships) {
    if (labels.has(relationship.definitionId)) {
      omissions.omittedRelationships.push({
        from: relationship.from,
        name: relationship.definitionId,
        targets: [relationship.to],
        reason: `label collides with the ${labels.get(relationship.definitionId)} ${relationship.definitionId}`,
      });
      continue;
    }
    labels.set(relationship.definitionId, 'relationship');
    emitted.push(relationship);
  }
  emitted.sort((left, right) => left.definitionId.localeCompare(right.definitionId));

  const definitions = [...vertices, ...emitted.map(buildRelationship)];
  if (definitions.length > MAX_DEFINITIONS) {
    fail(`definition count ${definitions.length} exceeds ${MAX_DEFINITIONS}`);
  }
  const definitionIds = definitions.map(definition => definition.definitionId);

  const composition = {
    manifest: {
      contractVersion: CONTRACT_VERSION,
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
      topVertex: { scope: 'local', definitionId: 'property' },
    },
    definitions,
  };

  omissions.counts = {
    vertices: vertices.length,
    classRelationships: emitted.filter(relationship => relationship.origin === 'class').length,
    dataGroupRelationships: emitted.filter(relationship => relationship.origin === 'dataGroup')
      .length,
    relationshipsOmitted: omissions.omittedRelationships.length,
    definitions: definitions.length,
    typeMappings: omissions.typeMappings.length,
    normalizations: omissions.normalizations.length,
    droppedConstraints: omissions.droppedConstraints.length,
    droppedProperties: omissions.droppedProperties.length,
  };
  return { composition, omissions };
}

function classRelationships(selected, knownTypes, omissions) {
  const result = [];
  for (const entry of selected) {
    const fromType = entry.classObject.type;
    const relationships = entry.classObject.relationships ?? {};
    for (const name of Object.keys(relationships).sort()) {
      const spec = relationships[name];
      const declared = Array.isArray(spec.targets) ? spec.targets : [];
      const targets = [...new Set(declared)];
      if (targets.length !== declared.length) {
        omissions.normalizations.push({
          class: fromType,
          property: name,
          kind: 'relationshipTargetDuplicatesRemoved',
          removed: declared.length - targets.length,
        });
      }
      const unknown = targets.filter(target => !knownTypes.has(target));
      if (targets.length === 0 || unknown.length > 0) {
        omissions.omittedRelationships.push({
          from: fromType,
          name,
          targets,
          reason:
            targets.length === 0
              ? 'relationship declares no target'
              : `targets ${JSON.stringify(unknown)} are not lexicon classes`,
        });
        continue;
      }
      for (const target of [...targets].sort()) {
        result.push({
          origin: 'class',
          definitionId:
            targets.length === 1 ? `${fromType}__${name}` : `${fromType}__${name}__${target}`,
          name,
          from: fromType,
          to: target,
          comment: spec.comment,
        });
      }
    }
  }
  return result;
}

function dataGroupRelationships(dataGroups, knownTypes, omissions) {
  const byType = new Map();
  for (const group of dataGroups) {
    const deprecated = new Set(group.deprecated_relationships ?? []);
    for (const relationship of group.relationships ?? []) {
      const entry = byType.get(relationship.relationship_type) ?? {
        pairs: new Map(),
        deprecatedIn: new Set(),
      };
      const pairKey = `${relationship.from}\u0000${relationship.to}`;
      const pair = entry.pairs.get(pairKey) ?? {
        from: relationship.from,
        to: relationship.to,
        groups: new Set(),
      };
      pair.groups.add(group.label);
      entry.pairs.set(pairKey, pair);
      if (deprecated.has(relationship.relationship_type)) entry.deprecatedIn.add(group.label);
      byType.set(relationship.relationship_type, entry);
    }
  }

  const result = [];
  for (const type of [...byType.keys()].sort()) {
    const entry = byType.get(type);
    let pairs = [...entry.pairs.values()];
    if (pairs.length > 1) {
      const conventional = pairs.filter(pair => type === `${pair.from}_has_${pair.to}`);
      if (conventional.length !== 1) {
        fail(`data-group relationship ${type} has conflicting endpoints`);
      }
      for (const pair of pairs.filter(candidate => candidate !== conventional[0])) {
        omissions.omittedRelationships.push({
          from: pair.from,
          name: type,
          targets: [pair.to],
          groups: [...pair.groups].sort(),
          reason: `relationship_type ${type} is also declared as ${conventional[0].from} -> ${conventional[0].to}; a label has one endpoint pair`,
        });
      }
      pairs = conventional;
    }
    const [pair] = pairs;
    if (!knownTypes.has(pair.from) || !knownTypes.has(pair.to)) {
      omissions.omittedRelationships.push({
        from: pair.from,
        name: type,
        targets: [pair.to],
        reason: 'data-group endpoint is not a lexicon class',
      });
      continue;
    }
    const groups = [...pair.groups].sort();
    result.push({
      origin: 'dataGroup',
      definitionId: type,
      name: type,
      from: pair.from,
      to: pair.to,
      comment: `Elephant data-group relationship (${groups.join(', ')}).`,
      deprecatedIn: [...entry.deprecatedIn].sort(),
    });
  }
  return result;
}

function selectClasses(classes, choiceDocument) {
  for (const type of ['product_api', 'product_configuration', 'ticket']) {
    const choice = choiceDocument[type];
    if (!choice?.bodySha256 || !Number.isInteger(choice.classIndex)) {
      fail(`duplicate-choices.json must name one body for ${type}`);
    }
  }
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

function buildVertex(classObject, omissions) {
  const properties = {};
  const required = [];
  const requiredNames = new Set(classObject.required ?? []);
  for (const name of Object.keys(classObject.properties ?? {}).sort()) {
    const mapped = mapProperty(
      classObject.type,
      name,
      classObject.properties[name],
      requiredNames,
      omissions
    );
    if (!mapped) continue;
    properties[name] = mapped.property;
    if (mapped.isRequired) required.push(name);
  }

  const body = {
    schemaVersion: CONTRACT_VERSION,
    kind: 'vertex',
    name: classObject.type,
    source: { sourceAlias: 'elephant-lexicon', collection: 'vertices', type: classObject.type },
    properties,
    required,
    identity: { strategy: 'contentHash' },
    indexes: {},
  };
  if (typeof classObject.description === 'string' && classObject.description.length > 0) {
    body.description = clipText(
      classObject.type,
      '(description)',
      classObject.description,
      4096,
      omissions
    );
  }
  if (classObject.is_deprecated === true) body.isDeprecated = true;
  const deprecatedProperties = mapDeprecatedProperties(classObject, omissions);
  if (Object.keys(deprecatedProperties).length > 0) {
    body.deprecatedProperties = deprecatedProperties;
  }
  if (Array.isArray(classObject.allOf) && classObject.allOf.length > 0) {
    const unsupported = classObject.allOf.flatMap(constraint => unsupportedKeywords(constraint));
    const unknown = classObject.allOf.flatMap(constraint =>
      unknownProperties(constraint, properties)
    );
    if (unsupported.length > 0 || unknown.length > 0) {
      omissions.droppedConstraints.push({
        class: classObject.type,
        kind: 'allOf',
        reason:
          unsupported.length > 0
            ? `allOf uses keywords outside the contract subset: ${[...new Set(unsupported)].join(', ')}`
            : `allOf references properties that were not mapped: ${[...new Set(unknown)].join(', ')}`,
      });
    } else {
      body.allOf = structuredClone(classObject.allOf);
    }
  }
  return { definitionId: classObject.type, body };
}

function buildRelationship(relationship) {
  if (!IDENTIFIER.test(relationship.definitionId) || relationship.definitionId.length > 128) {
    fail(`relationship id ${relationship.definitionId} is not a valid definition id`);
  }
  const endpoint = type =>
    BASE_LABELS.has(type)
      ? { scope: 'import', importAlias: 'base', definitionId: type }
      : { scope: 'local', definitionId: type };
  const body = {
    schemaVersion: CONTRACT_VERSION,
    kind: 'relationship',
    name: relationship.name,
    source: {
      sourceAlias: 'elephant-lexicon',
      collection: 'edges',
      type: relationship.name,
    },
    properties: {},
    required: [],
    from: endpoint(relationship.from),
    to: endpoint(relationship.to),
    cardinality: 'unspecified',
  };
  if (typeof relationship.comment === 'string' && relationship.comment.length > 0) {
    body.description = relationship.comment.slice(0, 4096);
  }
  if (relationship.deprecatedIn?.length > 0) {
    body.isDeprecated = true;
    body.deprecatedReason = `Deprecated in data groups: ${relationship.deprecatedIn.join(', ')}.`;
  }
  return { definitionId: relationship.definitionId, body };
}

function applyRuntime(vertices, runtime) {
  const byId = new Map(vertices.map(vertex => [vertex.definitionId, vertex]));
  for (const [section, field] of [
    ['embeddings', 'embeddings'],
    ['derivedIndexes', 'indexes'],
  ]) {
    for (const [type, declarations] of Object.entries(runtime[section] ?? {}).sort()) {
      const vertex = byId.get(type);
      if (vertex === undefined)
        fail(`persist-runtime.json ${section} names unknown vertex ${type}`);
      vertex.body[field] = { ...(vertex.body[field] ?? {}), ...structuredClone(declarations) };
    }
  }
}

function mapProperty(classType, name, spec, requiredNames, omissions) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    recordDrop(omissions, classType, name, 'property schema is not an object');
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
      recordDrop(omissions, classType, name, `unsupported type ${JSON.stringify(spec.type)}`);
      return null;
    }
  }

  const sourceType = types[0];
  let property;
  if (sourceType === 'decimal') {
    property = { type: 'number' };
    omissions.typeMappings.push({
      class: classType,
      property: name,
      from: 'decimal',
      to: 'number',
    });
  } else if (sourceType === 'date' || sourceType === 'dateTime') {
    property = { type: 'string', format: sourceType === 'date' ? 'date' : 'date-time' };
    omissions.typeMappings.push({
      class: classType,
      property: name,
      from: sourceType,
      to: `string/${property.format}`,
    });
  } else if (['string', 'integer', 'number', 'boolean'].includes(sourceType)) {
    property = { type: sourceType };
  } else if (sourceType === 'array') {
    const items = mapArrayItems(classType, name, spec.items, omissions);
    if (!items) return null;
    property = { type: 'array', items };
    if (Number.isInteger(spec.minItems)) property.minItems = spec.minItems;
    if (Number.isInteger(spec.maxItems)) property.maxItems = spec.maxItems;
    if (typeof spec.uniqueItems === 'boolean') property.uniqueItems = spec.uniqueItems;
  } else {
    recordDrop(omissions, classType, name, `unsupported type ${sourceType}`);
    return null;
  }

  applyScalarFacets(classType, name, spec, property, omissions);
  if (typeof spec.comment === 'string' && spec.comment.length > 0) {
    property.comment = clipText(classType, name, spec.comment, 32768, omissions);
  }
  if (typeof spec.description === 'string' && spec.description.length > 0) {
    property.description = clipText(classType, name, spec.description, 4096, omissions);
  }
  if (spec.restrictions !== undefined) {
    omissions.droppedConstraints.push({
      class: classType,
      property: name,
      kind: 'restrictions',
      value: spec.restrictions,
      reason: 'restrictions has no composition property equivalent',
    });
  }
  if (spec.format !== undefined && property.format === undefined && property.type === 'string') {
    if (typeof spec.format === 'string' && spec.format.length > 0 && spec.format.length <= 128) {
      property.format = spec.format;
    } else {
      recordConstraintDrop(omissions, classType, name, 'format', 'format is not a short string');
    }
  } else if (
    spec.format !== undefined &&
    property.format !== undefined &&
    spec.format !== property.format
  ) {
    recordConstraintDrop(
      omissions,
      classType,
      name,
      'format',
      `source format ${spec.format} was replaced by ${property.format}`
    );
  }

  const isRequired = requiredNames.has(name) || (spec.required === true && spec.optional !== true);
  if (isRequired) property.required = true;
  if (nullable) property.nullable = true;
  return { property, isRequired };
}

function mapArrayItems(classType, name, items, omissions) {
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    recordDrop(omissions, classType, name, 'array items schema is missing');
    return null;
  }
  const typeList = Array.isArray(items.type) ? items.type : [items.type];
  const types = typeList.filter(type => type !== 'null');
  if (types.length !== 1 || !['string', 'integer', 'number', 'boolean'].includes(types[0])) {
    recordDrop(
      omissions,
      classType,
      name,
      `array items type ${JSON.stringify(items.type)} is not a scalar`
    );
    return null;
  }
  const mapped = { type: types[0] };
  applyScalarFacets(classType, `${name}.items`, items, mapped, omissions);
  if (typeList.includes('null')) mapped.nullable = true;
  return mapped;
}

function applyScalarFacets(classType, name, spec, property, omissions) {
  if (property.type === 'string') {
    if (Number.isInteger(spec.minLength) && spec.minLength >= 0)
      property.minLength = spec.minLength;
    if (Number.isInteger(spec.maxLength) && spec.maxLength >= 0)
      property.maxLength = spec.maxLength;
    if (typeof spec.pattern === 'string' && spec.pattern.length > 0 && spec.pattern.length <= 512) {
      try {
        RegExp(spec.pattern);
        property.pattern = spec.pattern;
      } catch {
        recordConstraintDrop(
          omissions,
          classType,
          name,
          'pattern',
          'pattern is not a valid regular expression'
        );
      }
    } else if (typeof spec.pattern === 'string' && spec.pattern.length > 512) {
      recordConstraintDrop(omissions, classType, name, 'pattern', 'pattern exceeds 512 characters');
    }
    if (Array.isArray(spec.enum)) {
      const values = spec.enum.filter(value => typeof value === 'string');
      if (
        values.length !== spec.enum.filter(value => value !== null).length ||
        values.length === 0
      ) {
        recordConstraintDrop(
          omissions,
          classType,
          name,
          'enum',
          'enum contains values other than strings and null'
        );
      } else {
        const unique = [...new Set(values)];
        if (unique.length !== values.length) {
          omissions.normalizations.push({
            class: classType,
            property: name,
            kind: 'enumDuplicatesRemoved',
            removed: values.length - unique.length,
          });
        }
        property.enum = unique;
      }
    }
  } else if (spec.enum !== undefined) {
    recordConstraintDrop(
      omissions,
      classType,
      name,
      'enum',
      `${property.type} properties cannot declare enum`
    );
  }
  if (property.type === 'integer' || property.type === 'number') {
    if (typeof spec.minimum === 'number') property.minimum = spec.minimum;
    if (typeof spec.maximum === 'number') property.maximum = spec.maximum;
  }
  if (spec.const !== undefined) {
    const expected = property.type === 'integer' ? 'number' : property.type;
    if (spec.const !== null && typeof spec.const === expected) {
      property.const = spec.const;
    } else {
      recordConstraintDrop(omissions, classType, name, 'const', `const is not a ${property.type}`);
    }
  }
}

function unsupportedKeywords(constraint) {
  if (!constraint || typeof constraint !== 'object' || Array.isArray(constraint))
    return ['(non-object)'];
  const found = Object.keys(constraint).filter(key => !CONSTRAINT_KEYWORDS.has(key));
  for (const key of ['if', 'then', 'else', 'not']) {
    if (constraint[key] !== undefined) found.push(...unsupportedKeywords(constraint[key]));
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    for (const nested of constraint[key] ?? []) found.push(...unsupportedKeywords(nested));
  }
  for (const nested of Object.values(constraint.properties ?? {})) {
    found.push(...unsupportedKeywords(nested));
  }
  return found;
}

function unknownProperties(constraint, properties) {
  const found = [
    ...(constraint.required ?? []),
    ...Object.keys(constraint.properties ?? {}),
  ].filter(name => !Object.hasOwn(properties, name));
  for (const key of ['if', 'then', 'else', 'not']) {
    if (constraint[key] !== undefined)
      found.push(...unknownProperties(constraint[key], properties));
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    for (const nested of constraint[key] ?? [])
      found.push(...unknownProperties(nested, properties));
  }
  return found;
}

function mapDeprecatedProperties(classObject, omissions) {
  const deprecated = {};
  for (const [name, value] of Object.entries(classObject.deprecated_properties ?? {})) {
    if (!IDENTIFIER.test(name) || name.length > 128) {
      recordDrop(
        omissions,
        classObject.type,
        name,
        'deprecated property name is not an identifier'
      );
      continue;
    }
    deprecated[name] =
      typeof value === 'object' && value && typeof value.comment === 'string'
        ? { comment: clipText(classObject.type, name, value.comment, 32768, omissions) }
        : {};
  }
  return deprecated;
}

function clipText(classType, name, value, maximum, omissions) {
  if (value.length <= maximum) return value;
  omissions.normalizations.push({
    class: classType,
    property: name,
    kind: 'textClipped',
    from: value.length,
    to: maximum,
  });
  return value.slice(0, maximum);
}

function recordDrop(omissions, classType, property, reason) {
  omissions.droppedProperties.push({ class: classType, property, reason });
}

function recordConstraintDrop(omissions, classType, property, kind, reason) {
  omissions.droppedConstraints.push({ class: classType, property, kind, reason });
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

function fail(message) {
  throw new CompositionBuildError(message);
}

export function readSources() {
  const lexiconBytes = readFileSync(lexiconPath);
  const digest = `sha256:${createHash('sha256').update(lexiconBytes).digest('hex')}`;
  if (digest !== SOURCE_DIGEST) {
    throw new CompositionBuildError(
      `src/data/lexicon.json digest is ${digest}, expected ${SOURCE_DIGEST}`
    );
  }
  return {
    lexicon: JSON.parse(lexiconBytes.toString('utf8')),
    choices: JSON.parse(readFileSync(choicesPath, 'utf8')),
    runtime: JSON.parse(readFileSync(runtimePath, 'utf8')),
  };
}

export const OUTPUT_PATHS = { compositionPath, omissionsPath };

export function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { composition, omissions } = buildModelComposition(readSources());
    writeFileSync(compositionPath, serialize(composition));
    writeFileSync(omissionsPath, serialize(omissions));
    console.log(
      `wrote ${omissions.counts.definitions} definitions (${omissions.counts.vertices} vertices, ${omissions.counts.classRelationships} class and ${omissions.counts.dataGroupRelationships} data-group relationships)`
    );
  } catch (error) {
    console.error(error instanceof CompositionBuildError ? error.message : error);
    process.exit(1);
  }
}
