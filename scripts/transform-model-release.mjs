#!/usr/bin/env node
/* global console, process */
// Model-release conformance gate for the Transform pipeline catalog.
//
// Usage:
//   node scripts/transform-model-release.mjs              # vendored, digest-checked release
//   node scripts/transform-model-release.mjs --verify-s3  # also re-read the pinned S3 object versions
//   node scripts/transform-model-release.mjs --json       # machine-readable report
//
// --verify-s3 uses the AWS CLI with whatever profile/region the caller's environment selects.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRANSFORM_ROOT = path.join('publish', 'pipelines', 'transform');
export const LOCK_PATH = path.join(TRANSFORM_ROOT, 'model-release.lock.json');
export const ROOT_LEXICON_PATH = path.join('src', 'data', 'lexicon.json');

const CONSTRAINT_KEYWORDS = [
  'const',
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'uniqueItems',
];
const DOCUMENTABLE_KINDS = new Set([
  'NULLABLE_ONLY_IN_TRANSFORM',
  'NON_NULLABLE_ONLY_IN_TRANSFORM',
  'CONSTRAINT_ONLY_IN_TRANSFORM',
  'RELATIONSHIPS_NOT_IN_RELEASE',
  'REQUIRED_COLUMNS_NOT_IN_RELEASE',
  'ALLOF_NOT_IN_RELEASE',
]);

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function typeParts(schema) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  return {
    base: types.filter(type => type !== 'null'),
    nullable: types.includes('null'),
  };
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameEnum(left, right) {
  const key = values => JSON.stringify([...values].map(value => JSON.stringify(value)).sort());
  return key(left) === key(right);
}

function lookupPath(schema, segments) {
  let node = schema;
  for (const segment of segments) {
    if (node === undefined) return undefined;
    node = segment === 'items' ? node.items : node.properties?.[segment];
  }
  return node;
}

function compareProperty(pathSegments, transform, release, differences) {
  const at = pathSegments.join('/');
  const transformType = typeParts(transform);
  const releaseType = typeParts(release);
  if (!sameValue(transformType.base, releaseType.base)) {
    differences.push({
      kind: 'TYPE_MISMATCH',
      path: at,
      transform: transform.type,
      release: release.type,
    });
    return;
  }
  if (transformType.nullable && !releaseType.nullable) {
    differences.push({ kind: 'NULLABLE_ONLY_IN_TRANSFORM', path: at, segments: pathSegments });
  } else if (!transformType.nullable && releaseType.nullable) {
    differences.push({ kind: 'NON_NULLABLE_ONLY_IN_TRANSFORM', path: at, segments: pathSegments });
  }
  if (transform.enum !== undefined || release.enum !== undefined) {
    if (
      transform.enum === undefined ||
      release.enum === undefined ||
      !sameEnum(transform.enum, release.enum)
    ) {
      differences.push({
        kind: 'ENUM_MISMATCH',
        path: at,
        transform: transform.enum ?? null,
        release: release.enum ?? null,
      });
    }
  }
  for (const keyword of CONSTRAINT_KEYWORDS) {
    const inTransform = Object.hasOwn(transform, keyword);
    const inRelease = Object.hasOwn(release, keyword);
    if (inTransform && inRelease && !sameValue(transform[keyword], release[keyword])) {
      differences.push({
        kind: 'CONSTRAINT_MISMATCH',
        path: `${at}/${keyword}`,
        transform: transform[keyword],
        release: release[keyword],
      });
    } else if (!inTransform && inRelease) {
      differences.push({
        kind: 'CONSTRAINT_MISSING_IN_TRANSFORM',
        path: `${at}/${keyword}`,
        release: release[keyword],
      });
    } else if (inTransform && !inRelease) {
      differences.push({
        kind: 'CONSTRAINT_ONLY_IN_TRANSFORM',
        path: `${at}/${keyword}`,
        segments: pathSegments,
        keyword,
        transform: transform[keyword],
      });
    }
  }
  if (transform.items !== undefined || release.items !== undefined) {
    if (transform.items === undefined || release.items === undefined) {
      differences.push({ kind: 'ITEMS_MISMATCH', path: at });
    } else {
      compareProperty([...pathSegments, 'items'], transform.items, release.items, differences);
    }
  }
}

