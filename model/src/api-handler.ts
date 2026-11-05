import type { APIGatewayProxyStructuredResultV2, LambdaFunctionURLEvent } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { DescribeExecutionCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { z } from 'zod';

import { createAwsAdapters, publicationConfigFromEnvironment } from './aws-adapters.js';
import {
  operationKindSchema,
  publicationReceiptSchema,
  releaseOperationRequestSchema,
  rollbackOperationRequestSchema,
  type OperationKind,
  type WorkflowInput,
} from './contracts.js';
import { PublicationError, errorMessage } from './errors.js';
import { canonicalBytes, sha256 } from './util.js';

interface IamAuthorizer {
  accountId?: string;
  userArn?: string;
}

interface FunctionUrlEventWithIam extends LambdaFunctionURLEvent {
  requestContext: LambdaFunctionURLEvent['requestContext'] & {
    authorizer?: { iam?: IamAuthorizer };
  };
}

const serviceName = 'model-publication-api';
const logger = new Logger({ serviceName });
const tracer = new Tracer({ serviceName });
const metrics = new Metrics({ namespace: 'Model', serviceName });
const criticalMetrics = new Metrics({ namespace: 'Model', serviceName });
const config = publicationConfigFromEnvironment();
const adapters = createAwsAdapters(config);
const stateMachineArn = requiredEnvironment('STATE_MACHINE_ARN');
const allowedCallerRoleArn = requiredEnvironment('ALLOWED_CALLER_ROLE_ARN');
const sfnClient = new SFNClient({ region: config.region, maxAttempts: 4 });

metrics.setDefaultDimensions({
  environment: config.stage,
});
criticalMetrics.setDefaultDimensions({
  environment: config.stage,
});

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function response(
  statusCode: number,
  requestId: string,
  body: Record<string, unknown>
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
    body: JSON.stringify({ requestId, ...body }),
  };
}

function actorFromEvent(event: FunctionUrlEventWithIam): {
  accountId: string;
  arn: string;
} {
  const iam = event.requestContext.authorizer?.iam;
  if (!iam?.accountId || !iam.userArn) {
    throw new PublicationError('UNAUTHORIZED', 'IAM caller identity is required');
  }
  if (iam.accountId !== config.accountId) {
    throw new PublicationError('UNAUTHORIZED', 'Caller account is not authorized');
  }
  const roleMatch = /^arn:[^:]+:iam::([0-9]{12}):role\/(.+)$/u.exec(allowedCallerRoleArn);
  const assumedRoleMatch = /^arn:[^:]+:sts::([0-9]{12}):assumed-role\/([^/]+)\/.+$/u.exec(
    iam.userArn
  );
  const directMatch = iam.userArn === allowedCallerRoleArn;
  const assumedMatch =
    roleMatch !== null &&
    assumedRoleMatch !== null &&
    roleMatch[1] === assumedRoleMatch[1] &&
    roleMatch[2]?.split('/').at(-1) === assumedRoleMatch[2];
  if (!directMatch && !assumedMatch) {
    throw new PublicationError('UNAUTHORIZED', 'Caller role is not authorized');
  }
  return { accountId: iam.accountId, arn: iam.userArn };
}

function parseBody(event: FunctionUrlEventWithIam): unknown {
  if (event.body === undefined) {
    throw new PublicationError('INVALID_RELEASE', 'Request body is required');
  }
  const body = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  if (Buffer.byteLength(body, 'utf8') > 1_048_576) {
    throw new PublicationError('INVALID_RELEASE', 'Request body exceeds 1 MiB');
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new PublicationError('INVALID_RELEASE', 'Request body must be valid JSON');
  }
}

function operationArn(operationId: string): string {
  return stateMachineArn.replace(':stateMachine:', ':execution:').concat(`:${operationId}`);
}

