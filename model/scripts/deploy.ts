import { spawnSync } from 'node:child_process';

const targetAccountId = process.env.MODEL_TARGET_ACCOUNT_ID ?? '708502238428';
const targetRegion = process.env.MODEL_TARGET_REGION ?? 'us-east-2';
const stage = process.env.MODEL_STAGE ?? 'review';
const artifactBucketName = required('MODEL_ARTIFACT_BUCKET_NAME');
const allowedCallerRoleArn = required('MODEL_ALLOWED_CALLER_ROLE_ARN');
const criticalAlarmTopicArn = required('MODEL_CRITICAL_ALARM_TOPIC_ARN');
const publicationEnabled = process.env.MODEL_PUBLICATION_ENABLED ?? 'false';

if (stage !== 'review') {
  throw new Error('The first Model publication increment supports only the review stage.');
}
if (!['false', 'true'].includes(publicationEnabled)) {
  throw new Error('MODEL_PUBLICATION_ENABLED must be false or true.');
}
if (
  publicationEnabled === 'true' &&
  process.env.MODEL_ACTIVATION_APPROVED !== 'publish-after-observation'
) {
  throw new Error(
    'Activation requires MODEL_ACTIVATION_APPROVED=publish-after-observation after the user checkpoint.'
  );
}

const identity = runJson<{ Account?: string }>('aws', [
  'sts',
  'get-caller-identity',
  '--output',
  'json',
]);
if (identity.Account !== targetAccountId) {
  throw new Error(
    `Selected AWS credentials resolve to account ${identity.Account ?? 'unknown'}, expected ${targetAccountId}.`
  );
}

const versioning = runJson<{ Status?: string }>('aws', [
  's3api',
  'get-bucket-versioning',
  '--bucket',
  artifactBucketName,
  '--region',
  targetRegion,
  '--output',
  'json',
]);
if (versioning.Status !== 'Enabled') {
  throw new Error(`Artifact bucket '${artifactBucketName}' must have versioning enabled.`);
}

const pointer = runJson<{ Parameter?: { Version?: number } }>('aws', [
  'ssm',
  'get-parameter',
  '--name',
  '/lexicon/transform-catalog-uri',
  '--region',
  targetRegion,
  '--output',
  'json',
]);
if (pointer.Parameter?.Version === undefined) {
  throw new Error('The existing Transform catalog pointer has no version.');
}

assertArn(allowedCallerRoleArn, 'iam', targetAccountId);
assertArn(criticalAlarmTopicArn, 'sns', targetAccountId, targetRegion);
const roleName = allowedCallerRoleArn.split('/').at(-1);
if (!roleName) throw new Error('MODEL_ALLOWED_CALLER_ROLE_ARN has no role name.');
runJson('aws', ['iam', 'get-role', '--role-name', roleName, '--output', 'json']);
runJson('aws', [
  'sns',
  'get-topic-attributes',
  '--topic-arn',
  criticalAlarmTopicArn,
  '--region',
  targetRegion,
  '--output',
  'json',
]);

const parameters = [
  `ArtifactBucketName=${artifactBucketName}`,
  `AllowedCallerRoleArn=${allowedCallerRoleArn}`,
  `CriticalAlarmTopicArn=${criticalAlarmTopicArn}`,
  `PublicationEnabled=${publicationEnabled}`,
  'RequiredApprovals=1',
];
const parameterArgs = parameters.flatMap(parameter => ['--parameters', parameter]);
const environment = {
  ...process.env,
  MODEL_TARGET_ACCOUNT_ID: targetAccountId,
  MODEL_TARGET_REGION: targetRegion,
  MODEL_STAGE: stage,
  CDK_DEFAULT_ACCOUNT: targetAccountId,
  CDK_DEFAULT_REGION: targetRegion,
};

run('npx', ['cdk', 'synth', '--strict'], environment);
run(
  'npx',
  ['cdk', 'diff', 'ModelPublicationReview', '--no-change-set', ...parameterArgs],
  environment
);
run(
  'npx',
  [
    'cdk',
    'deploy',
    'ModelPublicationReview',
    '--require-approval',
    process.env.CDK_REQUIRE_APPROVAL ?? 'broadening',
    ...parameterArgs,
  ],
  environment
);

process.stdout.write(
  `Model publication ${stage} stack deployed with PublicationEnabled=${publicationEnabled}; prior pointer version was ${pointer.Parameter.Version}.\n`
);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before deployment.`);
  return value;
}

function assertArn(value: string, service: string, accountId: string, region?: string): void {
  const fields = value.split(':');
  if (
    fields.length < 6 ||
    fields[2] !== service ||
    fields[4] !== accountId ||
    (region !== undefined && fields[3] !== region)
  ) {
    throw new Error(`${service.toUpperCase()} ARN is outside the target account or region.`);
  }
}

function runJson<T = Record<string, unknown>>(command: string, args: string[]): T {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${command} exited ${result.status ?? 'unknown'}`);
  }
  return JSON.parse(result.stdout) as T;
}

function run(command: string, args: string[], env: Record<string, string | undefined>): void {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
