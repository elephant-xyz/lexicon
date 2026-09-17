export const config = { runtime: 'edge' };

const GATEWAYS = [
  (cid: string) => `https://ipfs.filebase.io/ipfs/${cid}`,
  (cid: string) => `https://${cid}.ipfs.w3s.link`,
  (cid: string) => `https://${cid}.ipfs.dweb.link`,
  (cid: string) => `https://ipfs.io/ipfs/${cid}`,
];

const ROUND_TIMEOUT_MS = 7000;
const ROUNDS = 3;
const WARM_TIMEOUT_MS = 55000;

interface EdgeContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

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

// A gateway that times out still pulls the block from IPFS, so the retry usually
// hits a warm cache. Without it the first ever read of a CID fails for everyone.
async function read(cid: string): Promise<string> {
  let lastError: unknown;

  for (let round = 0; round < ROUNDS; round += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ROUND_TIMEOUT_MS);
    try {
      return await readFromAnyGateway(cid, controller.signal);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

// Keep pulling after the client gives up, so the next attempt finds a warm gateway.
function warmInBackground(cid: string, context?: EdgeContext): void {
  if (!context?.waitUntil) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WARM_TIMEOUT_MS);
  context.waitUntil(
    readFromAnyGateway(cid, controller.signal)
      .catch(() => undefined)
      .finally(() => clearTimeout(timeout))
  );
}

export default async function handler(request: Request, context?: EdgeContext): Promise<Response> {
  const cid = new URL(request.url).pathname.split('/').pop() || '';
  if (!/^[A-Za-z0-9]{46,120}$/.test(cid)) {
    return new Response(JSON.stringify({ error: 'Invalid CID.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await read(cid);
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        // A CID is immutable, so the edge may keep it forever.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    warmInBackground(cid, context);
    return new Response(JSON.stringify({ error: `CID ${cid} could not be resolved.` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
