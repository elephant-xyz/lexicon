import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import type { ArtifactDeclaration } from './contracts.js';
import { PublicationError } from './errors.js';
import type {
  ArtifactStore,
  PointerStore,
  PointerValue,
  PublicationConfig,
  StoredArtifact,
} from './publication.js';
import { sameBytes, sha256 } from './util.js';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function publicationConfigFromEnvironment(): PublicationConfig {
  return {
    accountId: requiredEnvironment('TARGET_ACCOUNT_ID'),
    region: requiredEnvironment('AWS_REGION'),
    stage: requiredEnvironment('MODEL_STAGE'),
    artifactBucketName: requiredEnvironment('ARTIFACT_BUCKET_NAME'),
    destinationPrefix: requiredEnvironment('DESTINATION_PREFIX'),
    sourceRoot: requiredEnvironment('SOURCE_ROOT'),
    allowedRepository: requiredEnvironment('ALLOWED_REPOSITORY'),
    pointerName: requiredEnvironment('POINTER_NAME'),
    receiptPrefix: requiredEnvironment('RECEIPT_PREFIX'),
  };
}

export class S3ArtifactStore implements ArtifactStore {
  public constructor(
    private readonly client: S3Client,
    private readonly bucketName: string
  ) {}

  public async read(key: string, versionId?: string): Promise<StoredArtifact | undefined> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          ...(versionId === undefined ? {} : { VersionId: versionId }),
        })
      );
      if (
        response.Body === undefined ||
        response.VersionId === undefined ||
        response.ContentLength === undefined ||
        response.ContentType === undefined
      ) {
        throw new PublicationError(
          'INVALID_RELEASE',
          `Stored artifact '${key}' lacks body, VersionId, size, or content type`
        );
      }
      if (response.ContentLength > 5_242_880) {
        const body = response.Body as unknown as {
          destroy?: () => void;
          cancel?: () => Promise<void>;
        };
        if (body.destroy !== undefined) body.destroy();
        else await body.cancel?.();
        throw new PublicationError(
          'INVALID_RELEASE',
          `Stored artifact '${key}' exceeds the 5 MiB validation limit`
        );
      }
      const bytes = await response.Body.transformToByteArray();
      if (bytes.byteLength !== response.ContentLength) {
        throw new PublicationError(
          'ARTIFACT_DIGEST_MISMATCH',
          `Stored artifact '${key}' changed while reading`
        );
      }
      return {
        key,
        bytes,
        sha256: sha256(bytes),
        size: bytes.byteLength,
        contentType: response.ContentType,
        versionId: response.VersionId,
      };
    } catch (error) {
      if (
        error instanceof NoSuchKey ||
        (error instanceof Error && (error.name === 'NoSuchKey' || error.name === 'NoSuchVersion'))
      ) {
        return undefined;
      }
      throw error;
    }
  }

  public async writeImmutable(
    declaration: ArtifactDeclaration,
    bytes: Uint8Array,
    metadata: Record<string, string>
  ): Promise<StoredArtifact> {
    if (bytes.byteLength !== declaration.size || sha256(bytes) !== declaration.sha256) {
      throw new PublicationError(
        'ARTIFACT_DIGEST_MISMATCH',
        `Write bytes for '${declaration.destinationKey}' do not match the declaration`
      );
    }
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: declaration.destinationKey,
          Body: bytes,
          ContentLength: declaration.size,
          ContentType: declaration.contentType,
          ChecksumSHA256: Buffer.from(declaration.sha256, 'hex').toString('base64'),
          IfNoneMatch: '*',
          Metadata: metadata,
        })
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        (error.name !== 'PreconditionFailed' && error.name !== 'ConditionalRequestConflict')
      ) {
        throw error;
      }
    }
    const stored = await this.read(declaration.destinationKey);
    if (
      stored === undefined ||
      stored.sha256 !== declaration.sha256 ||
      stored.size !== declaration.size ||
      stored.contentType !== declaration.contentType ||
      !sameBytes(stored.bytes, bytes)
    ) {
      throw new PublicationError(
        'ARTIFACT_CONFLICT',
        `Destination '${declaration.destinationKey}' contains different bytes`
      );
    }
    return stored;
  }
}

export class LockedSsmPointerStore implements PointerStore {
  private readonly documentClient: DynamoDBDocumentClient;

