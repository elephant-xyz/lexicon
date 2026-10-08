import path from 'node:path';

import {
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  Stack,
  Tags,
  aws_cloudwatch as cloudwatch,
  aws_cloudwatch_actions as cloudwatchActions,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_s3 as s3,
  aws_sns as sns,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
} from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';

export interface ModelPublicationStackProps extends StackProps {
  repoRoot: string;
  stage: string;
  pointerName: string;
  destinationPrefix: string;
  sourceRoot: string;
  receiptPrefix: string;
  allowedRepository: string;
}

export class ModelPublicationStack extends Stack {
  public constructor(scope: Construct, id: string, props: ModelPublicationStackProps) {
    super(scope, id, props);

    const artifactBucketName = new CfnParameter(this, 'ArtifactBucketName', {
      type: 'String',
      minLength: 3,
      description:
        'Existing versioned artifact bucket that the stable catalog pointer already addresses.',
    });
    const allowedCallerRoleArn = new CfnParameter(this, 'AllowedCallerRoleArn', {
      type: 'String',
      allowedPattern: '^arn:[^:]+:iam::[0-9]{12}:role/.+$',
      description: 'Exact same-account IAM role allowed to invoke and use the publication API.',
    });
    const criticalAlarmTopicArn = new CfnParameter(this, 'CriticalAlarmTopicArn', {
      type: 'String',
      allowedPattern: '^arn:[^:]+:sns:[^:]+:[0-9]{12}:.+$',
      description:
        'Existing SNS fan-out topic wired to the review channels and production PagerDuty path.',
    });
    const publicationEnabled = new CfnParameter(this, 'PublicationEnabled', {
      type: 'String',
      default: 'false',
      allowedValues: ['false', 'true'],
      description:
        'Explicit activation gate. Keep false until validate/plan user observation is accepted.',
    });
    const requiredApprovals = new CfnParameter(this, 'RequiredApprovals', {
      type: 'Number',
      default: 1,
      minValue: 1,
      maxValue: 10,
      description: 'Minimum current GitHub approvals for the exact source revision.',
    });

    const artifactBucket = s3.Bucket.fromBucketName(
      this,
      'ArtifactBucket',
      artifactBucketName.valueAsString
    );
    const alarmTopic = sns.Topic.fromTopicArn(
      this,
      'CriticalAlarmTopic',
      criticalAlarmTopicArn.valueAsString
    );
    const callerRole = iam.Role.fromRoleArn(
      this,
      'PublicationCallerRole',
      allowedCallerRoleArn.valueAsString,
      { mutable: true }
    );

    const lockTable = new dynamodb.Table(this, 'PublicationLockTable', {
      partitionKey: { name: 'scope', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    const commonEnvironment = {
      MODEL_STAGE: props.stage,
      TARGET_ACCOUNT_ID: this.account,
      ARTIFACT_BUCKET_NAME: artifactBucket.bucketName,
      DESTINATION_PREFIX: props.destinationPrefix,
      SOURCE_ROOT: props.sourceRoot,
      RECEIPT_PREFIX: props.receiptPrefix,
      ALLOWED_REPOSITORY: props.allowedRepository,
      POINTER_NAME: props.pointerName,
      LOCK_TABLE_NAME: lockTable.tableName,
      REQUIRED_APPROVALS: requiredApprovals.valueAsString,
      PUBLICATION_ENABLED: publicationEnabled.valueAsString,
    };

    const functionDefaults = {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      tracing: lambda.Tracing.ACTIVE,
      memorySize: 1_024,
      timeout: Duration.minutes(5),
      bundling: {
        format: OutputFormat.CJS,
        target: 'node24',
        sourceMap: true,
        bundleAwsSDK: true,
      },
      environment: commonEnvironment,
    } as const;

    const validatorLogGroup = this.logGroup('ValidatorLogGroup');
    const publisherLogGroup = this.logGroup('PublisherLogGroup');
    const rollbackLogGroup = this.logGroup('RollbackLogGroup');
    const validatorRole = this.lambdaExecutionRole('ValidatorRole', validatorLogGroup);
    const publisherRole = this.lambdaExecutionRole('PublisherRole', publisherLogGroup);
    const rollbackRole = this.lambdaExecutionRole('RollbackRole', rollbackLogGroup);
    const validatorFunction = new NodejsFunction(this, 'ValidatorFunction', {
      ...functionDefaults,
      entry: path.join(props.repoRoot, 'model/src/validator-handler.ts'),
      handler: 'handler',
      reservedConcurrentExecutions: 1,
      logGroup: validatorLogGroup,
      role: validatorRole,
    });
    const publisherFunction = new NodejsFunction(this, 'PublisherFunction', {
      ...functionDefaults,
      entry: path.join(props.repoRoot, 'model/src/publisher-handler.ts'),
      handler: 'handler',
      reservedConcurrentExecutions: 1,
      logGroup: publisherLogGroup,
      role: publisherRole,
    });
    const rollbackFunction = new NodejsFunction(this, 'RollbackFunction', {
      ...functionDefaults,
      entry: path.join(props.repoRoot, 'model/src/rollback-handler.ts'),
      handler: 'handler',
      reservedConcurrentExecutions: 1,
      logGroup: rollbackLogGroup,
      role: rollbackRole,
    });

    this.grantArtifactRead(validatorFunction, artifactBucket, props.destinationPrefix);
    this.grantPointerRead(validatorFunction, props.pointerName);
    for (const writer of [publisherFunction, rollbackFunction]) {
      this.grantArtifactRead(writer, artifactBucket, props.destinationPrefix);
      this.grantReceiptRead(writer, artifactBucket, props.receiptPrefix);
      this.grantPointerReadWrite(writer, props.pointerName);
      writer.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['dynamodb:UpdateItem'],
          resources: [lockTable.tableArn],
        })
      );
    }
    this.grantArtifactWrite(
      publisherFunction,
      artifactBucket,
      props.destinationPrefix,
      props.receiptPrefix
    );
    this.grantReceiptWrite(rollbackFunction, artifactBucket, props.receiptPrefix);

    const validateTask = new tasks.LambdaInvoke(this, 'ValidateRelease', {
      lambdaFunction: validatorFunction,
      payload: sfn.TaskInput.fromJsonPathAt('$.request'),
      payloadResponseOnly: true,
      resultPath: '$.validation',
    });
    this.addSafeRetry(validateTask);
    const publishTask = new tasks.LambdaInvoke(this, 'PublishRelease', {
      lambdaFunction: publisherFunction,
      payload: sfn.TaskInput.fromJsonPathAt('$.request'),
      payloadResponseOnly: true,
    });
    this.addSafeRetry(publishTask);
    const rollbackTask = new tasks.LambdaInvoke(this, 'RollbackRelease', {
      lambdaFunction: rollbackFunction,
      payload: sfn.TaskInput.fromJsonPathAt('$.request'),
      payloadResponseOnly: true,
    });
    this.addSafeRetry(rollbackTask);

    const returnValidation = new sfn.Pass(this, 'ReturnValidationOrPlan', {
      outputPath: '$.validation',
    });
    const validationDecision = new sfn.Choice(this, 'ValidationAccepted')
      .when(sfn.Condition.booleanEquals('$.validation.accepted', false), returnValidation)
      .when(sfn.Condition.stringEquals('$.request.operation', 'publish'), publishTask)
      .otherwise(returnValidation);
    validateTask.next(validationDecision);

    const operationDecision = new sfn.Choice(this, 'SelectOperation')
      .when(sfn.Condition.stringEquals('$.request.operation', 'rollback'), rollbackTask)
      .otherwise(validateTask);
    const initialize = new sfn.Pass(this, 'InitializeOperation', {
      parameters: { 'request.$': '$' },
    }).next(operationDecision);

    const stateMachine = new sfn.StateMachine(this, 'PublicationWorkflow', {
      stateMachineName: `${this.stackName}-workflow`,
      stateMachineType: sfn.StateMachineType.STANDARD,
      definitionBody: sfn.DefinitionBody.fromChainable(initialize),
      timeout: Duration.minutes(15),
      tracingEnabled: true,
      logs: {
        destination: this.logGroup('WorkflowLogGroup'),
        level: sfn.LogLevel.ALL,
        includeExecutionData: false,
      },
    });

    const apiLogGroup = this.logGroup('ApiLogGroup');
    const apiRole = this.lambdaExecutionRole('ApiRole', apiLogGroup);
    const apiFunction = new NodejsFunction(this, 'ApiFunction', {
      ...functionDefaults,
      entry: path.join(props.repoRoot, 'model/src/api-handler.ts'),
      handler: 'handler',
      timeout: Duration.seconds(30),
      reservedConcurrentExecutions: 5,
      logGroup: apiLogGroup,
      role: apiRole,
      environment: {
        ...commonEnvironment,
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        ALLOWED_CALLER_ROLE_ARN: allowedCallerRoleArn.valueAsString,
      },
    });
    stateMachine.grantStartExecution(apiFunction);
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['states:DescribeExecution'],
        resources: [
          `arn:${this.partition}:states:${this.region}:${this.account}:execution:${stateMachine.stateMachineName}:*`,
        ],
      })
    );
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:GetObjectVersion'],
        resources: [artifactBucket.arnForObjects(`${props.receiptPrefix.replace(/\/+$/u, '')}/*`)],
      })
    );

    const apiUrl = apiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });
    apiFunction.grantInvokeUrl(callerRole);

    for (const role of [validatorRole, publisherRole, rollbackRole, apiRole]) {
      NagSuppressions.addResourceSuppressions(
        role,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason:
              'Wildcard suffixes are confined to exact CloudWatch log streams, governed S3 prefixes, X-Ray write APIs, or one state-machine execution namespace; every action and parent ARN is explicitly scoped.',
          },
        ],
        true
      );
    }
    NagSuppressions.addResourceSuppressions(
      stateMachine.role,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Step Functions invokes only the three named Lambda functions; CDK adds the qualified-version suffix required for Lambda invocation.',
        },
      ],
      true
    );

    const workflowFailed = new cloudwatch.Alarm(this, 'WorkflowFailedAlarm', {
      alarmDescription: 'Model publication workflow exhausted retries or failed terminally.',
      metric: stateMachine.metricFailed({
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    const workflowTimedOut = new cloudwatch.Alarm(this, 'WorkflowTimedOutAlarm', {
      alarmDescription: 'Model publication workflow timed out.',
      metric: stateMachine.metricTimedOut({
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    const apiInternalFailed = new cloudwatch.Alarm(this, 'ApiInternalFailedAlarm', {
      alarmDescription: 'Model publication API returned an unexpected internal failure.',
      metric: new cloudwatch.Metric({
        namespace: 'Model',
        metricName: 'ApiInternalFailed',
        dimensionsMap: {
          service: 'model-publication-api',
          environment: props.stage,
        },
        statistic: 'Sum',
        period: Duration.minutes(1),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    for (const alarm of [workflowFailed, workflowTimedOut, apiInternalFailed]) {
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));
      alarm.addOkAction(new cloudwatchActions.SnsAction(alarmTopic));
    }

    const dashboard = new cloudwatch.Dashboard(this, 'PublicationDashboard', {
      dashboardName: `${this.stackName}-operations`,
    });
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Publication outcomes',
        left: [
          this.customMetric('ReleaseValidated', props.stage),
          this.customMetric('ReleasePublished', props.stage),
          this.customMetric('ReleaseRolledBack', props.stage),
          this.customMetric('ReleaseRejected', props.stage),
          this.customMetric('ReleaseFailed', props.stage),
          this.customMetric('ApiInternalFailed', props.stage),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Workflow executions',
        left: [
          stateMachine.metricSucceeded({ statistic: 'Sum' }),
          stateMachine.metricFailed({ statistic: 'Sum' }),
          stateMachine.metricTimedOut({ statistic: 'Sum' }),
        ],
      })
    );

    Tags.of(this).add('Product', 'Model');
    Tags.of(this).add('Environment', props.stage);
    Tags.of(this).add('ManagedBy', 'CDK');

    new CfnOutput(this, 'ApiUrl', { value: apiUrl.url });
    new CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
    });
    new CfnOutput(this, 'LockTableName', { value: lockTable.tableName });
    new CfnOutput(this, 'DashboardName', {
      value: dashboard.dashboardName,
    });
    new CfnOutput(this, 'PublicationActivationState', {
      value: publicationEnabled.valueAsString,
    });
  }

  private lambdaExecutionRole(id: string, logGroup: logs.ILogGroup): iam.Role {
    const role = new iam.Role(this, id, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Least-privilege execution role for ${id}.`,
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [`${logGroup.logGroupArn}:*`],
      })
    );
    return role;
  }

  private logGroup(id: string): logs.LogGroup {
    return new logs.LogGroup(this, id, {
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  private addSafeRetry(task: tasks.LambdaInvoke): void {
    task.addRetry({
      errors: [
        'States.TaskFailed',
        'Lambda.ServiceException',
        'Lambda.AWSLambdaException',
        'Lambda.SdkClientException',
      ],
      interval: Duration.seconds(2),
      backoffRate: 2,
      maxAttempts: 3,
      jitterStrategy: sfn.JitterType.FULL,
    });
  }

  private grantArtifactRead(
    fn: lambda.IFunction,
    bucket: s3.IBucket,
    destinationPrefix: string
  ): void {
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:GetObjectVersion'],
        resources: [bucket.arnForObjects(`${destinationPrefix.replace(/\/+$/u, '')}/*`)],
      })
    );
  }

  private grantArtifactWrite(
    fn: lambda.IFunction,
    bucket: s3.IBucket,
    destinationPrefix: string,
    receiptPrefix: string
  ): void {
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [
          bucket.arnForObjects(`${destinationPrefix.replace(/\/+$/u, '')}/*`),
          bucket.arnForObjects(`${receiptPrefix.replace(/\/+$/u, '')}/*`),
        ],
      })
    );
  }

  private grantReceiptRead(fn: lambda.IFunction, bucket: s3.IBucket, receiptPrefix: string): void {
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:GetObjectVersion'],
        resources: [bucket.arnForObjects(`${receiptPrefix.replace(/\/+$/u, '')}/*`)],
      })
    );
  }

  private grantReceiptWrite(fn: lambda.IFunction, bucket: s3.IBucket, receiptPrefix: string): void {
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [bucket.arnForObjects(`${receiptPrefix.replace(/\/+$/u, '')}/*`)],
      })
    );
  }

  private grantPointerRead(fn: lambda.IFunction, pointerName: string): void {
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:${this.partition}:ssm:${this.region}:${this.account}:parameter${pointerName}`,
        ],
      })
    );
  }

  private grantPointerReadWrite(fn: lambda.IFunction, pointerName: string): void {
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:PutParameter'],
        resources: [
          `arn:${this.partition}:ssm:${this.region}:${this.account}:parameter${pointerName}`,
        ],
      })
    );
  }

  private customMetric(metricName: string, stage: string): cloudwatch.MathExpression {
    return new cloudwatch.MathExpression({
      expression: `SEARCH('Namespace="Model" MetricName="${metricName}" environment="${stage}"', 'Sum', 300)`,
      label: metricName,
      period: Duration.minutes(5),
    });
  }
}
