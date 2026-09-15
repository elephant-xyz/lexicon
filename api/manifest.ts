import bootstrapManifest from '../src/data/published-schema-manifest.json';

export const config = { runtime: 'edge' };

type ManifestEntry = {
  ipfsCid: string;
  type: 'class' | 'relationship' | 'dataGroup';
};

function isManifest(value: unknown): value is Record<string, ManifestEntry> {
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

async function readManifest(url: string): Promise<Record<string, ManifestEntry>> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status}`);
  const value: unknown = await response.json();
  if (!isManifest(value)) throw new Error('invalid manifest');
  return value;
}

export default async function handler(_request: Request): Promise<Response> {
  const ipnsName = process.env.LEXICON_MANIFEST_IPNS?.trim();

  if (ipnsName) {
    try {
      const manifest = await readManifest(`https://ipfs.filebase.io/ipns/${ipnsName}`);
      return new Response(JSON.stringify(manifest), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          'X-Lexicon-Manifest-Source': 'ipns',
        },
      });
    } catch {
      // Fall through to the bundled bootstrap snapshot if IPNS is unavailable.
    }
  }

  if (!isManifest(bootstrapManifest)) {
    return new Response(JSON.stringify({ error: 'Bootstrap manifest is invalid.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  return new Response(JSON.stringify(bootstrapManifest), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      'X-Lexicon-Manifest-Source': 'bootstrap',
    },
  });
}
