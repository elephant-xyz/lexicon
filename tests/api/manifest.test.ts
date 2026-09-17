import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import handler from '../../api/manifest';

const manifest = {
  property: {
    ipfsCid: 'bafkreidmp2ndoc2efglfjezsr3jhzuk25ihunuagwqcpt6dtf2sf36cjau',
    type: 'class',
  },
};

describe('published Filebase catalog reader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.LEXICON_MANIFEST_IPNS;
    delete process.env.LEXICON_MANIFEST_URL;
  });

  afterEach(() => {
    delete process.env.LEXICON_MANIFEST_IPNS;
    delete process.env.LEXICON_MANIFEST_URL;
  });

  it('asks for the Filebase pointer when none is configured', async () => {
    const response = await handler();
    expect(response.status).toBe(503);
  });

  it('reads the live Filebase IPNS catalog', async () => {
    process.env.LEXICON_MANIFEST_IPNS = 'k51-example';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(manifest) })
    );

    const response = await handler();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Lexicon-Manifest-Source')).toBe('filebase');
    expect(fetch).toHaveBeenCalledWith(
      'https://ipfs.filebase.io/ipns/k51-example',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('reads a direct Filebase catalog URL', async () => {
    process.env.LEXICON_MANIFEST_URL = 'https://ipfs.filebase.io/ipfs/bafy-manifest';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(manifest) })
    );

    const response = await handler();

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      'https://ipfs.filebase.io/ipfs/bafy-manifest',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
});