async function submitOperation(input: {
  event: FunctionUrlEventWithIam;
  operation: OperationKind;
  actor: { accountId: string; arn: string };
  requestId: string;
}): Promise<APIGatewayProxyStructuredResultV2> {
  if (
    (input.operation === 'publish' || input.operation === 'rollback') &&
    process.env.PUBLICATION_ENABLED !== 'true'
  ) {
    throw new PublicationError(
      'PUBLICATION_DISABLED',
      'Publication is inactive until the validation/plan checkpoint is accepted'
    );
  }
  const parsedBody = parseBody(input.event);
  const payload =
    input.operation === 'rollback'
      ? rollbackOperationRequestSchema.parse(parsedBody)
      : releaseOperationRequestSchema.parse(parsedBody);
  const requestHash = sha256(canonicalBytes(payload));
  const operationId = `${input.operation}-${sha256(
    `${input.actor.arn}\0${payload.idempotencyKey}`
  ).slice(0, 32)}`;
  const workflowInput: WorkflowInput = {
    contractVersion: 1,
    operation: input.operation,
    operationId,
    requestHash,
    actor: input.actor,
    submittedAt: new Date().toISOString(),
    payload,
  };
  const serializedInput = Buffer.from(canonicalBytes(workflowInput)).toString('utf8');

  try {
    await sfnClient.send(
      new StartExecutionCommand({
        stateMachineArn,
        name: operationId,
        input: serializedInput,
      })
    );
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'ExecutionAlreadyExists') {
      throw error;
    }
    const existing = await sfnClient.send(
      new DescribeExecutionCommand({ executionArn: operationArn(operationId) })
    );
    const existingInput = existing.input
      ? (JSON.parse(existing.input) as { requestHash?: string })
      : undefined;
    if (existingInput?.requestHash !== requestHash) {
      throw new PublicationError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key was already used with a different request'
      );
    }
  }
  return response(202, input.requestId, {
    operationId,
    status: 'SUBMITTED',
    statusPath: `/v1/operations/${operationId}`,
  });
}

async function getOperation(
  operationId: string,
  requestId: string
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!/^(?:validate|plan|publish|rollback)-[a-f0-9]{32}$/u.test(operationId)) {
    throw new PublicationError('NOT_FOUND', 'Operation does not exist');
  }
  try {
    const execution = await sfnClient.send(
      new DescribeExecutionCommand({ executionArn: operationArn(operationId) })
    );
    const result =
      execution.status === 'SUCCEEDED' && execution.output !== undefined
        ? (JSON.parse(execution.output) as unknown)
        : undefined;
    return response(200, requestId, {
      operationId,
      status: execution.status,
      startedAt: execution.startDate?.toISOString(),
      stoppedAt: execution.stopDate?.toISOString(),
      ...(result === undefined ? {} : { result }),
      ...(execution.status === 'FAILED'
        ? {
            error: { code: 'INTERNAL_ERROR', message: 'Operation failed; inspect correlated logs' },
          }
        : {}),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'ExecutionDoesNotExist' || error.name === 'ResourceNotFoundException')
    ) {
      throw new PublicationError('NOT_FOUND', 'Operation does not exist');
    }
    throw error;
  }
}

async function getReceipt(
  catalogIdentity: string,
  releaseId: string,
  requestId: string
): Promise<APIGatewayProxyStructuredResultV2> {
  if (
    !/^[a-z][a-z0-9-]*$/u.test(catalogIdentity) ||
    !/^[a-z0-9][a-z0-9._-]{2,127}$/u.test(releaseId)
  ) {
    throw new PublicationError('NOT_FOUND', 'Receipt does not exist');
  }
  const key = `${config.receiptPrefix.replace(/\/+$/u, '')}/${config.stage}/${catalogIdentity}/${releaseId}.json`;
  const object = await adapters.store.read(key);
  if (object === undefined) {
    throw new PublicationError('NOT_FOUND', 'Receipt does not exist');
  }
  const receipt = publicationReceiptSchema.parse(
    JSON.parse(Buffer.from(object.bytes).toString('utf8')) as unknown
  );
  return response(200, requestId, {
    receipt,
    object: {
      key,
      versionId: object.versionId,
      sha256: object.sha256,
    },
  });
}

