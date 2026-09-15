import { beforeEach, describe, expect, it, vi } from 'vitest';

import handler from '../../api/ipfs/[cid]';

const CID = 'bafkreia6tjziby3upxmidymud5iusd32urrztslgrudkwysc7ydmxoekuq';
const GATEWAY_COUNT = 4;

describe('same-origin IPFS reader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a path that is not a CID', async () => {
    const response = await handler(new Request('https://lexicon.elephant.xyz/api/ipfs/../secret'));

    expect(response.status).toBe(400);
  });

  it('returns the first gateway answer as immutable JSON', async () => {
    const schema = { title: 'County', type: 'object' };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: string) =>
          url.startsWith('https://ipfs.filebase.io')
            ? new Promise(() => {})
            : Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify(schema)) })
        )
    );

    const response = await handler(new Request(`https://lexicon.elephant.xyz/api/ipfs/${CID}`));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    await expect(response.json()).resolves.toEqual(schema);
  });

  it('retries once, because a failed read warms the gateway cache', async () => {
    const schema = { title: 'County', type: 'object' };
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        call += 1;
        return call <= GATEWAY_COUNT
          ? Promise.resolve({ ok: false, status: 504 })
          : Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify(schema)) });
      })
    );

    const response = await handler(new Request(`https://lexicon.elephant.xyz/api/ipfs/${CID}`));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(GATEWAY_COUNT * 2);
  });

  it('reports a gateway outage as a bad gateway without caching it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    const response = await handler(new Request(`https://lexicon.elephant.xyz/api/ipfs/${CID}`));

    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