function releaseEdgeTypes(compiled) {
  return new Set(compiled.edges.map(edge => edge.type));
}

function rootRelationshipTypes(rootLexicon, className) {
  const types = new Set();
  for (const group of rootLexicon.data_groups ?? []) {
    for (const relationship of group.relationships ?? []) {
      if (relationship.from === className) types.add(relationship.relationship_type);
    }
  }
  return types;
}

// Classifies a documentable difference as a loss in the release (the root lexicon at the
// release source still declares it) or a Transform-only contract. Returns null when the
// difference would let Transform emit values the canonical model forbids.
function differenceCause(difference, { rootClass, rootLexicon, compiled, className, dataset }) {
  switch (difference.kind) {
    case 'NULLABLE_ONLY_IN_TRANSFORM': {
      const rootProperty = rootClass && lookupPath(rootClass, difference.segments);
      return rootProperty && typeParts(rootProperty).nullable ? 'RELEASE_LOSS' : null;
    }
    case 'NON_NULLABLE_ONLY_IN_TRANSFORM':
      return 'TRANSFORM_CONTRACT';
    case 'CONSTRAINT_ONLY_IN_TRANSFORM': {
      const rootProperty = rootClass && lookupPath(rootClass, difference.segments);
      return rootProperty &&
        Object.hasOwn(rootProperty, difference.keyword) &&
        sameValue(rootProperty[difference.keyword], difference.transform)
        ? 'RELEASE_LOSS'
        : 'TRANSFORM_CONTRACT';
    }
    case 'RELATIONSHIPS_NOT_IN_RELEASE': {
      const declared = rootRelationshipTypes(rootLexicon, className);
      const edges = releaseEdgeTypes(compiled);
      const names = Object.keys(dataset.properties.relationships.properties ?? {});
      const allDeclared = names.length > 0 && names.every(name => declared.has(name));
      const noneInRelease = names.every(
        name => !edges.has(name.replace(`${className}_`, `${className}__`))
      );
      return allDeclared && noneInRelease ? 'RELEASE_LOSS' : null;
    }
    case 'REQUIRED_COLUMNS_NOT_IN_RELEASE':
      return 'TRANSFORM_CONTRACT';
    case 'ALLOF_NOT_IN_RELEASE':
      return rootClass?.allOf?.length ? 'RELEASE_LOSS' : 'TRANSFORM_CONTRACT';
    default:
      return null;
  }
}

export function compareDataset(dataset, vertex, context) {
  const differences = [];
  for (const [name, property] of Object.entries(dataset.properties)) {
    if (name === 'relationships') {
      differences.push({ kind: 'RELATIONSHIPS_NOT_IN_RELEASE', path: name });
      continue;
    }
    const releaseProperty = vertex.properties[name];
    if (releaseProperty === undefined) {
      differences.push({ kind: 'UNKNOWN_PROPERTY', path: name });
      continue;
    }
    compareProperty([name], property, releaseProperty, differences);
  }
  for (const name of Object.keys(vertex.properties)) {
    if (!Object.hasOwn(dataset.properties, name)) {
      differences.push({ kind: 'RELEASE_PROPERTY_MISSING', path: name });
    }
  }
  const releaseRequired = new Set(vertex.required ?? []);
  for (const name of releaseRequired) {
    if (!dataset.required.includes(name)) {
      differences.push({ kind: 'RELEASE_REQUIRED_NOT_REQUIRED', path: name });
    }
  }
  const transformOnlyRequired = dataset.required.filter(name => !releaseRequired.has(name));
  if (transformOnlyRequired.length > 0) {
    differences.push({
      kind: 'REQUIRED_COLUMNS_NOT_IN_RELEASE',
      path: 'required',
      columns: transformOnlyRequired,
    });
  }
  if (dataset.allOf !== undefined && vertex.allOf === undefined) {
    differences.push({ kind: 'ALLOF_NOT_IN_RELEASE', path: 'allOf' });
  }
  return differences.map(difference => {
    const cause = DOCUMENTABLE_KINDS.has(difference.kind)
      ? differenceCause(difference, { ...context, dataset })
      : null;
    const visible = { ...difference };
    delete visible.segments;
    delete visible.keyword;
    return { ...visible, cause, documentable: cause !== null };
  });
}

