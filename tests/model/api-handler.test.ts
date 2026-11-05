import type { Context } from 'aws-lambda';
import { DescribeExecutionCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canonicalBytes, sha256 } from '../../model/src/util.js';

const sfnMock = mockClient(SFNClient);
const accountId = '708502238428';
const stateMachineArn = `arn:aws:states:us-east-2:${accountId}:stateMachine:ModelPublication-review-workflow`;
const roleArn = `arn:aws:iam::${accountId}:role/ModelPublicationReviewer`;

function requestBody(idempotencyKey = 'fixture-request-1'): Record<string, unknown> {
  const digest = 'a'.repeat(64);
  const priorDigest = 'b'.repeat(64);
  const catalogKey = `config/fixture/catalog.${digest}.json`;
  const artifactKey = 'config/fixture/mappings/source-to-target/1.0.0/manifest.json';
  return {
    contractVersion: 1,
    idempotencyKey,
    manifest: {
      contractVersion: 1,
      releaseId: 'fixture-release-1.0.0',
      stage: 'review',
      target: { accountId, region: 'us-east-2' },
      catalogIdentity: 'fixture',
      validationProfile: 'pipeline-language-mapping@2',
      source: {
        repository: 'https://github.com/elephant-xyz/lexicon',
        revision: 'c'.repeat(40),
        pullRequest: 42,
      },
      allowedArtifactKeys: [catalogKey, artifactKey],
      catalog: {
        sourcePath: 'publish/pipelines/fixture/catalog.json',
        destinationKey: catalogKey,
        sha256: digest,
        size: 100,
        contentType: 'application/json',
      },
      artifacts: [
        {
          sourcePath: 'publish/pipelines/fixture/mappings/source-to-target/1.0.0/manifest.json',
          destinationKey: artifactKey,
          sha256: 'd'.repeat(64),
          size: 200,
          contentType: 'application/json',
        },
      ],
      expectedPriorPointer: {
        parameterName: '/lexicon/transform-catalog-uri',
        version: 7,
        value: 's3://model-review-artifacts/config/fixture/catalog.previous.json',
        catalogSha256: priorDigest,
        catalogVersionId: 'prior-version',
      },
      requestedPointer: {
        parameterName: '/lexicon/transform-catalog-uri',
        value: `s3://model-review-artifacts/${catalogKey}`,
      },
    },
  };
}

function event(
  rawPath: string,
  body?: Record<string, unknown>,
  actorArn = `arn:aws:sts::${accountId}:assumed-role/ModelPublicationReviewer/session`
): Parameters<(typeof import('../../model/src/api-handler.js'))['handler']>[0] {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId,
      apiId: 'function-url',
      domainName: 'example.lambda-url.us-east-2.on.aws',
      domainPrefix: 'example',
      http: {
        method: body === undefined ? 'GET' : 'POST',
        path: rawPath,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'url-request',
      routeKey: '$default',
      stage: '$default',
      time: '08/Oct/2026:20:00:00 +0000',
      timeEpoch: 0,
      authorizer: {
        iam: {
          accountId,
          userArn: actorArn,
        },
      },
    },
    isBase64Encoded: false,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  } as unknown as Parameters<(typeof import('../../model/src/api-handler.js'))['handler']>[0];
}

const context = {
  awsRequestId: 'lambda-request',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'api',
  functionVersion: '$LATEST',
  invokedFunctionArn: `arn:aws:lambda:us-east-2:${accountId}:function:api`,
  logGroupName: '/aws/lambda/api',
  logStreamName: 'stream',
  memoryLimitInMB: '1024',
  getRemainingTimeInMillis: () => 30_000,
  done: () => undefined,
  fail: () => undefined,
  succeed: () => undefined,
} satisfies Context;

