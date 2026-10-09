import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { canonicalize } from 'json-canonicalize';
import {
  generateJSONSchemaForClass,
  generateJSONSchemaForDataGroup,
  generateJSONSchemaForRelationship,
} from '../../vite-plugins/json-schema-generator';
import type { LexiconData } from '../../src/types/lexicon';

const STATIC_DIR = path.join(process.cwd(), 'tests', 'static-json-schemas');

async function readCanonical(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath, 'utf-8');
  try {
    return canonicalize(JSON.parse(raw));
  } catch {
    return raw.trim();
  }
}

describe('Generated schemas match tests/static-json-schemas', () => {
  it('compares each blockchain class schema to the static baseline', async () => {
    const lexiconPath = path.join(process.cwd(), 'src', 'data', 'lexicon.json');
    const content = await fs.readFile(lexiconPath, 'utf-8');
    const lexiconData = JSON.parse(content);

    const blockchainTag = lexiconData.tags.find((t: any) => t.name === 'blockchain');
    expect(blockchainTag).toBeTruthy();

    for (const className of blockchainTag.classes as string[]) {
      const cls = lexiconData.classes.find((c: any) => c.type === className);
      if (!cls || cls.is_deprecated) continue;

      const staticPath = path.join(STATIC_DIR, `${className}.json`);
      try {
        // Ensure baseline file exists
        const publicCanonical = await readCanonical(staticPath);

        // Generate and compare
        const generated = generateJSONSchemaForClass(cls);
        const generatedCanonical = canonicalize(generated);
        expect(generatedCanonical).toBe(publicCanonical);
      } catch (err: any) {
        throw new Error(
          `Missing or unreadable baseline for ${className}: ${staticPath}\n${err?.message || err}`
        );
      }
    }
  });

  it('compares Sale Availability relationship and data-group schemas to static baselines', async () => {
    const lexiconPath = path.join(process.cwd(), 'src', 'data', 'lexicon.json');
    const content = await fs.readFile(lexiconPath, 'utf-8');
    const lexiconData = JSON.parse(content) as LexiconData;
    const dataGroup = lexiconData.data_groups.find(group => group.label === 'Sale Availability');
    expect(dataGroup).toBeDefined();

    const classCids = Object.fromEntries(
      lexiconData.classes.map(candidate => [candidate.type, ''])
    );
    const relationshipCids: Record<string, { cid: string; relationshipType: string }> = {};

    for (const relationship of dataGroup!.relationships) {
      const key = `${relationship.from}_to_${relationship.to}`;
      const generated = generateJSONSchemaForRelationship(relationship, classCids);
      expect(canonicalize(generated)).toBe(
        await readCanonical(path.join(STATIC_DIR, `${key}.json`))
      );
      relationshipCids[key] = {
        cid: '',
        relationshipType: relationship.relationship_type,
      };
    }

    const generatedGroup = generateJSONSchemaForDataGroup(
      dataGroup!,
      relationshipCids,
      lexiconData.data_groups.map(group => group.label)
    );
    expect(canonicalize(generatedGroup)).toBe(
      await readCanonical(path.join(STATIC_DIR, 'Sale_Availability.json'))
    );
  });

  it('keeps every recently added class baseline registered in the static manifest', async () => {
    const manifest = JSON.parse(
      await fs.readFile(path.join(STATIC_DIR, 'schema-manifest.json'), 'utf-8')
    ) as Record<string, { ipfsCid: string; type: string }>;

    for (const className of [
      'license',
      'business_location',
      'tax_jurisdiction',
      'listing_observation',
      'sale_availability_assessment',
    ]) {
      expect(manifest[className], className).toEqual({ ipfsCid: '', type: 'class' });
      await expect(fs.access(path.join(STATIC_DIR, `${className}.json`))).resolves.toBeUndefined();
    }
  });
});