function deviationKey(item) {
  return `${item.kind}:${item.path}`;
}

function verifyReleasePins(lock, repoRoot, errors) {
  const release = lock.modelRelease;
  const vendored = path.join(repoRoot, release.vendoredPath);
  const releaseBytes = readFileSync(path.join(vendored, 'release.json'));
  if (sha256Hex(releaseBytes) !== release.manifest.sha256) {
    errors.push('Vendored release.json digest does not match the lock');
  }
  const manifest = JSON.parse(releaseBytes.toString('utf8'));
  if (manifest.releaseId !== release.releaseId) errors.push('release.json releaseId mismatch');
  if (manifest.releaseDigest !== release.releaseDigest) {
    errors.push('release.json releaseDigest mismatch');
  }
  if (manifest.composition?.compiledProfileVersion !== release.artifact.profile) {
    errors.push('release.json compiled profile mismatch');
  }
  if (manifest.composition?.resolvedBase?.releaseId !== release.base.releaseId) {
    errors.push('release.json shared base release mismatch');
  }
  const artifactBytes = readFileSync(path.join(vendored, release.artifact.path));
  const artifactDigest = `sha256:${sha256Hex(artifactBytes)}`;
  if (artifactDigest !== release.artifact.digest) {
    errors.push('Vendored compiled artifact digest does not match the lock');
  }
  const declared = (manifest.artifacts ?? []).find(item => item.key === release.artifact.key);
  if (declared?.digest !== release.artifact.digest) {
    errors.push('release.json does not declare the pinned compiled artifact digest');
  }
  if (manifest.composition?.compiledDigest !== release.artifact.digest) {
    errors.push('release.json composition.compiledDigest differs from the pinned artifact');
  }
  return JSON.parse(artifactBytes.toString('utf8'));
}

