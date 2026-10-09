import {
  publicationReceiptSchema,
  type ArtifactDeclaration,
  type RollbackOperationRequest,
} from './contracts.js';
import { PublicationError } from './errors.js';
import type { ArtifactStore, PointerStore, PublicationConfig } from './publication.js';
import { canonicalBytes, parseJson, parseS3Uri, sha256 } from './util.js';

export interface RollbackReceipt {
  contractVersion: 1;
  operationId: string;
  stage: string;
  catalogIdentity: string;
  actor: { accountId: string; arn: string };
  rolledBackAt: string;
  publicationReceipt: {
    key: string;
    versionId: string;
    sha256: string;
  };
  pointer: {
    name: string;
    priorVersion: number;
    version: number;
    priorValue: string;
    value: string;
  };
  catalog: {
    key: string;
    versionId: string;
    sha256: string;
  };
}

export async function rollbackRelease(input: {
  operationId: string;
  actor: { accountId: string; arn: string };
  submittedAt: string;
  request: RollbackOperationRequest;
  config: PublicationConfig;
  store: ArtifactStore;
  pointerStore: PointerStore;
}): Promise<RollbackReceipt> {
  if (input.request.stage !== input.config.stage || input.request.catalogIdentity.length === 0) {
    throw new PublicationError('UNAUTHORIZED', 'Rollback stage does not match this deployment');
  }
  if (input.request.expectedPointer.parameterName !== input.config.pointerName) {
    throw new PublicationError(
      'INVALID_RELEASE',
      `Rollback must use pointer '${input.config.pointerName}'`
    );
  }
  const receiptPrefix = `${input.config.receiptPrefix.replace(/\/+$/u, '')}/${input.request.stage}/${input.request.catalogIdentity}/`;
  if (
    !input.request.receipt.key.startsWith(receiptPrefix) ||
    !input.request.receipt.key.endsWith('.json')
  ) {
    throw new PublicationError(
      'UNAUTHORIZED',
      'Rollback receipt is outside this stage and catalog boundary'
    );
  }

  const receiptObject = await input.store.read(
    input.request.receipt.key,
    input.request.receipt.versionId
  );
  if (receiptObject === undefined || receiptObject.sha256 !== input.request.receipt.sha256) {
    throw new PublicationError(
      'ARTIFACT_DIGEST_MISMATCH',
      'Publication receipt cannot be verified'
    );
  }
  const publicationReceipt = publicationReceiptSchema.parse(
    parseJson(receiptObject.bytes, 'Publication receipt')
  );
  if (
    publicationReceipt.stage !== input.request.stage ||
    publicationReceipt.catalogIdentity !== input.request.catalogIdentity ||
    input.request.receipt.key !== `${receiptPrefix}${publicationReceipt.releaseId}.json` ||
    publicationReceipt.pointer.name !== input.config.pointerName ||
    publicationReceipt.pointer.value !== input.request.expectedPointer.value ||
    publicationReceipt.pointer.version !== input.request.expectedPointer.version
  ) {
    throw new PublicationError(
      'POINTER_CONFLICT',
      'Receipt does not describe the expected active release'
    );
  }

  const current = await input.pointerStore.read(input.config.pointerName);
  if (
    current.value !== input.request.expectedPointer.value ||
    current.version !== input.request.expectedPointer.version
  ) {
    throw new PublicationError(
      'POINTER_CONFLICT',
      'Current pointer no longer matches the requested rollback source'
    );
  }

  const targetLocation = parseS3Uri(publicationReceipt.rollbackTarget.pointerValue);
  const targetPrefix = `${input.config.destinationPrefix.replace(/\/+$/u, '')}/${input.request.catalogIdentity}/`;
  if (
    targetLocation.bucket !== input.config.artifactBucketName ||
    !targetLocation.key.startsWith(targetPrefix)
  ) {
    throw new PublicationError(
      'UNAUTHORIZED',
      'Rollback target is outside the configured artifact bucket'
    );
  }
  const targetCatalog = await input.store.read(
    targetLocation.key,
    publicationReceipt.rollbackTarget.catalogVersionId
  );
  if (
    targetCatalog === undefined ||
    targetCatalog.sha256 !== publicationReceipt.rollbackTarget.catalogSha256
  ) {
    throw new PublicationError(
      'ARTIFACT_DIGEST_MISMATCH',
      'Rollback target catalog cannot be verified'
    );
  }

  const pointer = await input.pointerStore.compareAndSet({
    scope: `${input.request.stage}#${input.request.catalogIdentity}`,
    operationId: input.operationId,
    expected: current,
    requestedValue: publicationReceipt.rollbackTarget.pointerValue,
  });
  const receipt: RollbackReceipt = {
    contractVersion: 1,
    operationId: input.operationId,
    stage: input.request.stage,
    catalogIdentity: input.request.catalogIdentity,
    actor: input.actor,
    rolledBackAt: input.submittedAt,
    publicationReceipt: input.request.receipt,
    pointer: {
      name: pointer.name,
      priorVersion: current.version,
      version: pointer.version,
      priorValue: current.value,
      value: pointer.value,
    },
    catalog: {
      key: targetCatalog.key,
      versionId: targetCatalog.versionId,
      sha256: targetCatalog.sha256,
    },
  };
  const bytes = canonicalBytes(receipt);
  const key = `${input.config.receiptPrefix.replace(/\/+$/u, '')}/rollbacks/${input.request.stage}/${input.request.catalogIdentity}/${input.operationId}.json`;
  const declaration: ArtifactDeclaration = {
    sourcePath: key,
    destinationKey: key,
    sha256: sha256(bytes),
    size: bytes.byteLength,
    contentType: 'application/json',
  };
  await input.store.writeImmutable(declaration, bytes, {
    'model-operation-id': input.operationId,
    'rollback-source-release': publicationReceipt.releaseId,
  });
  return receipt;
}
