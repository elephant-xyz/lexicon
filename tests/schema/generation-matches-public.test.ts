import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { generateJSONSchemaForClass } from '../../vite-plugins/json-schema-generator';

const PUBLIC_DIR = path.join(process.cwd(), 'public', 'json-schemas');

async function readJson(filePath: string): Promise<any> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function firstDiff(
  expected: any,
  received: any,
  p: string[] = []
): { path: string; expected: any; received: any; note?: string } | null {
  const pathStr = (parts: string[]) => (parts.length ? parts.join('.') : '(root)');

  const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
  if (Array.isArray(expected) && Array.isArray(received)) {
    if (expected.length !== received.length) {
      return {
        path: pathStr(p.concat(['length'])),
        expected: expected.length,
        received: received.length,
        note: 'array length differs',
      };
    }
    for (let i = 0; i < expected.length; i++) {
      const d = firstDiff(expected[i], received[i], p.concat([`[${i}]`]));
      if (d) return d;
    }
    return null;
  }

  if (isObj(expected) && isObj(received)) {
    const expKeys = Object.keys(expected).sort();
    const recKeys = Object.keys(received).sort();
    for (const k of expKeys) {
      if (!(k in received)) {
        return {
          path: pathStr(p),
          expected: expKeys,
          received: recKeys,
          note: `missing key '${k}' in received`,
        };
      }
    }
    for (const k of recKeys) {
      if (!(k in expected)) {
        return {
          path: pathStr(p),
          expected: expKeys,
          received: recKeys,
          note: `unexpected key '${k}' in received`,
        };
      }
    }
    for (const k of expKeys) {
      const d = firstDiff(expected[k], received[k], p.concat([k]));
      if (d) return d;
    }
    return null;
  }

  if (expected !== received) {
    return { path: pathStr(p), expected, received };
  }
  return null;
}

describe('Generated schemas match public/json-schemas', () => {
  it('compares each blockchain class schema to the generated one', async () => {
    const lexiconPath = path.join(process.cwd(), 'src', 'data', 'lexicon.json');
    const content = await fs.readFile(lexiconPath, 'utf-8');
    const lexiconData = JSON.parse(content);

    const blockchainTag = lexiconData.tags.find((t: any) => t.name === 'blockchain');
    expect(blockchainTag).toBeTruthy();

    for (const className of blockchainTag.classes as string[]) {
      const cls = lexiconData.classes.find((c: any) => c.type === className);
      if (!cls || cls.is_deprecated) continue;

      const generated = generateJSONSchemaForClass(cls);
      const publicPath = path.join(PUBLIC_DIR, `${className}.json`);
      const baseline = await readJson(publicPath);

      const diff = firstDiff(baseline, generated);
      if (diff) {
        const pretty = (v: any) =>
          typeof v === 'string' ? v : JSON.stringify(v, null, 2)?.slice(0, 2000);
        throw new Error(
          `Schema mismatch for ${className}\n` +
            `Path: ${diff.path}\n` +
            (diff.note ? `Note: ${diff.note}\n` : '') +
            `Expected: ${pretty(diff.expected)}\n` +
            `Received: ${pretty(diff.received)}\n`
        );
      }
    }
  });
});