export function evaluate(repoRoot = process.cwd()) {
  const errors = [];
  const lock = readJson(path.join(repoRoot, LOCK_PATH));
  const transformRoot = path.join(repoRoot, TRANSFORM_ROOT);
  const catalog = readJson(path.join(transformRoot, 'catalog.json'));
  const rootLexicon = readJson(path.join(repoRoot, ROOT_LEXICON_PATH));
  const compiled = verifyReleasePins(lock, repoRoot, errors);
  const vertices = new Map(compiled.vertices.map(vertex => [vertex.type, vertex]));
  const rootClasses = new Map(rootLexicon.classes.map(item => [item.type, item]));

  const languages = catalog.entries.filter(entry => entry.kind === 'language');
  const bound = new Map(
    lock.bindings.map(binding => [`${binding.name}@${binding.version}`, binding])
  );
  const superseded = new Set(lock.superseded.map(item => `${item.name}@${item.version}`));
  const outOfScope = new Map(lock.outOfScope.map(item => [item.name, item]));

  for (const entry of languages) {
    const identity = `${entry.name}@${entry.version}`;
    const placements =
      Number(bound.has(identity)) +
      Number(superseded.has(identity)) +
      Number(outOfScope.has(entry.name));
    if (placements !== 1) {
      errors.push(`${identity} must be exactly one of bound, superseded, or out of scope`);
    }
    if (superseded.has(identity) && entry.current && entry.status === 'ENABLED') {
      errors.push(`${identity} is current and cannot be marked superseded`);
    }
  }
  for (const identity of [...bound.keys(), ...superseded]) {
    if (!languages.some(entry => `${entry.name}@${entry.version}` === identity)) {
      errors.push(`${identity} is pinned in the lock but absent from the catalog`);
    }
  }

  const outOfScopeReport = [];
  for (const item of lock.outOfScope) {
    const collisions = new Set();
    for (const entry of languages.filter(candidate => candidate.name === item.name)) {
      const language = readJson(path.join(transformRoot, entry.path));
      for (const dataset of language.datasets) {
        for (const candidate of [dataset.type, dataset.type.replace(/s$/u, '')]) {
          if (vertices.has(candidate)) collisions.add(candidate);
        }
      }
    }
    const documented = [...(item.releaseNameCollisions ?? [])].sort();
    if (!sameValue([...collisions].sort(), documented)) {
      errors.push(
        `${item.name} release name collisions ${JSON.stringify([...collisions])} are not documented`
      );
    }
    if (!item.reason?.trim()) errors.push(`${item.name} out-of-scope entry needs a reason`);
    outOfScopeReport.push({ name: item.name, collisions: [...collisions] });
  }

  const bindingReports = [];
  for (const binding of lock.bindings) {
    const identity = `${binding.name}@${binding.version}`;
    const entry = languages.find(
      candidate => candidate.name === binding.name && candidate.version === binding.version
    );
    if (entry === undefined) continue;
    const artifactPath = path.join(transformRoot, entry.path);
    const digest = sha256Hex(readFileSync(artifactPath));
    if (digest !== entry.sha256 || digest !== binding.sha256) {
      errors.push(`${identity} digest differs between the file, catalog, and lock`);
    }
    const language = readJson(artifactPath);
    if (binding.pin === 'embedded') {
      const description = language.description ?? '';
      for (const needle of [
        lock.modelRelease.releaseId,
        lock.modelRelease.releaseDigest,
        lock.modelRelease.artifact.digest,
      ]) {
        if (!description.includes(needle)) {
          errors.push(`${identity} embedded pin does not name ${needle}`);
        }
      }
    } else if (binding.pin !== 'sidecar') {
      errors.push(`${identity} pin must be embedded or sidecar`);
    }
    const boundDatasets = new Set(binding.datasets.map(item => item.dataset));
    const unmodelled = new Map(
      (binding.unmodelledDatasets ?? []).map(item => [item.dataset, item])
    );
    for (const [name, item] of unmodelled) {
      if (!language.datasets.some(dataset => dataset.type === name)) {
        errors.push(`${identity}:${name} is listed as unmodelled but is not a dataset`);
      }
      if (boundDatasets.has(name)) {
        errors.push(`${identity}:${name} is both bound and unmodelled`);
      }
      if (!item.reason?.trim()) {
        errors.push(`${identity}:${name} unmodelled dataset needs a reason`);
      }
      for (const candidate of [name, name.replace(/s$/u, '')]) {
        if (vertices.has(candidate)) {
          errors.push(
            `${identity}:${name} collides with release class ${candidate} and must be bound`
          );
        }
      }
    }
    for (const dataset of language.datasets) {
      if (!boundDatasets.has(dataset.type) && !unmodelled.has(dataset.type)) {
        errors.push(`${identity}:${dataset.type} has no Model class binding`);
      }
    }
    const datasetReports = [];
    for (const item of binding.datasets) {
      const dataset = language.datasets.find(candidate => candidate.type === item.dataset);
      const vertex = vertices.get(item.modelClass);
      if (dataset === undefined || vertex === undefined) {
        errors.push(
          `${identity}:${item.dataset} binds missing dataset or class ${item.modelClass}`
        );
        continue;
      }
      const differences = compareDataset(dataset, vertex, {
        rootClass: rootClasses.get(item.modelClass),
        rootLexicon,
        compiled,
        className: item.modelClass,
      });
      const documented = new Map(
        item.deviations.map(deviation => [deviationKey(deviation), deviation])
      );
      const computed = new Map(
        differences.map(difference => [deviationKey(difference), difference])
      );
      const violations = differences.filter(difference => !difference.documentable);
      const undocumented = differences.filter(
        difference => difference.documentable && !documented.has(deviationKey(difference))
      );
      const stale = item.deviations.filter(deviation => !computed.has(deviationKey(deviation)));
      const wrongCause = item.deviations.filter(deviation => {
        const difference = computed.get(deviationKey(deviation));
        return difference !== undefined && difference.cause !== deviation.cause;
      });
      const unexplained = item.deviations.filter(deviation => !deviation.reason?.trim());
      for (const [label, list] of [
        ['violates the release', violations],
        ['has undocumented deviations', undocumented],
        ['documents deviations that no longer exist', stale],
        ['documents the wrong cause for', wrongCause],
        ['documents deviations without a reason', unexplained],
      ]) {
        if (list.length > 0) {
          errors.push(`${identity}:${item.dataset} ${label}: ${list.map(deviationKey).join(', ')}`);
        }
      }
      datasetReports.push({
        dataset: item.dataset,
        modelClass: item.modelClass,
        differences,
        violations: violations.length,
        undocumented: undocumented.length,
        stale: stale.length,
      });
    }
    bindingReports.push({ language: identity, pin: binding.pin, datasets: datasetReports });
  }

  for (const entry of catalog.entries.filter(
    candidate => candidate.kind === 'mapping' && candidate.current && candidate.status === 'ENABLED'
  )) {
    const manifest = readJson(path.join(transformRoot, entry.path));
    const target = `${manifest.to.name}@${manifest.to.version}`;
    const targetIsModelled = lock.bindings.some(binding => binding.name === manifest.to.name);
    if (targetIsModelled && !bound.has(target)) {
      errors.push(`${entry.id}@${entry.version} targets unpinned language ${target}`);
    }
  }

  return {
    modelRelease: lock.modelRelease,
    bindings: bindingReports,
    outOfScope: outOfScopeReport,
    errors,
  };
}