export const handler = async (
  event: FunctionUrlEventWithIam,
  context: Parameters<import('aws-lambda').Handler>[1]
): Promise<APIGatewayProxyStructuredResultV2> => {
  const startedAt = Date.now();
  const requestId = context.awsRequestId;
  logger.resetKeys();
  logger.addContext(context);
  logger.appendKeys({ requestId });
  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/\/+$/u, '') || '/';
  const submitMatch = /^\/v1\/releases\/(validate|plan|publish|rollback)$/u.exec(path);
  const metricOperation =
    submitMatch?.[1] ??
    (path.startsWith('/v1/operations/') ? 'get-operation' : undefined) ??
    (path.startsWith('/v1/receipts/') ? 'get-receipt' : 'unknown');
  metrics.addDimension('operation', metricOperation);
  const segment = tracer.getSegment()?.addNewSubsegment('HandlePublicationApi');
  try {
    const actor = actorFromEvent(event);
    logger.info('Publication API request', { method, path, actorArn: actor.arn });

    if (method === 'POST' && submitMatch !== null) {
      const operation = operationKindSchema.parse(submitMatch[1]);
      const result = await submitOperation({
        event,
        operation,
        actor,
        requestId,
      });
      metrics.addMetric('ApiRequestProcessed', MetricUnit.Count, 1);
      return result;
    }

    const operationMatch = /^\/v1\/operations\/([^/]+)$/u.exec(path);
    if (method === 'GET' && operationMatch !== null) {
      const result = await getOperation(operationMatch[1] as string, requestId);
      metrics.addMetric('ApiRequestProcessed', MetricUnit.Count, 1);
      return result;
    }

    const receiptMatch = /^\/v1\/receipts\/([^/]+)\/([^/]+)$/u.exec(path);
    if (method === 'GET' && receiptMatch !== null) {
      const result = await getReceipt(
        receiptMatch[1] as string,
        receiptMatch[2] as string,
        requestId
      );
      metrics.addMetric('ApiRequestProcessed', MetricUnit.Count, 1);
      return result;
    }
    throw new PublicationError('NOT_FOUND', 'Route does not exist');
  } catch (error) {
    metrics.addMetric('ApiRequestFailed', MetricUnit.Count, 1);
    if (error instanceof z.ZodError) {
      logger.warn('Publication API request failed schema validation', {
        issueCount: error.issues.length,
      });
      return response(400, requestId, {
        error: {
          code: 'INVALID_RELEASE',
          message: 'Request does not match the publication contract',
          issues: error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }
    if (error instanceof PublicationError) {
      const statusCode =
        error.code === 'UNAUTHORIZED'
          ? 403
          : error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'IDEMPOTENCY_CONFLICT' ||
                error.code === 'POINTER_CONFLICT' ||
                error.code === 'PUBLICATION_DISABLED'
              ? 409
              : error.code === 'DEPENDENCY_UNAVAILABLE'
                ? 503
                : 400;
      logger.warn('Publication API request rejected', {
        code: error.code,
        reason: error.message,
      });
      return response(statusCode, requestId, {
        error: { code: error.code, message: error.message },
      });
    }
    segment?.addError(error as Error);
    criticalMetrics.addMetric('ApiInternalFailed', MetricUnit.Count, 1);
    criticalMetrics.publishStoredMetrics();
    logger.error('Publication API request failed unexpectedly', {
      reason: errorMessage(error),
    });
    return response(500, requestId, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Request failed; inspect correlated logs',
      },
    });
  } finally {
    metrics.addMetric('ProcessingDuration', MetricUnit.Milliseconds, Date.now() - startedAt);
    metrics.publishStoredMetrics();
    segment?.close();
  }
};
