import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LOCK_PATH,
  TRANSFORM_ROOT,
  compareDataset,
  evaluate,
} from '../../scripts/transform-model-release.mjs';

type Dataset = {
  type: string;
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  allOf?: unknown[];
};
type Vertex = { type: string; properties: Record<string, Record<string, unknown>> };
type Language = { name: string; version: string; description?: string; datasets: Dataset[] };
type Difference = { kind: string; path: string; cause: string | null; documentable: boolean };

const transformRoot = path.resolve(process.cwd(), TRANSFORM_ROOT);
const lock = readJson<{
  modelRelease: {
    releaseId: string;
    releaseDigest: string;
    vendoredPath: string;
    artifact: { path: string; digest: string };
  };
}>(path.resolve(process.cwd(), LOCK_PATH));
const compiled = readJson<{ vertices: Vertex[]; edges: Array<{ type: string }> }>(
  path.resolve(process.cwd(), lock.modelRelease.vendoredPath, lock.modelRelease.artifact.path)
);
const rootLexicon = readJson<{ classes: Array<{ type: string }> }>(
  path.resolve(process.cwd(), 'src', 'data', 'lexicon.json')
);
const resultMappingRoot = path.join(
  transformRoot,
  'mappings',
  'connect-http-acquisition-bundle-to-sale-availability-result'
);

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function language(name: string, version: string): Language {
  return readJson<Language>(path.join(transformRoot, 'languages', name, version, `${name}.json`));
}

function vertex(type: string): Vertex {
  const match = compiled.vertices.find(candidate => candidate.type === type);
  expect(match, type).toBeDefined();
  return match!;
}

function compare(dataset: Dataset, className: string): Difference[] {
  return compareDataset(dataset, vertex(className), {
    rootClass: rootLexicon.classes.find(item => item.type === className),
    rootLexicon,
    compiled,
    className,
  }) as Difference[];
}

function observations(): Dataset {
  const result = language('sale-availability-result', '1.1.0');
  return JSON.parse(
    JSON.stringify(result.datasets.find(item => item.type === 'listing_observations'))
  ) as Dataset;
}

function files(root: string): string[] {
  return readdirSync(root).flatMap(name => {
    const full = path.join(root, name);
    return statSync(full).isDirectory() ? files(full).map(child => path.join(name, child)) : [name];
  });
}

describe('Transform languages derive from the pinned Model release', () => {
  it('passes the conformance gate with every deviation documented', () => {
    const report = evaluate(process.cwd());
    expect(report.errors).toEqual([]);
    expect(report.bindings.map((binding: { language: string }) => binding.language)).toEqual([
      'sale-availability-result@1.1.0',
      'sale-availability-result@1.0.0',
      'sale-availability-evidence@1.0.0',
      'sale-availability-assessment@1.1.0',
    ]);
  });

  it('pins the vendored release artifact by its declared digest', () => {
    const vendored = path.resolve(process.cwd(), lock.modelRelease.vendoredPath);
    const release = readJson<{
      releaseId: string;
      releaseDigest: string;
      composition: { compiledDigest: string };
    }>(path.join(vendored, 'release.json'));
    const digest = createHash('sha256')
      .update(readFileSync(path.join(vendored, lock.modelRelease.artifact.path)))
      .digest('hex');
    expect(release.releaseId).toBe('rel-0b272a683e5755ec');
    expect(release.releaseDigest).toBe(lock.modelRelease.releaseDigest);
    expect(release.composition.compiledDigest).toBe(`sha256:${digest}`);
    expect(lock.modelRelease.artifact.digest).toBe(`sha256:${digest}`);
  });

  it('embeds the release pin in the current result language', () => {
    const description = language('sale-availability-result', '1.1.0').description ?? '';
    expect(description).toContain(lock.modelRelease.releaseId);
    expect(description).toContain(lock.modelRelease.releaseDigest);
    expect(description).toContain(lock.modelRelease.artifact.digest);
  });

  it('changes only the version and pin between result languages 1.0.0 and 1.1.0', () => {
    const previous = language('sale-availability-result', '1.0.0');
    const pinned = language('sale-availability-result', '1.1.0');
    expect(pinned.datasets).toEqual(previous.datasets);
    expect({ ...pinned, version: '1.0.0', description: previous.description }).toEqual(previous);
  });

  it('keeps result mapping 1.0.3 byte-identical to 1.0.2 except its version and target pin', () => {
    const previousRoot = path.join(resultMappingRoot, '1.0.2');
    const pinnedRoot = path.join(resultMappingRoot, '1.0.3');
    expect(files(pinnedRoot).sort()).toEqual(files(previousRoot).sort());
    for (const file of files(previousRoot).filter(name => name !== 'manifest.json')) {
      expect(readFileSync(path.join(pinnedRoot, file)), file).toEqual(
        readFileSync(path.join(previousRoot, file))
      );
    }
    const previous = readJson<Record<string, unknown>>(path.join(previousRoot, 'manifest.json'));
    const pinned = readJson<Record<string, unknown>>(path.join(pinnedRoot, 'manifest.json'));
    expect(pinned).toMatchObject({
      version: '1.0.3',
      to: { name: 'sale-availability-result', version: '1.1.0' },
    });
    expect({
      ...pinned,
      version: previous.version,
      to: previous.to,
    }).toEqual(previous);
  });

  it('fails on a property the release does not define', () => {
    const dataset = observations();
    dataset.properties.listing_agent_name = { type: 'string' };
    expect(compare(dataset, 'listing_observation')).toContainEqual(
      expect.objectContaining({ kind: 'UNKNOWN_PROPERTY', documentable: false })
    );
  });

  it('fails on enum, type, and weakened-constraint drift', () => {
    const dataset = observations();
    dataset.properties.market_status = {
      type: 'string',
      enum: ['ACTIVE', 'SOLD'],
    };
    dataset.properties.retrieved_at = { type: 'integer' };
    delete dataset.properties.observation_identifier.pattern;
    const kinds = compare(dataset, 'listing_observation')
      .filter(difference => !difference.documentable)
      .map(difference => `${difference.kind}:${difference.path}`);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'ENUM_MISMATCH:market_status',
        'TYPE_MISMATCH:retrieved_at',
        'CONSTRAINT_MISSING_IN_TRANSFORM:observation_identifier/pattern',
      ])
    );
  });

  it('rejects nullability the canonical root lexicon does not declare', () => {
    const dataset = observations();
    dataset.properties.retrieved_at = { type: ['string', 'null'], format: 'date-time' };
    expect(compare(dataset, 'listing_observation')).toContainEqual(
      expect.objectContaining({
        kind: 'NULLABLE_ONLY_IN_TRANSFORM',
        path: 'retrieved_at',
        documentable: false,
      })
    );
  });

  it('classifies release-lost nullability and relationships as documented release losses', () => {
    const differences = compare(observations(), 'listing_observation');
    expect(differences.filter(difference => !difference.documentable)).toEqual([]);
    expect(differences).toContainEqual(
      expect.objectContaining({
        kind: 'NULLABLE_ONLY_IN_TRANSFORM',
        path: 'asking_price_amount_minor',
        cause: 'RELEASE_LOSS',
      })
    );
    expect(differences).toContainEqual(
      expect.objectContaining({
        kind: 'RELATIONSHIPS_NOT_IN_RELEASE',
        path: 'relationships',
        cause: 'RELEASE_LOSS',
      })
    );
  });
});
