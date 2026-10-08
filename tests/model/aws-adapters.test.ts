import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';

import { LockedSsmPointerStore } from '../../model/src/aws-adapters.js';

const ssmMock = mockClient(SSMClient);
const documentMock = mockClient(DynamoDBDocumentClient);
const parameterName = '/lexicon/transform-catalog-uri';
const expected = {
  name: parameterName,
  version: 7,
  value: 's3://bucket/config/transform/catalog.previous.json',
};
const requestedValue =
  's3://bucket/config/transform/catalog.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json';

function pointerStore(): LockedSsmPointerStore {
  return new LockedSsmPointerStore(
    new SSMClient({ region: 'us-east-2' }),
    new DynamoDBClient({ region: 'us-east-2' }),
    'publication-lock'
  );
}

describe('single-writer SSM pointer compare-and-set', () => {
  beforeEach(() => {
    ssmMock.reset();
    documentMock.reset();
    documentMock.on(UpdateCommand).resolves({});
  });

  it('locks, compares, updates, reads back, and records the new version', async () => {
    ssmMock
      .on(GetParameterCommand)
      .resolvesOnce({
        Parameter: {
          Name: parameterName,
          Version: expected.version,
          Value: expected.value,
        },
      })
      .resolvesOnce({
        Parameter: {
          Name: parameterName,
          Version: 8,
          Value: requestedValue,
        },
      });
    ssmMock.on(PutParameterCommand).resolves({ Version: 8 });

    await expect(
      pointerStore().compareAndSet({
        scope: 'review#transform',
        operationId: `publish-${'a'.repeat(32)}`,
        expected,
        requestedValue,
      })
    ).resolves.toEqual({
      name: parameterName,
      version: 8,
      value: requestedValue,
    });
    expect(ssmMock.commandCalls(PutParameterCommand)).toHaveLength(1);
    expect(documentMock.commandCalls(UpdateCommand)).toHaveLength(2);
  });

  it('rejects a stale expected version without writing SSM', async () => {
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: parameterName,
        Version: 8,
        Value: expected.value,
      },
    });

    await expect(
      pointerStore().compareAndSet({
        scope: 'review#transform',
        operationId: `publish-${'b'.repeat(32)}`,
        expected,
        requestedValue,
      })
    ).rejects.toMatchObject({ code: 'POINTER_CONFLICT' });
    expect(ssmMock.commandCalls(PutParameterCommand)).toHaveLength(0);
    expect(documentMock.commandCalls(UpdateCommand)).toHaveLength(2);
  });

  it('recovers when SSM committed but the client observed a timeout', async () => {
    ssmMock
      .on(GetParameterCommand)
      .resolvesOnce({
        Parameter: {
          Name: parameterName,
          Version: expected.version,
          Value: expected.value,
        },
      })
      .resolvesOnce({
        Parameter: {
          Name: parameterName,
          Version: 8,
          Value: requestedValue,
        },
      });
    ssmMock
      .on(PutParameterCommand)
      .rejects(Object.assign(new Error('socket timeout'), { name: 'TimeoutError' }));

    await expect(
      pointerStore().compareAndSet({
        scope: 'review#transform',
        operationId: `publish-${'c'.repeat(32)}`,
        expected,
        requestedValue,
      })
    ).resolves.toMatchObject({ version: 8, value: requestedValue });
    expect(documentMock.commandCalls(UpdateCommand)).toHaveLength(2);
  });
});