async function loadHandler(publicationEnabled = false) {
  vi.resetModules();
  Object.assign(process.env, {
    AWS_REGION: 'us-east-2',
    TARGET_ACCOUNT_ID: accountId,
    MODEL_STAGE: 'review',
    ARTIFACT_BUCKET_NAME: 'model-review-artifacts',
    DESTINATION_PREFIX: 'config',
    SOURCE_ROOT: 'publish/pipelines',
    RECEIPT_PREFIX: 'model-publication/receipts',
    ALLOWED_REPOSITORY: 'https://github.com/elephant-xyz/lexicon',
    POINTER_NAME: '/lexicon/transform-catalog-uri',
    LOCK_TABLE_NAME: 'publication-lock',
    REQUIRED_APPROVALS: '1',
    PUBLICATION_ENABLED: publicationEnabled ? 'true' : 'false',
    STATE_MACHINE_ARN: stateMachineArn,
    ALLOWED_CALLER_ROLE_ARN: roleArn,
  });
  return (await import('../../model/src/api-handler.js')).handler;
}

describe('Model publication HTTP API', () => {
  beforeEach(() => {
    sfnMock.reset();
  });

  it.each(['validate', 'plan'] as const)(
    'submits an IAM-authenticated %s operation',
    async operation => {
      sfnMock.on(StartExecutionCommand).resolves({
        executionArn: stateMachineArn.replace(':stateMachine:', ':execution:'),
        startDate: new Date(),
      });
      const handler = await loadHandler();
      const result = await handler(event(`/v1/releases/${operation}`, requestBody()), context);
      expect(result.statusCode).toBe(202);
      expect(JSON.parse(result.body ?? '{}')).toMatchObject({
        requestId: 'lambda-request',
        status: 'SUBMITTED',
      });
      const command = sfnMock.commandCalls(StartExecutionCommand)[0]?.args[0].input;
      expect(command?.stateMachineArn).toBe(stateMachineArn);
      expect(JSON.parse(command?.input ?? '{}')).toMatchObject({
        operation,
        actor: { accountId },
      });
    }
  );

  it('rejects an unauthorized IAM role', async () => {
    const handler = await loadHandler();
    const result = await handler(
      event(
        '/v1/releases/validate',
        requestBody(),
        `arn:aws:sts::${accountId}:assumed-role/OtherRole/session`
      ),
      context
    );
    expect(result.statusCode).toBe(403);
    expect(sfnMock.calls()).toHaveLength(0);
  });

  it('keeps publish inert until the checkpoint activation', async () => {
    const handler = await loadHandler(false);
    const result = await handler(event('/v1/releases/publish', requestBody()), context);
    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body ?? '{}')).toMatchObject({
      error: { code: 'PUBLICATION_DISABLED' },
    });
    expect(sfnMock.calls()).toHaveLength(0);
  });

  it('returns observable workflow status and results', async () => {
    sfnMock.on(DescribeExecutionCommand).resolves({
      status: 'SUCCEEDED',
      startDate: new Date('2026-10-08T20:00:00.000Z'),
      stopDate: new Date('2026-10-08T20:00:01.000Z'),
      output: JSON.stringify({ accepted: true, dependencyCount: 7 }),
    });
    const handler = await loadHandler();
    const result = await handler(event(`/v1/operations/plan-${'e'.repeat(32)}`), context);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? '{}')).toMatchObject({
      status: 'SUCCEEDED',
      result: { accepted: true, dependencyCount: 7 },
    });
  });

  it('returns the existing operation for an idempotent replay', async () => {
    sfnMock
      .on(StartExecutionCommand)
      .rejects(Object.assign(new Error('exists'), { name: 'ExecutionAlreadyExists' }));
    sfnMock.on(DescribeExecutionCommand).callsFake(() => {
      const request = requestBody();
      return {
        status: 'RUNNING',
        input: JSON.stringify({ requestHash: sha256(canonicalBytes(request)) }),
      };
    });
    const handler = await loadHandler();
    const result = await handler(event('/v1/releases/validate', requestBody()), context);
    expect(result.statusCode).toBe(202);
  });
});
