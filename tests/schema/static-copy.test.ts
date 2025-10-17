import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { canonicalize } from 'json-canonicalize';

const SRC_DIR = path.join(process.cwd(), 'public', 'json-schemas');
const DEST_DIR = path.join(process.cwd(), 'tests', 'static-json-schemas');

async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir);
  return entries.filter(name => name.endsWith('.json'));
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function readCanonicalJson(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath, 'utf-8');
  try {
    const json = JSON.parse(raw);
    return canonicalize(json);
  } catch {
    // Some relationship example files may be one-line JSON already; still canonicalize if parsable
    return raw.trim();
  }
}

describe('Static JSON Schema copies', () => {
  it('copies everything as-is from public/json-schemas when UPDATE_SCHEMA_SNAPSHOTS=1', async () => {
    const shouldUpdate = process.env.UPDATE_SCHEMA_SNAPSHOTS === '1';
    const srcFiles = await listJsonFiles(SRC_DIR);

    if (shouldUpdate) {
      await ensureDir(DEST_DIR);
      for (const name of srcFiles) {
        const src = path.join(SRC_DIR, name);
        const dest = path.join(DEST_DIR, name);
        const content = await readCanonicalJson(src);
        await fs.writeFile(dest, content + '\n');
      }
    }

    // Verify destination contains the same set of files and identical contents (canonicalized)
    await ensureDir(DEST_DIR);
    const destFiles = await listJsonFiles(DEST_DIR);

    // Same filenames
    expect(new Set(destFiles)).toEqual(new Set(srcFiles));

    // Same contents
    for (const name of srcFiles) {
      const srcCanonical = await readCanonicalJson(path.join(SRC_DIR, name));
      const destCanonical = await readCanonicalJson(path.join(DEST_DIR, name));
      expect(destCanonical).toBe(srcCanonical);
    }
  });
});
