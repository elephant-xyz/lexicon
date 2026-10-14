import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const transformRoot = path.resolve(process.cwd(), 'publish', 'pipelines', 'transform');
const mappingId = 'sale-availability-persist-input-to-persist-graphson';
const mappingRoot = path.join(transformRoot, 'mappings', mappingId, '1.0.0');

type Entry = {
  kind: 'language' | 'mapping';
  name?: string;
  id?: string;
  version: string;
  current: boolean;
  status: string;
  path: string;
  sha256: string;
};
type Dataset = {
  type: string;
  properties: Record<string, { type: unknown; enum?: string[]; format?: string }>;
  required: string[];
};
type Manifest = {
  from: { name: string; version: string };
  to: { name: string; version: string };
  inputs: Array<{ table: string; view: string; required: boolean; format: string }>;
  output: { delivery: { mode: string; dataset: string; cardinality: string; maxBytes: number } };
  outputs: Array<{
    dataset: string;
    queryPath: string;
    querySha256: string;
    invariantEvidence: Array<{
      querySha256s: string[];
      tests: Array<{ path: string; sha256: string }>;
    }>;
  }>;
};
type Golden = {
  addressCases: Array<{
    id: string;
    expected: { status: string; address?: Record<string, string> };
  }>;
  graphCases: Array<{
    id: string;
    inputs: { request_address: Array<{ address: { canonical: string } }> };
    expected: { address_status: string; graph: string | null };
  }>;
  failureCases: Array<{ id: string; error: string }>;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

const catalog = readJson<{ entries: Entry[] }>(path.join(transformRoot, 'catalog.json'));
const manifest = readJson<Manifest>(path.join(mappingRoot, 'manifest.json'));
const golden = readJson<Golden>(
  path.join(mappingRoot, 'tests', 'persist-graphson-golden-cases.json')
);
const target = readJson<{ datasets: Dataset[] }>(
  path.join(transformRoot, 'languages', 'persist-graphson', '1.0.0', 'persist-graphson.json')
);

describe('sale-availability Persist GraphSON mapping', () => {
  it('registers the mapping and both new languages as current, digest-pinned entries', () => {
    for (const [kind, key] of [
      ['language', 'sale-availability-persist-input'],
      ['language', 'persist-graphson'],
      ['mapping', mappingId],
    ] as const) {
      const entry = catalog.entries.find(
        item => item.kind === kind && (item.name ?? item.id) === key
      );
      expect(entry, key).toMatchObject({ version: '1.0.0', current: true, status: 'ENABLED' });
      expect(sha256(path.join(transformRoot, entry!.path)), key).toBe(entry!.sha256);
    }
  });

  it('pins the query and golden evidence by digest', () => {
    const [output] = manifest.outputs;
    expect(sha256(path.join(mappingRoot, output!.queryPath))).toBe(output!.querySha256);
    for (const evidence of output!.invariantEvidence) {
      expect(evidence.querySha256s).toEqual([output!.querySha256]);
      for (const test of evidence.tests) {
        expect(sha256(path.join(mappingRoot, test.path))).toBe(test.sha256);
      }
    }
  });

  it('reads the result tables and the one-row request_address and delivers one inline persist_graph row', () => {
    expect(manifest.from).toEqual({ name: 'sale-availability-persist-input', version: '1.0.0' });
    expect(manifest.to).toEqual({ name: 'persist-graphson', version: '1.0.0' });
    expect(
      manifest.inputs.map(input => [input.table, input.view, input.format, input.required])
    ).toEqual([
      ['listing_observations', 'source_listing_observations', 'parquet', true],
      ['sale_availability_assessments', 'source_sale_availability_assessments', 'parquet', true],
      ['request_address', 'source_request_address', 'jsonl', true],
    ]);
    expect(manifest.output.delivery).toMatchObject({
      mode: 'inline',
      dataset: 'persist_graph',
      cardinality: 'exactly-one',
      maxBytes: 65536,
    });
  });

  it('delivers exactly address_status (NORMALIZED | UNPARSEABLE) and the canonical graph @value text', () => {
    const [dataset] = target.datasets;
    expect(dataset!.type).toBe('persist_graph');
    expect(Object.keys(dataset!.properties)).toEqual(['address_status', 'graph']);
    expect(dataset!.properties.address_status!.enum).toEqual(['NORMALIZED', 'UNPARSEABLE']);
    expect(dataset!.properties.graph).toMatchObject({
      type: ['string', 'null'],
      format: 'canonical-json',
    });
  });

  it('covers every System address vector in original and cache-normalized upper case', () => {
    const ids = golden.addressCases.map(item => item.id);
    expect(ids).toHaveLength(30);
    for (const id of ids.filter(item => item.endsWith(':original'))) {
      expect(ids).toContain(id.replace(/:original$/u, ':upper'));
    }
    for (const vector of [
      'text-bare-unit-after-suffix',
      'text-bare-unit-after-suffix-multiword',
      'text-alphanumeric-street-name',
    ]) {
      expect(ids).toContain(`${vector}:upper`);
    }
    expect(
      golden.addressCases
        .filter(item => item.expected.status === 'UNPARSEABLE')
        .map(item => item.id)
    ).toEqual([
      'text-production-canary:original',
      'text-production-canary:upper',
      'text-no-house-number-synthetic:original',
      'text-no-house-number-synthetic:upper',
    ]);
  });

  it('never emits a graph for an unparseable address and emits the bare @value otherwise', () => {
    for (const item of golden.graphCases) {
      if (item.expected.address_status === 'UNPARSEABLE') {
        expect(item.expected.graph, item.id).toBeNull();
        continue;
      }
      const graph = JSON.parse(item.expected.graph!) as {
        vertices: Array<{ '@value': { label: string } }>;
        edges: Array<{ '@value': { label: string } }>;
      };
      expect(Object.keys(graph).sort(), item.id).toEqual(['edges', 'vertices']);
      expect(
        graph.vertices.filter(vertex => vertex['@value'].label === 'address'),
        item.id
      ).toHaveLength(1);
      expect(
        graph.edges.some(
          edge => edge['@value'].label === 'sale_availability_assessment_has_address'
        ),
        item.id
      ).toBe(true);
    }
    expect(golden.failureCases.map(item => item.id)).toEqual([
      'property-reference-set',
      'two-request-address-rows',
      'dangling-observation-reference',
    ]);
  });
});
