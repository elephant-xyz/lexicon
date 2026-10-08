import { createHash } from 'node:crypto';
import path from 'node:path';

import { PublicationError } from './errors.js';

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function canonicalBytes(value: unknown): Uint8Array {
  return Buffer.from(canonicalize(value), 'utf8');
}

function canonicalize(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError('Value is not JSON serializable');
    }
    return serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
    return `{${entries.join(',')}}`;
  }
  throw new TypeError('Value is not JSON serializable');
}

export function parseJson(bytes: Uint8Array, description: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    throw new PublicationError('INVALID_RELEASE', `${description} is not valid JSON`, false);
  }
}

export function resolveRelativeKey(parentKey: string, relativePath: string): string {
  const directory = path.posix.dirname(parentKey);
  const resolved = path.posix.normalize(path.posix.join(directory, relativePath));
  if (
    resolved === directory ||
    !resolved.startsWith(`${directory}/`) ||
    relativePath.startsWith('/') ||
    relativePath.includes('\\')
  ) {
    throw new PublicationError(
      'INVALID_RELEASE',
      `Artifact path '${relativePath}' escapes '${directory}'`
    );
  }
  return resolved;
}

export function parseS3Uri(value: string): { bucket: string; key: string } {
  const match = /^s3:\/\/([^/]+)\/(.+)$/u.exec(value);
  if (match === null) {
    throw new PublicationError('INVALID_RELEASE', `Invalid S3 URI '${value}'`);
  }
  return { bucket: match[1] as string, key: match[2] as string };
}

export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}
