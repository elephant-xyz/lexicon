import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { canonicalize } from 'json-canonicalize';
import { generateJSONSchemaForClass } from '../../vite-plugins/json-schema-generator';

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
});
