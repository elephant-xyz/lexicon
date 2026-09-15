export type PublishedSchemaType = 'class' | 'relationship' | 'dataGroup';

export interface ManifestEntry {
  ipfsCid: string;
  type: PublishedSchemaType;
}

export type SchemaManifest = Record<string, ManifestEntry>;

export interface JsonSchema {
  $schema?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  minItems?: number;
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  cid?: string;
  [key: string]: unknown;
}

const MANIFEST_PATH = '/json-schemas/schema-manifest.json';
const MANIFEST_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? `https://lexicon.elephant.xyz${MANIFEST_PATH}`
  : MANIFEST_PATH;
const GATEWAYS: Array<{ name: string; url: (cid: string) => string }> = [
  { name: 'same-origin proxy', url: cid => `/api/ipfs/${cid}` },
  { name: 'Filebase', url: cid => `https://ipfs.filebase.io/ipfs/${cid}` },
  { name: 'Web3.Storage', url: cid => `https://${cid}.ipfs.w3s.link` },
  { name: 'IPFS', url: cid => `https://ipfs.io/ipfs/${cid}` },
];
const CACHE_PREFIX = 'elephant-lexicon-ipfs:';
// A cold Filebase read can take 30s even when a warm read takes under a second.
const GATEWAY_TIMEOUT_MS = 25000;

async function fetchWithTimeout(url: string, options: Parameters<typeof fetch>[1]) {
  const controller = new window.AbortController();
  const timeout = window.setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function readCache<T>(key: string): T | null {
  try {
    const value = sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // A disabled or full session store must not prevent reading published data.
  }
}

function isManifest(value: unknown): value is SchemaManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  return Object.values(value).every(
    entry =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as ManifestEntry).ipfsCid === 'string' &&
      (entry as ManifestEntry).ipfsCid.length > 0 &&
      ['class', 'relationship', 'dataGroup'].includes((entry as ManifestEntry).type)
  );
}

export async function getManifest(): Promise<SchemaManifest> {
  const response = await fetch(MANIFEST_URL, {
    headers: { Accept: 'application/json' },
    cache: 'no-cache',
  });
  if (!response.ok) {
    throw new Error(`Published manifest returned ${response.status}.`);
  }

  const manifest: unknown = await response.json();
  if (!isManifest(manifest)) {
    throw new Error('Published manifest has an invalid shape.');
  }
  return manifest;
}

export async function getJsonByCid(cid: string): Promise<JsonSchema> {
  const cached = readCache<JsonSchema>(cid);
  if (cached) return cached;

  // Query every gateway at once; a gateway that is slow for one CID is often fast for another.
  const attempts = GATEWAYS.map(async gateway => {
    try {
      const response = await fetchWithTimeout(gateway.url(cid), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`${response.status}`);
      }
      return (await response.json()) as JsonSchema;
    } catch (error) {
      throw new Error(
        `${gateway.name}: ${error instanceof Error ? error.message : 'request failed'}`
      );
    }
  });

  try {
    const schema = await Promise.any(attempts);
    writeCache(cid, schema);
    return schema;
  } catch (error) {
    const failures =
      error instanceof AggregateError ? error.errors.map(reason => `${reason.message}`) : [];
    throw new Error(`CID ${cid} could not be resolved. ${failures.join(' · ')}`);
  }
}

export function getManifestEntry(
  manifest: SchemaManifest,
  name: string
): [string, ManifestEntry] | undefined {
  const normalized = name.toLowerCase();
  return Object.entries(manifest).find(([key]) => key.toLowerCase() === normalized);
}

export function displayName(name: string): string {
  return name.replace(/_+$/g, '').replaceAll('_', ' ');
}
