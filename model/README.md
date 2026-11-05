# Model governed publication

This is the first `release-compatibility` increment of Model. It adds an
IAM-authenticated, review-stage HTTP API for validating, planning, publishing,
reading, and rolling back reviewed catalog releases. It does not execute
Transform mappings or contact providers.

## Architecture

```text
IAM caller
  -> Lambda Function URL (AWS_IAM)
  -> Standard Step Functions workflow
     -> validator Lambda (GitHub + read-only S3/SSM)
     -> publisher Lambda (immutable S3 writes, catalog last, SSM pointer CAS)
     -> rollback Lambda (verified receipt target, pointer only)
  -> versioned S3 receipt + CloudWatch metrics/dashboard/alarms
```

The first validation plug-in is `pipeline-language-mapping@2`. Catalog identity,
repository, stage, account, region, pointer, source paths, and destination keys
are manifest data or deployment configuration; the workflow does not special-case
Transform mapping names.

Review publication requires the exact GitHub revision to remain at the named pull
request, at least one current approval, no active change request, and a complete
green check set. Green checks without review approval are rejected.

SSM Parameter Store has no native expected-version write. Model therefore makes
the publisher roles the only configured writers, serializes publish and rollback
with a conditional DynamoDB lock, rereads the exact expected SSM version/value
inside that lock, writes once, and verifies the returned version/value. This is
the service's compare-and-set boundary; direct SSM writers are unsupported.

## API

- `POST /v1/releases/validate`
- `POST /v1/releases/plan`
- `POST /v1/releases/publish`
- `POST /v1/releases/rollback`
- `GET /v1/operations/{operationId}`
- `GET /v1/receipts/{catalogIdentity}/{releaseId}`

All mutation-like operations are asynchronous and idempotent. Publish and
rollback return `409 PUBLICATION_DISABLED` while the stack parameter
`PublicationEnabled` is `false`.

Use the repository's SigV4 client; it reads the normal AWS credential provider
chain and never accepts credential values as arguments:

```bash
npm run model:request -- POST "$MODEL_API_URL/v1/releases/validate" release-request.json
```

## Deployment

The CDK stack imports the existing versioned artifact bucket and stable SSM
pointer. It creates four least-privilege Lambda roles, the Standard workflow,
a retained/deletion-protected lock table, 90-day logs, an IAM Function URL,
a dashboard, and self-resolving workflow failure/timeout alarms.

Deployment requires:

- `MODEL_ARTIFACT_BUCKET_NAME`
- `MODEL_ALLOWED_CALLER_ROLE_ARN`
- `MODEL_CRITICAL_ALARM_TOPIC_ARN`
- selected AWS credentials resolving to `708502238428/us-east-2`

The first deployment must remain inert:

```bash
MODEL_PUBLICATION_ENABLED=false npm run model:deploy
```

The deployment preflight verifies account, bucket versioning, existing pointer,
caller role, and alarm topic, then runs strict synthesis, CDK diff, and CDK
deployment. Activation additionally requires
`MODEL_ACTIVATION_APPROVED=publish-after-observation`.

## Checkpoint

Feature `release-compatibility-review` is `prepared` after local tests and strict
synthesis. It becomes `observed` only after the user runs validate and plan
through the deployed API and inspects the correlated Step Functions execution and
CloudWatch logs. It becomes `verified` only after those observations match the
expected no-write plan. Publication cannot be activated before that checkpoint.
