import path from 'node:path';

import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { ModelPublicationStack } from '../../model/lib/model-publication-stack.js';

function synthesize(): Template {
  const app = new App();
  const stack = new ModelPublicationStack(app, 'TestModelPublication', {
    env: { account: '708502238428', region: 'us-east-2' },
    repoRoot: path.resolve(process.cwd()),
    stage: 'review',
    pointerName: '/lexicon/transform-catalog-uri',
    destinationPrefix: 'config',
    sourceRoot: 'publish/pipelines',
    receiptPrefix: 'model-publication/receipts',
    allowedRepository: 'https://github.com/elephant-xyz/lexicon',
  });
  return Template.fromStack(stack);
}

describe('Model publication CDK stack', () => {
  it('keeps publication inactive and exposes only an IAM-authenticated URL', () => {
    const template = synthesize();
    template.hasParameter('PublicationEnabled', {
      Type: 'String',
      Default: 'false',
      AllowedValues: ['false', 'true'],
    });
    template.resourceCountIs('AWS::Lambda::Url', 1);
    template.hasResourceProperties('AWS::Lambda::Url', {
      AuthType: 'AWS_IAM',
      InvokeMode: 'BUFFERED',
    });
    template.resourceCountIs('AWS::ApiGateway::RestApi', 0);
  });

  it('provisions an observable Standard workflow and retained lock state', () => {
    const template = synthesize();
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineType: 'STANDARD',
      TracingConfiguration: { Enabled: true },
      LoggingConfiguration: Match.objectLike({
        IncludeExecutionData: false,
        Level: 'ALL',
      }),
    });
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      DeletionProtectionEnabled: true,
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
      SSESpecification: { SSEEnabled: true },
    });
    template.resourceCountIs('AWS::CloudWatch::Alarm', 3);
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  });

  it('uses Node 24, active tracing, bounded concurrency, and 90-day logs', () => {
    const template = synthesize();
    template.allResourcesProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      TracingConfig: { Mode: 'Active' },
      ReservedConcurrentExecutions: Match.anyValue(),
    });
    template.allResourcesProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 90,
    });
  });

  it('never grants artifact deletion or wildcard SSM writes', () => {
    const template = synthesize();
    const policies = template.findResources('AWS::IAM::Policy');
    const serialized = JSON.stringify(policies);
    expect(serialized).not.toContain('s3:DeleteObject');
    expect(serialized).not.toContain('"ssm:*"');
    expect(serialized).toContain('ssm:PutParameter');
    expect(serialized).toContain('parameter/lexicon/transform-catalog-uri');

    const rollbackPolicy = Object.entries(policies).find(([logicalId]) =>
      logicalId.startsWith('RollbackRoleDefaultPolicy')
    )?.[1] as
      | {
          Properties?: {
            PolicyDocument?: {
              Statement?: Array<{ Action?: string | string[]; Resource?: unknown }>;
            };
          };
        }
      | undefined;
    const putStatements =
      rollbackPolicy?.Properties?.PolicyDocument?.Statement?.filter(statement =>
        [statement.Action].flat().includes('s3:PutObject')
      ) ?? [];
    expect(putStatements).toHaveLength(1);
    expect(JSON.stringify(putStatements)).toContain('model-publication/receipts/*');
    expect(JSON.stringify(putStatements)).not.toContain('/config/*');
  });
});
