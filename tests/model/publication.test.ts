import { describe, expect, it } from 'vitest';

import {
  releaseManifestSchema,
  type ArtifactDeclaration,
  type ReleaseManifest,
} from '../../model/src/contracts.js';
import { PublicationError } from '../../model/src/errors.js';
import {
  buildPublicationPlan,
  publishRelease,
  type ArtifactStore,
  type PointerStore,
  type PointerValue,
  type PublicationConfig,
  type SourceApproval,
  type SourceRepository,
  type StoredArtifact,
} from '../../model/src/publication.js';
import { rollbackRelease } from '../../model/src/rollback.js';
import { sameBytes, sha256 } from '../../model/src/util.js';

const repository = 'https://github.com/elephant-xyz/lexicon';
const revision = 'a'.repeat(40);
const bucket = 'model-review-artifacts';
const config: PublicationConfig = {
  accountId: '708502238428',
  region: 'us-east-2',
  stage: 'review',
  artifactBucketName: bucket,
  destinationPrefix: 'config',
  sourceRoot: 'publish/pipelines',
  allowedRepository: repository,
  pointerName: '/lexicon/transform-catalog-uri',
  receiptPrefix: 'model-publication/receipts',
};

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function declaration(
  sourcePath: string,
  destinationKey: string,
  bytes: Uint8Array
): ArtifactDeclaration {
  return {
    sourcePath,
    destinationKey,
    sha256: sha256(bytes),
    size: bytes.byteLength,
    contentType: sourcePath.endsWith('.json') ? 'application/json' : 'text/sql; charset=utf-8',
  };
}

class FakeSource implements SourceRepository {
  public constructor(
    public readonly files: Map<string, Uint8Array>,
    private readonly failure?: PublicationError
  ) {}

  public async verifyApproval(manifest: ReleaseManifest): Promise<SourceApproval> {
    if (this.failure !== undefined) throw this.failure;
    return {
      repository: manifest.source.repository,
      revision: manifest.source.revision,
      pullRequest: manifest.source.pullRequest,
      approvals: 1,
      checks: 3,
    };
  }

  public async readFile(
    _repository: string,
    _revision: string,
    sourcePath: string
  ): Promise<Uint8Array> {
    if (this.failure !== undefined) throw this.failure;
    const bytes = this.files.get(sourcePath);
    if (bytes === undefined) throw new Error(`Missing fake source ${sourcePath}`);
    return bytes;
  }
}

class FakeStore implements ArtifactStore {
  public readonly objects = new Map<string, StoredArtifact>();
  public readonly writes: string[] = [];
  private version = 0;

  public seed(
    key: string,
    bytes: Uint8Array,
    contentType = 'application/json',
    versionId?: string
  ): StoredArtifact {
    const object = {
      key,
      bytes,
      sha256: sha256(bytes),
      size: bytes.byteLength,
      contentType,
      versionId: versionId ?? `v-${++this.version}`,
    };
    this.objects.set(key, object);
    return object;
  }

  public async read(key: string, versionId?: string): Promise<StoredArtifact | undefined> {
    const object = this.objects.get(key);
    if (object === undefined || (versionId !== undefined && object.versionId !== versionId)) {
      return undefined;
    }
    return object;
  }

  public async writeImmutable(
    artifact: ArtifactDeclaration,
    bytes: Uint8Array
  ): Promise<StoredArtifact> {
    const existing = this.objects.get(artifact.destinationKey);
    if (existing !== undefined) {
      if (existing.sha256 !== artifact.sha256 || !sameBytes(existing.bytes, bytes)) {
        throw new PublicationError('ARTIFACT_CONFLICT', `${artifact.destinationKey} conflicts`);
      }
      return existing;
    }
    this.writes.push(artifact.destinationKey);
    return this.seed(artifact.destinationKey, bytes, artifact.contentType);
  }
}

class FakePointerStore implements PointerStore {
  public updates = 0;

  public constructor(public pointer: PointerValue) {}

  public async read(): Promise<PointerValue> {
    return this.pointer;
  }

