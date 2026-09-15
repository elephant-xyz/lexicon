import { beforeEach, describe, expect, it, vi } from 'vitest';

import { displayName, getJsonByCid, getManifest } from '../../src/services/ipfsCatalog';

describe('IPFS catalog service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(sessionStorage.getItem).mockReturnValue(null);
  });

  it('loads and validates the published manifest without using git data', async () => {
    const manifest = {
      County: { ipfsCid: 'bafy-county', type: 'dataGroup' },
      property: { ipfsCid: 'bafy-property', type: 'class' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(manifest),
      })
    );

    await expect(getManifest()).resolves.toEqual(manifest);
    expect(fetch).toHaveBeenCalledWith(
      'https://lexicon.elephant.xyz/json-schemas/schema-manifest.json',
      expect.objectContaining({ cache: 'no-cache' })
    );
  });

  it('queries gateways in parallel and caches the first resolved response', async () => {
    const schema = { title: 'property', type: 'object', properties: {} };
    const slowGateway = new Promise(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === '/api/ipfs/bafy-property') return Promise.resolve({ ok: false, status: 404 });
        if (url === 'https://ipfs.filebase.io/ipfs/bafy-property') return slowGateway;
        return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue(schema) });
      })
    );

    await expect(getJsonByCid('bafy-property')).resolves.toEqual(schema);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      'elephant-lexicon-ipfs:bafy-property',
      JSON.stringify(schema)
    );
  });

  it('reports every gateway failure when a CID cannot be resolved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));

    await expect(getJsonByCid('bafy-missing')).rejects.toThrow(
      /same-origin proxy: 502 · Filebase: 502 · Web3.Storage: 502 · IPFS: 502/
    );
  });

  it('formats manifest keys for display without changing source keys', () => {
    expect(displayName('Property_Management')).toBe('Property Management');
    expect(displayName('HOA_')).toBe('HOA');
  });
});
