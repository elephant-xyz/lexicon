import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  publishSchemaCatalog,
  type PublishedManifest,
} from '../../scripts/publish-schemas-filebase';
import type { LexiconData } from '../../src/types/lexicon';

function referencedTestCids(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(referencedTestCids);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'cid' && typeof child === 'string' && child.startsWith('test-cid:')
      ? [child]
      : referencedTestCids(child)
  );
}

describe('Filebase schema publisher', () => {
  it('publishes dependencies before schemas that reference their CIDs', async () => {
    const lexicon = JSON.parse(await readFile('src/data/lexicon.json', 'utf8')) as LexiconData;
    const issued = new Set<string>();
    const objects = new Map<string, string>();

    const manifest = await publishSchemaCatalog(lexicon, async (key, body) => {
      for (const cid of referencedTestCids(JSON.parse(body))) {
        expect(issued.has(cid), `${key} referenced ${cid} before it was published`).toBe(true);
      }
      const cid = `test-cid:${key}`;
      issued.add(cid);
      objects.set(key, body);
      return cid;
    });

    expect(Object.keys(manifest)).toHaveLength(159);
    expect(Object.values(manifest).every(value => value.ipfsCid.length > 0)).toBe(true);
    expect(manifest.property.type).toBe('class');
    expect(manifest.property_to_address.type).toBe('relationship');
    expect(manifest.County.type).toBe('dataGroup');
    expect([...objects.keys()].some(key => key.endsWith('/County.json'))).toBe(true);
  });

  it('records integrity metadata for every published object', async () => {
    const lexicon = JSON.parse(await readFile('src/data/lexicon.json', 'utf8')) as LexiconData;

    const manifest: PublishedManifest = await publishSchemaCatalog(
      lexicon,
      async key => `test-cid:${key}`
    );

    for (const value of Object.values(manifest)) {
      expect(value.objectKey).toMatch(/^schemas\/[a-f0-9]{64}\/.+\.json$/);
      expect(value.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(value.bytes).toBeGreaterThan(0);
    }
  });
});
