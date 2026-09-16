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

function catalogUrl(): string | null {
  const ipns = process.env.LEXICON_MANIFEST_IPNS?.trim();
  if (ipns) return `https://ipfs.filebase.io/ipns/${ipns}`;
  return process.env.LEXICON_MANIFEST_URL?.trim() || null;
}

export default async function handler(): Promise<Response> {
  const url = catalogUrl();
  if (!url) {
    return new Response(
      JSON.stringify({
        error:
          'Set LEXICON_MANIFEST_IPNS or LEXICON_MANIFEST_URL to the Filebase catalog published outside this repo.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`${response.status}`);
    const value: unknown = await response.json();
    if (!isManifest(value)) throw new Error('invalid manifest');
    return new Response(JSON.stringify(value), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Lexicon-Manifest-Source': 'filebase',
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'Published Filebase catalog could not be read.' }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }
}