  public constructor(
    private readonly ssmClient: SSMClient,
    dynamoClient: DynamoDBClient,
    private readonly tableName: string,
    private readonly lockSeconds = 300
  ) {
    this.documentClient = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  public async read(name: string): Promise<PointerValue> {
    const response = await this.ssmClient.send(
      new GetParameterCommand({ Name: name, WithDecryption: false })
    );
    const parameter = response.Parameter;
    if (
      parameter?.Name === undefined ||
      parameter.Value === undefined ||
      parameter.Version === undefined
    ) {
      throw new PublicationError(
        'NOT_FOUND',
        `Pointer '${name}' does not exist or has no value/version`
      );
    }
    return {
      name: parameter.Name,
      value: parameter.Value,
      version: parameter.Version,
    };
  }

  private async acquireLock(input: { scope: string; operationId: string }): Promise<void> {
    const now = Math.floor(Date.now() / 1_000);
    try {
      await this.documentClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { scope: input.scope },
          UpdateExpression:
            'SET lockOwner = :owner, lockExpiresAt = :expires, updatedAt = :updated',
          ConditionExpression: 'attribute_not_exists(lockOwner) OR lockExpiresAt < :now',
          ExpressionAttributeValues: {
            ':owner': input.operationId,
            ':expires': now + this.lockSeconds,
            ':updated': new Date().toISOString(),
            ':now': now,
          },
        })
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new PublicationError(
          'POINTER_CONFLICT',
          'Another publication holds the catalog lock or changed the pointer'
        );
      }
      throw error;
    }
  }

  private async releaseLock(scope: string, operationId: string): Promise<void> {
    try {
      await this.documentClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { scope },
          UpdateExpression: 'REMOVE lockOwner, lockExpiresAt',
          ConditionExpression: 'lockOwner = :owner',
          ExpressionAttributeValues: { ':owner': operationId },
        })
      );
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'ConditionalCheckFailedException') {
        throw error;
      }
    }
  }

  private async finalizeLock(input: {
    scope: string;
    operationId: string;
    pointer: PointerValue;
  }): Promise<void> {
    await this.documentClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { scope: input.scope },
        UpdateExpression:
          'SET pointerVersion = :version, pointerValue = :value, updatedAt = :updated REMOVE lockOwner, lockExpiresAt',
        ConditionExpression: 'lockOwner = :owner OR attribute_not_exists(lockOwner)',
        ExpressionAttributeValues: {
          ':owner': input.operationId,
          ':version': input.pointer.version,
          ':value': input.pointer.value,
          ':updated': new Date().toISOString(),
        },
      })
    );
  }

  public async compareAndSet(input: {
    scope: string;
    operationId: string;
    expected: PointerValue;
    requestedValue: string;
  }): Promise<PointerValue> {
    await this.acquireLock({
      scope: input.scope,
      operationId: input.operationId,
    });
    try {
      const current = await this.read(input.expected.name);
      if (current.version !== input.expected.version || current.value !== input.expected.value) {
        throw new PublicationError(
          'POINTER_CONFLICT',
          'SSM pointer changed before compare-and-set'
        );
      }
      const response = await this.ssmClient.send(
        new PutParameterCommand({
          Name: input.expected.name,
          Type: 'String',
          Value: input.requestedValue,
          Overwrite: true,
        })
      );
      const readback = await this.read(input.expected.name);
      if (
        response.Version === undefined ||
        readback.version !== response.Version ||
        readback.value !== input.requestedValue
      ) {
        throw new PublicationError(
          'POINTER_CONFLICT',
          'SSM pointer readback failed after compare-and-set'
        );
      }
      await this.finalizeLock({
        scope: input.scope,
        operationId: input.operationId,
        pointer: readback,
      });
      return readback;
    } catch (error) {
      try {
        const recovered = await this.read(input.expected.name);
        if (recovered.value === input.requestedValue) {
          await this.finalizeLock({
            scope: input.scope,
            operationId: input.operationId,
            pointer: recovered,
          });
          return recovered;
        }
      } catch {
        // Preserve the original operation failure after releasing the lock.
      }
      await this.releaseLock(input.scope, input.operationId);
      throw error;
    }
  }
}

export function createAwsAdapters(config: PublicationConfig): {
  store: S3ArtifactStore;
  pointerStore: LockedSsmPointerStore;
} {
  const clientConfig = { region: config.region, maxAttempts: 4 };
  return {
    store: new S3ArtifactStore(new S3Client(clientConfig), config.artifactBucketName),
    pointerStore: new LockedSsmPointerStore(
      new SSMClient(clientConfig),
      new DynamoDBClient(clientConfig),
      requiredEnvironment('LOCK_TABLE_NAME')
    ),
  };
}