  public async compareAndSet(input: {
    expected: PointerValue;
    requestedValue: string;
  }): Promise<PointerValue> {
    if (
      this.pointer.version !== input.expected.version ||
      this.pointer.value !== input.expected.value
    ) {
      throw new PublicationError('POINTER_CONFLICT', 'stale pointer');
    }
    this.updates += 1;
    this.pointer = {
      ...this.pointer,
      version: this.pointer.version + 1,
      value: input.requestedValue,
    };
    return this.pointer;
  }
}

interface Fixture {
  manifest: ReleaseManifest;
  source: FakeSource;
  store: FakeStore;
  pointerStore: FakePointerStore;
}

function replaceCatalog(fixture: Fixture, mutate: (catalog: { entries: unknown[] }) => void): void {
  const sourcePath = fixture.manifest.catalog.sourcePath;
  const currentBytes = fixture.source.files.get(sourcePath);
  if (currentBytes === undefined) throw new Error('Missing fixture catalog');
  const catalog = JSON.parse(Buffer.from(currentBytes).toString('utf8')) as {
    entries: unknown[];
  };
  mutate(catalog);
  const bytes = jsonBytes(catalog);
  const key = `config/fixture/catalog.${sha256(bytes)}.json`;
  const catalogDeclaration = declaration(sourcePath, key, bytes);
  fixture.source.files.set(sourcePath, bytes);
  fixture.manifest = releaseManifestSchema.parse({
    ...fixture.manifest,
    catalog: catalogDeclaration,
    allowedArtifactKeys: [
      key,
      ...fixture.manifest.artifacts.map(artifact => artifact.destinationKey),
    ],
    requestedPointer: {
      ...fixture.manifest.requestedPointer,
      value: `s3://${bucket}/${key}`,
    },
  });
}