export function verifyS3(lock) {
  const release = lock.modelRelease;
  const directory = mkdtempSync(path.join(tmpdir(), 'model-release-'));
  try {
    const objects = [
      { label: 'release.json', ...release.manifest, expected: release.manifest.sha256 },
      {
        label: release.artifact.path,
        ...release.artifact,
        expected: release.artifact.digest.slice(7),
      },
    ];
    return objects.map(object => {
      const target = path.join(directory, path.basename(object.key));
      execFileSync(
        'aws',
        [
          's3api',
          'get-object',
          '--bucket',
          release.bucket,
          '--key',
          object.key,
          '--version-id',
          object.versionId,
          target,
        ],
        { stdio: ['ignore', 'ignore', 'inherit'] }
      );
      const actual = sha256Hex(readFileSync(target));
      return {
        object: object.label,
        versionId: object.versionId,
        matched: actual === object.expected,
      };
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function printReport(report, s3) {
  const release = report.modelRelease;
  console.log(`Model release ${release.releaseId} (${release.releaseDigest})`);
  console.log(`Artifact ${release.artifact.path} ${release.artifact.digest}`);
  for (const binding of report.bindings) {
    console.log(`\n${binding.language} [pin: ${binding.pin}]`);
    for (const dataset of binding.datasets) {
      console.log(`  ${dataset.dataset} -> ${dataset.modelClass}`);
      for (const difference of dataset.differences) {
        const status = difference.documentable ? difference.cause : 'VIOLATION';
        console.log(`    ${status.padEnd(18)} ${difference.kind} ${difference.path}`);
      }
    }
  }
  for (const item of report.outOfScope) {
    console.log(
      `\nout of scope: ${item.name}${item.collisions.length ? ` (name collision: ${item.collisions.join(', ')})` : ''}`
    );
  }
  if (s3) {
    for (const item of s3)
      console.log(`s3 ${item.object}@${item.versionId}: ${item.matched ? 'MATCH' : 'MISMATCH'}`);
  }
  console.log(report.errors.length === 0 ? '\nPASS' : `\nFAIL\n- ${report.errors.join('\n- ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = evaluate();
  const s3 = process.argv.includes('--verify-s3')
    ? verifyS3(readJson(path.join(process.cwd(), LOCK_PATH)))
    : undefined;
  if (s3?.some(item => !item.matched)) report.errors.push('Pinned S3 release objects changed');
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...report, s3 }, null, 2));
  } else {
    printReport(report, s3);
  }
  process.exitCode = report.errors.length === 0 ? 0 : 1;
}
