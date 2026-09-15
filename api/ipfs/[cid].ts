export const config = { runtime: 'edge' };

const GATEWAYS = [
  (cid: string) => `https://ipfs.filebase.io/ipfs/${cid}`,
  (cid: string) => `https://${cid}.ipfs.w3s.link`,
  (cid: string) => `https://${cid}.ipfs.dweb.link`,
  (cid: string) => `https://ipfs.io/ipfs/${cid}`,
];

// Gateways disagree wildly on cold-cache latency, so ask all of them at once.
async function readFromAnyGateway(cid: string, signal: AbortSignal): Promise<string> {
  return Promise.any(
    GATEWAYS.map(async gateway => {
      const response = await fetch(gateway(cid), {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) {
        throw new Error(`${response.status}`);
      }
      return response.text();
    })
  );
}

export default async function handler(request: Request): Promise<Response> {
  const cid = new URL(request.url).pathname.split('/').pop() || '';
  if (!/^[A-Za-z0-9]{46,120}$/.test(cid)) {
    return new Response(JSON.stringify({ error: 'Invalid CID.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const body = await readFromAnyGateway(cid, controller.signal);
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        // A CID is immutable, so the edge may keep it forever.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: `CID ${cid} could not be resolved.` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } finally {
    clearTimeout(timeout);
  }
}
