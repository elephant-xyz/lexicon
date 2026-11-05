export type PublicationErrorCode =
  | 'ARTIFACT_CONFLICT'
  | 'ARTIFACT_DIGEST_MISMATCH'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_RELEASE'
  | 'NOT_FOUND'
  | 'POINTER_CONFLICT'
  | 'PUBLICATION_DISABLED'
  | 'SOURCE_NOT_APPROVED'
  | 'UNAUTHORIZED';

export class PublicationError extends Error {
  public constructor(
    public readonly code: PublicationErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = 'PublicationError';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected publication error';
}
