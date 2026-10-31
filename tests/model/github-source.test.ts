import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReleaseManifest } from '../../model/src/contracts.js';
import { GitHubSourceRepository } from '../../model/src/github-source.js';

const repository = 'https://github.com/elephant-xyz/lexicon';
const revision = 'a'.repeat(40);
const digest = 'b'.repeat(64);

const manifest: ReleaseManifest = {
  contractVersion: 1,
  releaseId: 'fixture-release-1.0.0',
  stage: 'review',
  target: { accountId: '708502238428', region: 'us-east-2' },
  catalogIdentity: 'transform',
  validationProfile: 'pipeline-language-mapping@2',
  source: { repository, revision, pullRequest: 181 },
  allowedArtifactKeys: ['config/transform/catalog.json', 'config/transform/mapping.json'],
  catalog: {
    sourcePath: 'publish/pipelines/transform/catalog.json',
    destinationKey: 'config/transform/catalog.json',
    sha256: digest,
    size: 1,
    contentType: 'application/json',
  },
  artifacts: [
    {
      sourcePath: 'publish/pipelines/transform/mapping.json',
      destinationKey: 'config/transform/mapping.json',
      sha256: digest,
      size: 1,
      contentType: 'application/json',
    },
  ],
  expectedPriorPointer: {
    parameterName: '/lexicon/transform-catalog-uri',
    version: 1,
    value: 's3://model-review/config/transform/catalog.previous.json',
    catalogSha256: digest,
  },
  requestedPointer: {
    parameterName: '/lexicon/transform-catalog-uri',
    value: 's3://model-review/config/transform/catalog.json',
  },
};

function mockGitHubPull(input: {
  state: 'open' | 'closed';
  mergedAt: string | null;
  mergeableState: string;
}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: string) => {
      const url = String(request);
      const body = url.endsWith('/pulls/181')
        ? {
            state: input.state,
            draft: false,
            merged_at: input.mergedAt,
            mergeable_state: input.mergeableState,
            head: { sha: revision },
          }
        : url.includes('/reviews')
          ? [
              {
                user: { login: 'reviewer' },
                state: 'APPROVED',
                submitted_at: '2026-10-09T13:03:21Z',
              },
            ]
          : url.includes('/check-runs')
            ? {
                total_count: 1,
                check_runs: [{ status: 'completed', conclusion: 'success' }],
              }
            : { state: 'success', statuses: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHub publication source approval', () => {
  it('accepts an approved exact head after GitHub reports the pull request merged', async () => {
    mockGitHubPull({
      state: 'closed',
      mergedAt: '2026-10-09T13:03:51Z',
      mergeableState: 'unknown',
    });

    await expect(
      new GitHubSourceRepository(repository, 1).verifyApproval(manifest)
    ).resolves.toMatchObject({
      revision,
      pullRequest: 181,
      approvals: 1,
      checks: 1,
    });
  });

  it('still rejects an open pull request whose mergeability is unknown', async () => {
    mockGitHubPull({ state: 'open', mergedAt: null, mergeableState: 'unknown' });

    await expect(
      new GitHubSourceRepository(repository, 1).verifyApproval(manifest)
    ).rejects.toMatchObject({
      code: 'SOURCE_NOT_APPROVED',
      message: 'Pull request is not publication-ready (unknown)',
    });
  });

  it('rejects a merged pull request when the requested revision is not its reviewed head', async () => {
    mockGitHubPull({
      state: 'closed',
      mergedAt: '2026-10-09T13:03:51Z',
      mergeableState: 'unknown',
    });

    await expect(
      new GitHubSourceRepository(repository, 1).verifyApproval({
        ...manifest,
        source: { ...manifest.source, revision: 'c'.repeat(40) },
      })
    ).rejects.toMatchObject({
      code: 'SOURCE_NOT_APPROVED',
      message: 'Pull request does not authorize the exact requested revision',
    });
  });
});