function makeFixture(): Fixture {
  const store = new FakeStore();
  const sourceLanguage = {
    contractVersion: 2,
    name: 'fixture-source',
    version: '1.0.0',
    shape: 'tabular',
    datasets: [
      {
        type: 'source_rows',
        properties: { source_id: { type: 'string' } },
        required: ['source_id'],
        additionalProperties: false,
      },
    ],
  };
  const targetLanguage = {
    contractVersion: 2,
    name: 'fixture-target',
    version: '1.0.0',
    shape: 'tabular',
    datasets: [
      {
        type: 'target_rows',
        properties: { target_id: { type: 'string' } },
        required: ['target_id'],
        additionalProperties: false,
      },
    ],
  };
  const languageSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      contractVersion: { const: 2 },
      name: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
      version: { type: 'string' },
      shape: { const: 'tabular' },
      datasets: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            properties: { type: 'object' },
            required: { type: 'array', items: { type: 'string' } },
            additionalProperties: { const: false },
          },
          required: ['type', 'properties', 'required', 'additionalProperties'],
          additionalProperties: false,
        },
      },
    },
    required: ['contractVersion', 'name', 'version', 'shape', 'datasets'],
    additionalProperties: false,
  };
  const query = Buffer.from('SELECT source_id AS target_id FROM source_rows\n');
  const policy = jsonBytes({ cases: [{ name: 'baseline', expected: 'pass' }] });
  const mapping = {
    contractVersion: 2,
    id: 'fixture-source-to-target',
    version: '1.0.0',
    status: 'ENABLED',
    engine: 'spark-sql',
    from: { name: 'fixture-source', version: '1.0.0' },
    to: { name: 'fixture-target', version: '1.0.0' },
    inputs: [
      {
        table: 'source_rows',
        view: 'source_source_rows',
        required: true,
        format: 'jsonl',
      },
    ],
    output: { shape: 'tabular', format: 'parquet' },
    outputs: [
      {
        dataset: 'target_rows',
        dependsOn: [],
        queryPath: 'queries/target_rows.sql',
        querySha256: sha256(query),
        invariantEvidence: [
          {
            invariant: 'deterministic_fixture',
            querySha256s: [sha256(query)],
            tests: [
              {
                path: 'tests/policy.json',
                sha256: sha256(policy),
                description: 'Pins deterministic fixture behavior.',
              },
            ],
          },
        ],
      },
    ],
  };
  const schemaBytes = jsonBytes(languageSchema);
  const sourceLanguageBytes = jsonBytes(sourceLanguage);
  const targetLanguageBytes = jsonBytes(targetLanguage);
  const mappingBytes = jsonBytes(mapping);
  const catalog = {
    contractVersion: 2,
    publisher: 'elephant-xyz/lexicon',
    repository,
    ssMPointer: config.pointerName,
    languageSchema: {
      version: '1.0.0',
      status: 'ENABLED',
      path: 'schemas/pipeline-language/1.0.0/schema.json',
      sha256: sha256(schemaBytes),
    },
    entries: [
      {
        kind: 'language',
        name: 'fixture-source',
        version: '1.0.0',
        current: true,
        status: 'ENABLED',
        shape: 'tabular',
        path: 'languages/fixture-source/1.0.0/fixture-source.json',
        sha256: sha256(sourceLanguageBytes),
      },
      {
        kind: 'language',
        name: 'fixture-target',
        version: '1.0.0',
        current: true,
        status: 'ENABLED',
        shape: 'tabular',
        path: 'languages/fixture-target/1.0.0/fixture-target.json',
        sha256: sha256(targetLanguageBytes),
      },
      {
        kind: 'mapping',
        id: 'fixture-source-to-target',
        version: '1.0.0',
        current: true,
        status: 'ENABLED',
        from: 'fixture-source',
        to: 'fixture-target',
        path: 'mappings/fixture-source-to-target/1.0.0/manifest.json',
        sha256: sha256(mappingBytes),
        querySha256: sha256(query),
      },
    ],
  };
  const catalogBytes = jsonBytes(catalog);
  const catalogKey = `config/fixture/catalog.${sha256(catalogBytes)}.json`;
  const sourceBase = 'publish/pipelines/fixture';
  const files = new Map<string, Uint8Array>([
    [`${sourceBase}/catalog.json`, catalogBytes],
    [`${sourceBase}/mappings/fixture-source-to-target/1.0.0/manifest.json`, mappingBytes],
    [`${sourceBase}/mappings/fixture-source-to-target/1.0.0/queries/target_rows.sql`, query],
    [`${sourceBase}/mappings/fixture-source-to-target/1.0.0/tests/policy.json`, policy],
  ]);

  store.seed('config/fixture/schemas/pipeline-language/1.0.0/schema.json', schemaBytes);
  store.seed(
    'config/fixture/languages/fixture-source/1.0.0/fixture-source.json',
    sourceLanguageBytes
  );
  store.seed(
    'config/fixture/languages/fixture-target/1.0.0/fixture-target.json',
    targetLanguageBytes
  );
  const priorBytes = jsonBytes({ release: 'prior' });
  const prior = store.seed(
    'config/fixture/catalog.previous.json',
    priorBytes,
    'application/json',
    'prior-version'
  );
  const pointerStore = new FakePointerStore({
    name: config.pointerName,
    version: 7,
    value: `s3://${bucket}/${prior.key}`,
  });

  const artifacts = [...files.entries()]
    .filter(([sourcePath]) => !sourcePath.endsWith('/catalog.json'))
    .map(([sourcePath, bytes]) =>
      declaration(sourcePath, `config/fixture/${sourcePath.slice(sourceBase.length + 1)}`, bytes)
    );
  const catalogDeclaration = declaration(`${sourceBase}/catalog.json`, catalogKey, catalogBytes);
  const manifest = releaseManifestSchema.parse({
    contractVersion: 1,
    releaseId: 'fixture-release-1.0.0',
    stage: 'review',
    target: { accountId: config.accountId, region: config.region },
    catalogIdentity: 'fixture',
    validationProfile: 'pipeline-language-mapping@2',
    source: { repository, revision, pullRequest: 42 },
    allowedArtifactKeys: [
      catalogDeclaration.destinationKey,
      ...artifacts.map(artifact => artifact.destinationKey),
    ],
    catalog: catalogDeclaration,
    artifacts,
    expectedPriorPointer: {
      parameterName: config.pointerName,
      version: pointerStore.pointer.version,
      value: pointerStore.pointer.value,
      catalogSha256: prior.sha256,
      catalogVersionId: prior.versionId,
    },
    requestedPointer: {
      parameterName: config.pointerName,
      value: `s3://${bucket}/${catalogKey}`,
    },
  });
  return {
    manifest,
    source: new FakeSource(files),
    store,
    pointerStore,
  };
}

