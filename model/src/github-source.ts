import type { ReleaseManifest } from './contracts.js';
import { PublicationError } from './errors.js';
import type { SourceApproval, SourceRepository } from './publication.js';

interface PullRequestResponse {
  state: 'open' | 'closed';
  draft: boolean;
  merged_at: string | null;
  mergeable_state: string;
  head: { sha: string };
}

interface ReviewResponse {
  user: { login: string } | null;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  submitted_at: string | null;
}

interface CheckRunsResponse {
  total_count: number;
  check_runs: Array<{
    status: 'queued' | 'in_progress' | 'completed';
    conclusion:
      | 'action_required'
      | 'cancelled'
      | 'failure'
      | 'neutral'
      | 'skipped'
      | 'stale'
      | 'success'
      | 'timed_out'
      | null;
  }>;
}

interface CombinedStatusResponse {
  state: 'error' | 'failure' | 'pending' | 'success';
  statuses: unknown[];
}

function repositorySlug(repository: string): string {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/u.exec(repository);
  if (match === null) {
    throw new PublicationError(
      'UNAUTHORIZED',
      `Repository '${repository}' is not a supported GitHub repository URL`
    );
  }
  return match[1] as string;
}

export class GitHubSourceRepository implements SourceRepository {
  public constructor(
    private readonly allowedRepository: string,
    private readonly requiredApprovals: number,
    private readonly timeoutMs = 5_000
  ) {}

  private async readBoundedBody(response: Response): Promise<Uint8Array> {
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > 1_048_576) {
      await response.body?.cancel();
      throw new PublicationError(
        'INVALID_RELEASE',
        'Source artifact exceeds the 1 MiB per-artifact limit'
      );
    }
    const reader = response.body?.getReader();
    if (reader === undefined) return new Uint8Array(await response.arrayBuffer());
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 1_048_576) {
        await reader.cancel();
        throw new PublicationError(
          'INVALID_RELEASE',
          'Source artifact exceeds the 1 MiB per-artifact limit'
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  private async requestJson<T>(url: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'elephant-model-publication',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new PublicationError(
        'DEPENDENCY_UNAVAILABLE',
        'GitHub did not respond within the configured timeout',
        true
      );
    }
    if (response.status === 403 || response.status === 429 || response.status >= 500) {
      throw new PublicationError(
        'DEPENDENCY_UNAVAILABLE',
        `GitHub approval dependency returned HTTP ${response.status}`,
        true
      );
    }
    if (!response.ok) {
      throw new PublicationError(
        'SOURCE_NOT_APPROVED',
        `GitHub source evidence returned HTTP ${response.status}`
      );
    }
    return (await response.json()) as T;
  }

  public async verifyApproval(manifest: ReleaseManifest): Promise<SourceApproval> {
    if (manifest.source.repository !== this.allowedRepository) {
      throw new PublicationError('UNAUTHORIZED', 'Source repository is not authorized');
    }
    const slug = repositorySlug(manifest.source.repository);
    const apiBase = `https://api.github.com/repos/${slug}`;
    const [pullRequest, reviews, checks, statuses] = await Promise.all([
      this.requestJson<PullRequestResponse>(`${apiBase}/pulls/${manifest.source.pullRequest}`),
      this.requestJson<ReviewResponse[]>(
        `${apiBase}/pulls/${manifest.source.pullRequest}/reviews?per_page=100`
      ),
      this.requestJson<CheckRunsResponse>(
        `${apiBase}/commits/${manifest.source.revision}/check-runs?per_page=100`
      ),
      this.requestJson<CombinedStatusResponse>(
        `${apiBase}/commits/${manifest.source.revision}/status`
      ),
    ]);

    if (
      pullRequest.head.sha !== manifest.source.revision ||
      pullRequest.draft ||
      (pullRequest.state !== 'open' && pullRequest.merged_at === null)
    ) {
      throw new PublicationError(
        'SOURCE_NOT_APPROVED',
        'Pull request does not authorize the exact requested revision'
      );
    }
    const merged = pullRequest.merged_at !== null;
    if (
      !merged &&
      (pullRequest.mergeable_state === 'dirty' ||
        pullRequest.mergeable_state === 'draft' ||
        pullRequest.mergeable_state === 'unknown')
    ) {
      throw new PublicationError(
        'SOURCE_NOT_APPROVED',
        `Pull request is not publication-ready (${pullRequest.mergeable_state})`
      );
    }

    const latestReviews = new Map<string, ReviewResponse>();
    for (const review of reviews
      .filter(item => item.user !== null && item.submitted_at !== null)
      .sort((left, right) =>
        (left.submitted_at as string).localeCompare(right.submitted_at as string)
      )) {
      if (review.state !== 'COMMENTED' && review.state !== 'PENDING') {
        latestReviews.set((review.user as { login: string }).login, review);
      }
    }
    const approvalCount = [...latestReviews.values()].filter(
      review => review.state === 'APPROVED'
    ).length;
    const changesRequested = [...latestReviews.values()].some(
      review => review.state === 'CHANGES_REQUESTED'
    );
    if (approvalCount < this.requiredApprovals || changesRequested) {
      throw new PublicationError(
        'SOURCE_NOT_APPROVED',
        `Source revision requires ${this.requiredApprovals} approval(s) and no active change request`
      );
    }

    const acceptedConclusions = new Set(['success', 'neutral', 'skipped']);
    if (
      checks.total_count === 0 ||
      checks.total_count !== checks.check_runs.length ||
      checks.check_runs.some(
        check =>
          check.status !== 'completed' ||
          check.conclusion === null ||
          !acceptedConclusions.has(check.conclusion)
      ) ||
      (statuses.statuses.length > 0 && statuses.state !== 'success')
    ) {
      throw new PublicationError(
        'SOURCE_NOT_APPROVED',
        'Source revision does not have a complete green check set'
      );
    }

    return {
      repository: manifest.source.repository,
      revision: manifest.source.revision,
      pullRequest: manifest.source.pullRequest,
      approvals: approvalCount,
      checks: checks.total_count + statuses.statuses.length,
    };
  }

  public async readFile(
    repository: string,
    revision: string,
    sourcePath: string
  ): Promise<Uint8Array> {
    if (repository !== this.allowedRepository) {
      throw new PublicationError('UNAUTHORIZED', 'Source repository is not authorized');
    }
    const slug = repositorySlug(repository);
    const encodedPath = sourcePath
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');
    let response: Response;
    try {
      response = await fetch(
        `https://raw.githubusercontent.com/${slug}/${revision}/${encodedPath}`,
        {
          headers: { 'User-Agent': 'elephant-model-publication' },
          signal: AbortSignal.timeout(this.timeoutMs),
        }
      );
    } catch {
      throw new PublicationError('DEPENDENCY_UNAVAILABLE', 'GitHub artifact fetch timed out', true);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new PublicationError(
        'DEPENDENCY_UNAVAILABLE',
        `GitHub artifact dependency returned HTTP ${response.status}`,
        true
      );
    }
    if (!response.ok) {
      throw new PublicationError(
        'INVALID_RELEASE',
        `Source artifact '${sourcePath}' is unavailable at the requested revision`
      );
    }
    return this.readBoundedBody(response);
  }
}
