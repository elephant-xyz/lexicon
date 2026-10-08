import type { Handler } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { z } from 'zod';

import { createAwsAdapters, publicationConfigFromEnvironment } from './aws-adapters.js';
import { rollbackOperationRequestSchema, workflowInputSchema } from './contracts.js';
import { PublicationError, errorMessage } from './errors.js';
import { rollbackRelease } from './rollback.js';

const serviceName = 'model-publication-rollback';
const logger = new Logger({ serviceName });
const tracer = new Tracer({ serviceName });
const metrics = new Metrics({ namespace: 'Model', serviceName });
const config = publicationConfigFromEnvironment();
const adapters = createAwsAdapters(config);

metrics.setDefaultDimensions({
  environment: config.stage,
});

export const handler: Handler = async (event, context) => {
  const startedAt = Date.now();
  logger.resetKeys();
  logger.addContext(context);
  metrics.addDimension('operation', 'rollback');
  const segment = tracer.getSegment()?.addNewSubsegment('RollbackRelease');
  try {
    const input = workflowInputSchema.parse(event);
    if (input.operation !== 'rollback') {
      throw new PublicationError(
        'INVALID_RELEASE',
        'Rollback worker accepts only rollback operations'
      );
    }
    if (process.env.PUBLICATION_ENABLED !== 'true') {
      throw new PublicationError(
        'PUBLICATION_DISABLED',
        'Rollback is disabled while publication is inactive'
      );
    }
    const request = rollbackOperationRequestSchema.parse(input.payload);
    logger.appendKeys({
      operationId: input.operationId,
      catalogIdentity: request.catalogIdentity,
    });
    const receipt = await rollbackRelease({
      operationId: input.operationId,
      actor: input.actor,
      submittedAt: input.submittedAt,
      request,
      config,
      ...adapters,
    });
    metrics.addMetric('ReleaseRolledBack', MetricUnit.Count, 1);
    logger.info('Release rollback completed', {
      pointerVersion: receipt.pointer.version,
      catalogVersionId: receipt.catalog.versionId,
    });
    return {
      accepted: true,
      operationId: input.operationId,
      pointer: receipt.pointer,
      catalog: receipt.catalog,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      metrics.addMetric('ReleaseRejected', MetricUnit.Count, 1);
      logger.warn('Release rollback rejected by schema', {
        issueCount: error.issues.length,
      });
      return {
        accepted: false,
        code: 'INVALID_RELEASE',
        message: 'Rollback receipt does not match the governed schema',
      };
    }
    if (error instanceof PublicationError && !error.retryable) {
      metrics.addMetric('ReleaseRejected', MetricUnit.Count, 1);
      logger.warn('Release rollback rejected', {
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
    logger.error('Release rollback failed unexpectedly', {
      reason: errorMessage(error),
    });
    throw error;
  } finally {
    metrics.addMetric('ProcessingDuration', MetricUnit.Milliseconds, Date.now() - startedAt);
    metrics.publishStoredMetrics();
    segment?.close();
  }
};