describe('governed publication planning and effects', () => {
  it('validates closure and publishes artifacts catalog-last with a receipt', async () => {
    const fixture = makeFixture();
    const plan = await buildPublicationPlan({ ...fixture, config });
    expect(plan.sourceApproval).toMatchObject({ approvals: 1, checks: 3 });
    expect(plan.artifacts).toHaveLength(4);
    expect(plan.artifacts.every(artifact => artifact.action === 'WRITE')).toBe(true);
    expect(plan.dependencyCount).toBe(7);

    const result = await publishRelease({
      operationId: 'publish-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      actor: {
        accountId: config.accountId,
        arn: `arn:aws:sts::${config.accountId}:assumed-role/ModelPublisher/test`,
      },
      submittedAt: '2026-10-08T20:00:00.000Z',
      manifest: fixture.manifest,
      plan,
      config,
      source: fixture.source,
      store: fixture.store,
      pointerStore: fixture.pointerStore,
    });

    expect(fixture.store.writes.slice(0, 4)).toEqual([
      ...fixture.manifest.artifacts.map(artifact => artifact.destinationKey),
      fixture.manifest.catalog.destinationKey,
    ]);
    expect(fixture.pointerStore.pointer.value).toBe(fixture.manifest.requestedPointer.value);
    expect(result.receipt.rollbackTarget).toMatchObject({
      pointerValue: fixture.manifest.expectedPriorPointer.value,
      catalogSha256: fixture.manifest.expectedPriorPointer.catalogSha256,
      catalogVersionId: 'prior-version',
    });
    expect(result.receiptObject.versionId).toBeTruthy();
  });

  it('supports idempotent replay as a materially different recovery path', async () => {
    const fixture = makeFixture();
    const initialPlan = await buildPublicationPlan({ ...fixture, config });
    const publishInput = {
      operationId: 'publish-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      actor: {
        accountId: config.accountId,
        arn: `arn:aws:sts::${config.accountId}:assumed-role/ModelPublisher/test`,
      },
      submittedAt: '2026-10-08T20:00:00.000Z',
      manifest: fixture.manifest,
      config,
      source: fixture.source,
      store: fixture.store,
      pointerStore: fixture.pointerStore,
    };
    const first = await publishRelease({ ...publishInput, plan: initialPlan });
    const replayPlan = await buildPublicationPlan({ ...fixture, config });
    expect(replayPlan.alreadyPublished).toBe(true);
    expect(replayPlan.artifacts.every(artifact => artifact.action === 'REUSE')).toBe(true);
    const second = await publishRelease({ ...publishInput, plan: replayPlan });
    expect(second.receiptObject.versionId).toBe(first.receiptObject.versionId);
    expect(fixture.pointerStore.updates).toBe(1);
  });

  it('rolls back only through a pinned verified receipt without deleting objects', async () => {
    const fixture = makeFixture();
    const plan = await buildPublicationPlan({ ...fixture, config });
    const published = await publishRelease({
      operationId: 'publish-cccccccccccccccccccccccccccccccc',
      actor: {
        accountId: config.accountId,
        arn: `arn:aws:sts::${config.accountId}:assumed-role/ModelPublisher/test`,
      },
      submittedAt: '2026-10-08T20:00:00.000Z',
      manifest: fixture.manifest,
      plan,
      config,
      source: fixture.source,
      store: fixture.store,
      pointerStore: fixture.pointerStore,
    });
    const objectCount = fixture.store.objects.size;
    const rollback = await rollbackRelease({
      operationId: 'rollback-dddddddddddddddddddddddddddddddd',
      actor: {
        accountId: config.accountId,
        arn: `arn:aws:sts::${config.accountId}:assumed-role/ModelPublisher/test`,
      },
      submittedAt: '2026-10-08T20:10:00.000Z',
      request: {
        contractVersion: 1,
        idempotencyKey: 'rollback-fixture-1',
        stage: 'review',
        catalogIdentity: 'fixture',
        receipt: {
          key: published.receiptObject.key,
          versionId: published.receiptObject.versionId,
          sha256: published.receiptObject.sha256,
        },
        expectedPointer: {
          parameterName: config.pointerName,
          version: published.receipt.pointer.version,
          value: published.receipt.pointer.value,
        },
      },
      config,
      store: fixture.store,
      pointerStore: fixture.pointerStore,
    });
    expect(rollback.pointer.value).toBe(fixture.manifest.expectedPriorPointer.value);
    expect(fixture.store.objects.size).toBe(objectCount + 1);
  });

  it('rejects unauthorized repositories before reading artifacts', async () => {
    const fixture = makeFixture();
    const manifest = {
      ...fixture.manifest,
      source: { ...fixture.manifest.source, repository: 'https://github.com/other/repo' },
    };
    await expect(buildPublicationPlan({ ...fixture, manifest, config })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(fixture.store.writes).toEqual([]);
  });

  it('rejects digest mismatches without effects', async () => {
    const fixture = makeFixture();
    fixture.source.files.set(
      fixture.manifest.artifacts[0]?.sourcePath as string,
      Buffer.from('different')
    );
    await expect(buildPublicationPlan({ ...fixture, config })).rejects.toMatchObject({
      code: 'ARTIFACT_DIGEST_MISMATCH',
    });
    expect(fixture.store.writes).toEqual([]);
  });

  it('rejects duplicate catalog identities and current registrations', async () => {
    const fixture = makeFixture();
    replaceCatalog(fixture, catalog => {
      catalog.entries.push(catalog.entries[2]);
    });
    await expect(buildPublicationPlan({ ...fixture, config })).rejects.toThrow(
      'Duplicate catalog identity'
    );
    expect(fixture.store.writes).toEqual([]);
  });

  it('rejects different existing bytes at an immutable key', async () => {
    const fixture = makeFixture();
    fixture.store.seed(
      fixture.manifest.artifacts[0]?.destinationKey as string,
      Buffer.from('conflict'),
      fixture.manifest.artifacts[0]?.contentType
    );
    await expect(buildPublicationPlan({ ...fixture, config })).rejects.toMatchObject({
      code: 'ARTIFACT_CONFLICT',
    });
    expect(fixture.store.writes).toEqual([]);
  });

  it('rejects stale pointer versions before publication', async () => {
    const fixture = makeFixture();
    fixture.pointerStore.pointer = {
      ...fixture.pointerStore.pointer,
      version: fixture.pointerStore.pointer.version + 1,
    };
    await expect(buildPublicationPlan({ ...fixture, config })).rejects.toMatchObject({
      code: 'POINTER_CONFLICT',
    });
  });

  it('surfaces dependency timeouts as retryable and performs no writes', async () => {
    const fixture = makeFixture();
    fixture.source = new FakeSource(
      fixture.source.files,
      new PublicationError('DEPENDENCY_UNAVAILABLE', 'GitHub timed out', true)
    );
    await expect(buildPublicationPlan({ ...fixture, config })).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
      retryable: true,
    });
    expect(fixture.store.writes).toEqual([]);
  });

  it('rejects relative path escape attempts in the wire contract', () => {
    const fixture = makeFixture();
    expect(() =>
      releaseManifestSchema.parse({
        ...fixture.manifest,
        artifacts: [
          {
            ...fixture.manifest.artifacts[0],
            sourcePath: '../escape.sql',
          },
          ...fixture.manifest.artifacts.slice(1),
        ],
      })
    ).toThrow();
  });
});
