import type { Handler } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { z } from 'zod';

import { createAwsAdapters, publicationConfigFromEnvironment } from './aws-adapters.js';
import { releaseOperationRequestSchema, workflowInputSchema } from './contracts.js';
import { PublicationError, errorMessage } from './errors.js';
import { GitHubSourceRepository } from './github-source.js';
import { buildPublicationPlan, publishRelease } from './publication.js';

const serviceName = 'model-publication-publisher';
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
  metrics.addDimension('operation', 'publish');
  const segment = tracer.getSegment()?.addNewSubsegment('PublishRelease');
  try {
    const input = workflowInputSchema.parse(event);
    if (input.operation !== 'publish') {
      throw new PublicationError('INVALID_RELEASE', 'Publisher accepts only publish operations');
    }
    const request = releaseOperationRequestSchema.parse(input.payload);
    logger.appendKeys({
      operationId: input.operationId,
      releaseId: request.manifest.releaseId,
      sourceRevision: request.manifest.source.revision,
    });
    if (process.env.PUBLICATION_ENABLED !== 'true') {
      throw new PublicationError(
        'PUBLICATION_DISABLED',
        'Publication is disabled until the review checkpoint is accepted'
      );
    }
    const plan = await buildPublicationPlan({
      manifest: request.manifest,
      config,
      source,
      ...adapters,
    });
    const result = await publishRelease({
      operationId: input.operationId,
      actor: input.actor,
      submittedAt: input.submittedAt,
      manifest: request.manifest,
      plan,
      config,
      source,
      ...adapters,
    });
    metrics.addMetric('ReleasePublished', MetricUnit.Count, 1);
    logger.info('Release publication completed', {
      pointerVersion: result.receipt.pointer.version,
      receiptKey: result.receiptObject.key,
      receiptVersionId: result.receiptObject.versionId,
    });
    return {
      accepted: true,
      operationId: input.operationId,
      releaseId: request.manifest.releaseId,
      receipt: {
        key: result.receiptObject.key,
        versionId: result.receiptObject.versionId,
        sha256: result.receiptObject.sha256,
      },
      pointer: result.receipt.pointer,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      metrics.addMetric('ReleaseRejected', MetricUnit.Count, 1);
      logger.warn('Release publication rejected by schema', {
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
      logger.warn('Release publication rejected', {
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
    logger.error('Release publication failed unexpectedly', {
      reason: errorMessage(error),
    });
    throw error;
  } finally {
    metrics.addMetric('ProcessingDuration', MetricUnit.Milliseconds, Date.now() - startedAt);
    metrics.publishStoredMetrics();
    segment?.close();
  }
};
