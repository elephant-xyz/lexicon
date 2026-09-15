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

  it('falls through gateways and caches a resolved CID', async () => {
    const schema = { title: 'property', type: 'object', properties: {} };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 504 })
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(schema) })
    );

    await expect(getJsonByCid('bafy-property')).resolves.toEqual(schema);
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/ipfs/bafy-property', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://ipfs.filebase.io/ipfs/bafy-property',
      expect.any(Object)
    );
    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      'elephant-lexicon-ipfs:bafy-property',
      JSON.stringify(schema)
    );
  });

  it('formats manifest keys for display without changing source keys', () => {
    expect(displayName('Property_Management')).toBe('Property Management');
    expect(displayName('HOA_')).toBe('HOA');
  });
});
