import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import handler from '../../api/manifest';

const manifest = {
  property: {
    ipfsCid: 'bafkreidmp2ndoc2efglfjezsr3jhzuk25ihunuagwqcpt6dtf2sf36cjau',
    type: 'class',
  },
};

describe('published manifest reader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.LEXICON_MANIFEST_IPNS;
  });

  afterEach(() => {
    delete process.env.LEXICON_MANIFEST_IPNS;
  });

  it('reads the checked-in bootstrap when IPNS is not configured', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const response = await handler(new Request('https://lexicon.elephant.xyz/api/manifest'));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Lexicon-Manifest-Source')).toBe('bootstrap');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prefers the Filebase IPNS manifest', async () => {
    process.env.LEXICON_MANIFEST_IPNS = 'k51-example';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(manifest) })
    );

    const response = await handler(new Request('https://lexicon.elephant.xyz/api/manifest'));

    expect(response.headers.get('X-Lexicon-Manifest-Source')).toBe('ipns');
    expect(fetch).toHaveBeenCalledWith(
      'https://ipfs.filebase.io/ipns/k51-example',
      expect.any(Object)
    );
  });

  it('falls back to the bootstrap if IPNS is temporarily unavailable', async () => {
    process.env.LEXICON_MANIFEST_IPNS = 'k51-example';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 504 }));

    const response = await handler(new Request('https://lexicon.elephant.xyz/api/manifest'));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Lexicon-Manifest-Source')).toBe('bootstrap');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
