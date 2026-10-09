#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { App, Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

import { ModelPublicationStack } from '../lib/model-publication-stack.js';

const app = new App();
const account =
  process.env.MODEL_TARGET_ACCOUNT_ID ?? String(app.node.tryGetContext('account') ?? '');
const region = process.env.MODEL_TARGET_REGION ?? String(app.node.tryGetContext('region') ?? '');
const stage = process.env.MODEL_STAGE ?? String(app.node.tryGetContext('stage') ?? 'review');
if (!/^[0-9]{12}$/u.test(account) || region.length === 0) {
  throw new Error('Set MODEL_TARGET_ACCOUNT_ID/MODEL_TARGET_REGION or account/region CDK context');
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

new ModelPublicationStack(app, 'ModelPublicationReview', {
  stackName: `ModelPublication-${stage}`,
  description: 'IAM-authenticated governed Model publication API and catalog pointer workflow',
  env: { account, region },
  terminationProtection: true,
  repoRoot,
  stage,
  pointerName: '/lexicon/transform-catalog-uri',
  destinationPrefix: 'config',
  sourceRoot: 'publish/pipelines',
  receiptPrefix: 'model-publication/receipts',
  allowedRepository: 'https://github.com/elephant-xyz/lexicon',
});

Aspects.of(app).add(
  new AwsSolutionsChecks({
    verbose: true,
    logIgnores: true,
  })
);
