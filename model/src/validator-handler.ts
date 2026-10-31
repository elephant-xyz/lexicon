import type { Handler } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { z } from 'zod';

import { createAwsAdapters, publicationConfigFromEnvironment } from './aws-adapters.js';
import { releaseOperationRequestSchema, workflowInputSchema } from './contracts.js';
import { PublicationError, errorMessage } from './errors.js';
import { GitHubSourceRepository } from './github-source.js';
import { buildPublicationPlan } from './publication.js';

const serviceName = 'model-publication-validator';
const logger = new Logger({ serviceName });
const tracer = new Tracer({ serviceName });
const metrics = new Metrics({ namespace: 'Model', serviceName });
const config = publicationConfigFromEnvironment();
const adapters = createAwsAdapters(config);
const source = new GitHubSourceRepository(
  config.allowedRepository,
  Number(process.env.REQUIRED_APPROVALS ?? '1')
);

metrics.setDefaultDimensions({
  environment: config.stage,
});

export const handler: Handler = async (event, context) => {
  const startedAt = Date.now();
  logger.resetKeys();
  logger.addContext(context);
  metrics.addDimension('operation', 'validate');
  const segment = tracer.getSegment()?.addNewSubsegment('ValidateRelease');
  try {
    const input = workflowInputSchema.parse(event);
    if (input.operation === 'rollback') {
      throw new PublicationError(
        'INVALID_RELEASE',
        'Rollback requests do not use the release validator'
      );
    }
    const request = releaseOperationRequestSchema.parse(input.payload);
    logger.appendKeys({
      operationId: input.operationId,
      operation: input.operation,
      releaseId: request.manifest.releaseId,
      sourceRevision: request.manifest.source.revision,
    });
    const plan = await buildPublicationPlan({
      manifest: request.manifest,
      config,
      source,
      ...adapters,
    });
    metrics.addMetric('ReleaseValidated', MetricUnit.Count, 1);
    logger.info('Release validation accepted', {
      writeCount: plan.artifacts.filter(artifact => artifact.action === 'WRITE').length,
      reuseCount: plan.artifacts.filter(artifact => artifact.action === 'REUSE').length,
      dependencyCount: plan.dependencyCount,
      alreadyPublished: plan.alreadyPublished,
    });
    return {
      accepted: true,
      operationId: input.operationId,
      releaseId: plan.releaseId,
      source: plan.sourceApproval,
      plan:
        input.operation === 'validate'
          ? undefined
          : {
              artifacts: plan.artifacts.map(artifact => ({
                key: artifact.declaration.destinationKey,
                sha256: artifact.declaration.sha256,
                size: artifact.declaration.size,
                action: artifact.action,
              })),
              dependencyCount: plan.dependencyCount,
              priorPointer: plan.priorPointer,
              requestedPointer: plan.requestedPointer,
              alreadyPublished: plan.alreadyPublished,
            },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      metrics.addMetric('ReleaseRejected', MetricUnit.Count, 1);
      logger.warn('Release validation rejected by schema', {
        issueCount: error.issues.length,
      });
      return {
        accepted: false,
        code: 'INVALID_RELEASE',
        message: 'Release artifacts do not match the governed schemas',
      };
    }
    if (error instanceof PublicationError && !error.retryable) {
      metrics.addMetric('ReleaseRejected', MetricUnit.Count, 1);
      logger.warn('Release validation rejected', {
        code: error.code,
        reason: error.message,
      });
      return {
        accepted: false,
        code: error.code,
        message: error.message,
      };
    }
    metrics.addMetric('ReleaseFailed', MetricUnit.Count, 1);
    segment?.addError(error as Error);
    logger.error('Release validation failed unexpectedly', {
      reason: errorMessage(error),
    });
    throw error;
  } finally {
    metrics.addMetric('ProcessingDuration', MetricUnit.Milliseconds, Date.now() - startedAt);
    metrics.publishStoredMetrics();
    segment?.close();
  }
};
