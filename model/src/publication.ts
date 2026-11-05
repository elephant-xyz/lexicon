import path from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';

import {
  governedCatalogSchema,
  governedMappingManifestSchema,
  type ArtifactDeclaration,
  type GovernedCatalog,
  type GovernedMappingManifest,
  type PublicationReceipt,
  type ReleaseManifest,
} from './contracts.js';
import { PublicationError } from './errors.js';
import {
  canonicalBytes,
  parseJson,
  parseS3Uri,
  resolveRelativeKey,
  sameBytes,
  sha256,
} from './util.js';

const addFormats = addFormatsImport as unknown as (ajv: Ajv2020) => Ajv2020;

export interface SourceApproval {
  repository: string;
  revision: string;
  pullRequest: number;
  approvals: number;
  checks: number;
}

export interface SourceRepository {
  verifyApproval(manifest: ReleaseManifest): Promise<SourceApproval>;
  readFile(repository: string, revision: string, sourcePath: string): Promise<Uint8Array>;
}

export interface StoredArtifact {
  key: string;
  bytes: Uint8Array;
  sha256: string;
  size: number;
  contentType: string;
  versionId: string;
}

export interface ArtifactStore {
  read(key: string, versionId?: string): Promise<StoredArtifact | undefined>;
  writeImmutable(
    declaration: ArtifactDeclaration,
    bytes: Uint8Array,
    metadata: Record<string, string>
  ): Promise<StoredArtifact>;
}

export interface PointerValue {
  name: string;
  version: number;
  value: string;
}

export interface PointerStore {
  read(name: string): Promise<PointerValue>;
  compareAndSet(input: {
    scope: string;
    operationId: string;
    expected: PointerValue;
    requestedValue: string;
  }): Promise<PointerValue>;
}

export interface PublicationConfig {
  accountId: string;
  region: string;
  stage: string;
  artifactBucketName: string;
  destinationPrefix: string;
  sourceRoot: string;
  allowedRepository: string;
  pointerName: string;
  receiptPrefix: string;
}

export interface PlannedArtifact {
  declaration: ArtifactDeclaration;
  action: 'WRITE' | 'REUSE';
  existingVersionId?: string;
}

export interface PublicationPlan {
  releaseId: string;
  stage: string;
  catalogIdentity: string;
  sourceApproval: SourceApproval;
  artifacts: PlannedArtifact[];
  dependencyCount: number;
  priorPointer: PointerValue;
  requestedPointer: string;
  priorCatalog: {
    key: string;
    versionId: string;
    sha256: string;
  };
  alreadyPublished: boolean;
}

interface LoadedLanguage {
  contractVersion: number;
  name: string;
  version: string;
  shape: string;
  datasets: Array<{
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  }>;
}

function invalid(message: string): never {
  throw new PublicationError('INVALID_RELEASE', message);
}

function normalizedPrefix(value: string): string {
  const normalized = path.posix.normalize(value).replace(/^\/+|\/+$/gu, '');
  if (normalized.length === 0 || normalized.startsWith('../')) {
    invalid(`Invalid configured prefix '${value}'`);
  }
  return normalized;
}

function expectedSourceBase(config: PublicationConfig, catalogIdentity: string): string {
  return `${normalizedPrefix(config.sourceRoot)}/${catalogIdentity}`;
}

function expectedDestinationBase(config: PublicationConfig, catalogIdentity: string): string {
  return `${normalizedPrefix(config.destinationPrefix)}/${catalogIdentity}`;
}

function assertManifestBoundary(manifest: ReleaseManifest, config: PublicationConfig): void {
  if (
    manifest.stage !== config.stage ||
    manifest.target.accountId !== config.accountId ||
    manifest.target.region !== config.region
  ) {
    throw new PublicationError(
      'UNAUTHORIZED',
      'Release stage, account, or region does not match this deployment'
    );
  }
  if (manifest.source.repository !== config.allowedRepository) {
    throw new PublicationError(
      'UNAUTHORIZED',
      `Repository '${manifest.source.repository}' is not authorized`
    );
  }
  if (
    manifest.expectedPriorPointer.parameterName !== config.pointerName ||
    manifest.requestedPointer.parameterName !== config.pointerName
  ) {
    invalid(`Release must use pointer '${config.pointerName}'`);
  }

  const sourceBase = expectedSourceBase(config, manifest.catalogIdentity);
  const destinationBase = expectedDestinationBase(config, manifest.catalogIdentity);
  const expectedCatalogSource = `${sourceBase}/catalog.json`;
  const expectedCatalogKey = `${destinationBase}/catalog.${manifest.catalog.sha256}.json`;
  if (
    manifest.catalog.sourcePath !== expectedCatalogSource ||
    manifest.catalog.destinationKey !== expectedCatalogKey ||
    manifest.catalog.contentType !== 'application/json'
  ) {
    invalid(
      `Catalog must map '${expectedCatalogSource}' to digest-addressed key '${expectedCatalogKey}'`
    );
  }

  for (const artifact of manifest.artifacts) {
    if (!artifact.sourcePath.startsWith(`${sourceBase}/`)) {
      invalid(`Source artifact '${artifact.sourcePath}' is outside '${sourceBase}'`);
    }
    const relative = artifact.sourcePath.slice(sourceBase.length + 1);
    const expectedKey = `${destinationBase}/${relative}`;
    if (artifact.destinationKey !== expectedKey) {
      invalid(`Artifact '${artifact.sourcePath}' must publish to '${expectedKey}'`);
    }
    const expectedType = artifact.sourcePath.endsWith('.json')
      ? 'application/json'
      : artifact.sourcePath.endsWith('.sql')
        ? 'text/sql; charset=utf-8'
        : 'text/plain; charset=utf-8';
    if (artifact.contentType !== expectedType) {
      invalid(`Artifact '${artifact.sourcePath}' must use content type '${expectedType}'`);
    }
  }

  const requested = parseS3Uri(manifest.requestedPointer.value);
  if (
    requested.bucket !== config.artifactBucketName ||
    requested.key !== manifest.catalog.destinationKey
  ) {
    invalid('Requested pointer must select the declared catalog in the configured bucket');
  }
  const prior = parseS3Uri(manifest.expectedPriorPointer.value);
  if (prior.bucket !== config.artifactBucketName || !prior.key.startsWith(`${destinationBase}/`)) {
    invalid("Expected prior pointer must select this catalog's isolated destination");
  }
}

async function loadSourceArtifacts(
  manifest: ReleaseManifest,
  source: SourceRepository
): Promise<Map<string, Uint8Array>> {
  const loaded = new Map<string, Uint8Array>();
  await Promise.all(
    [manifest.catalog, ...manifest.artifacts].map(async declaration => {
      const bytes = await source.readFile(
        manifest.source.repository,
        manifest.source.revision,
        declaration.sourcePath
      );
      const actualDigest = sha256(bytes);
      if (actualDigest !== declaration.sha256 || bytes.byteLength !== declaration.size) {
        throw new PublicationError(
          'ARTIFACT_DIGEST_MISMATCH',
          `Source artifact '${declaration.sourcePath}' does not match its declared digest and size`
        );
      }
      loaded.set(declaration.destinationKey, bytes);
    })
  );
  return loaded;
}

function catalogLocationKey(
  entry: { path?: string; s3Uri?: string },
  catalogKey: string,
  config: PublicationConfig,
  destinationBase: string
): string {
  if (entry.path !== undefined) {
    return resolveRelativeKey(catalogKey, entry.path);
  }
  if (entry.s3Uri === undefined) {
    return invalid('Catalog entry has no artifact location');
  }
  const location = parseS3Uri(entry.s3Uri);
  if (
    location.bucket !== config.artifactBucketName ||
    !location.key.startsWith(`${destinationBase}/`)
  ) {
    return invalid(`Catalog artifact '${entry.s3Uri}' escapes the stage boundary`);
  }
  return location.key;
}

async function loadPinnedDependency(input: {
  key: string;
  expectedSha256: string;
  bundle: Map<string, Uint8Array>;
  store: ArtifactStore;
  dependencies: Set<string>;
}): Promise<Uint8Array> {
  input.dependencies.add(input.key);
  const bundled = input.bundle.get(input.key);
  if (bundled !== undefined) {
    if (sha256(bundled) !== input.expectedSha256) {
      throw new PublicationError(
        'ARTIFACT_DIGEST_MISMATCH',
        `Bundled dependency '${input.key}' has an unexpected digest`
      );
    }
    return bundled;
  }
  const stored = await input.store.read(input.key);
  if (stored === undefined) {
    invalid(`Catalog dependency '${input.key}' does not exist`);
  }
  if (stored.sha256 !== input.expectedSha256) {
    throw new PublicationError(
      'ARTIFACT_DIGEST_MISMATCH',
      `Stored dependency '${input.key}' does not match catalog digest`
    );
  }
  return stored.bytes;
}

function parseLanguage(bytes: Uint8Array, description: string): LoadedLanguage {
  const value = parseJson(bytes, description);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(`${description} must be an object`);
  }
  return value as LoadedLanguage;
}

function assertLanguageSemantics(language: LoadedLanguage, description: string): void {
  const datasetNames = new Set<string>();
  for (const dataset of language.datasets) {
    if (datasetNames.has(dataset.type)) {
      invalid(`${description} repeats dataset '${dataset.type}'`);
    }
    datasetNames.add(dataset.type);
    const required = new Set<string>();
    for (const property of dataset.required) {
      if (!Object.hasOwn(dataset.properties, property)) {
        invalid(`${description} requires unknown property '${property}'`);
      }
      if (required.has(property)) {
        invalid(`${description} repeats required property '${property}'`);
      }
      required.add(property);
    }
  }
}

function queryDeclarations(
  output: GovernedMappingManifest['outputs'][number]
): Array<{ queryPath: string; querySha256: string }> {
  if (output.queries !== undefined) {
    return output.queries;
  }
  if (output.queryPath !== undefined && output.querySha256 !== undefined) {
    return [{ queryPath: output.queryPath, querySha256: output.querySha256 }];
  }
  return invalid(`Mapping output '${output.dataset}' has no query`);
}

function assertMappingSemantics(input: {
  mapping: GovernedMappingManifest;
  entry: Extract<GovernedCatalog['entries'][number], { kind: 'mapping' }>;
  languages: Map<string, LoadedLanguage>;
}): void {
  const { mapping, entry, languages } = input;
  if (
    mapping.id !== entry.id ||
    mapping.version !== entry.version ||
    mapping.status !== entry.status ||
    mapping.from.name !== entry.from ||
    mapping.to.name !== entry.to
  ) {
    invalid(`Mapping '${entry.id}@${entry.version}' does not match its catalog entry`);
  }
  const source = languages.get(`${mapping.from.name}@${mapping.from.version}`);
  const target = languages.get(`${mapping.to.name}@${mapping.to.version}`);
  if (source === undefined || target === undefined) {
    invalid(`Mapping '${mapping.id}@${mapping.version}' references an unknown language`);
  }
  if (mapping.output.shape !== target.shape) {
    invalid(`Mapping '${mapping.id}@${mapping.version}' output shape is incompatible`);
  }
  const sourceDatasets = new Set(source.datasets.map(dataset => dataset.type));
  const targetDatasets = new Set(target.datasets.map(dataset => dataset.type));
  const inputTables = new Set<string>();
  const inputViews = new Set<string>();
  for (const mappingInput of mapping.inputs) {
    if (
      !sourceDatasets.has(mappingInput.table) ||
      inputTables.has(mappingInput.table) ||
      inputViews.has(mappingInput.view)
    ) {
      invalid(`Mapping '${mapping.id}@${mapping.version}' has invalid or duplicate inputs`);
    }
    inputTables.add(mappingInput.table);
    inputViews.add(mappingInput.view);
  }
  const outputNames = new Set<string>();
  const queryDigests = new Set<string>();
  for (const output of mapping.outputs) {
    if (!targetDatasets.has(output.dataset) || outputNames.has(output.dataset)) {
      invalid(`Mapping '${mapping.id}@${mapping.version}' has invalid or duplicate outputs`);
    }
    outputNames.add(output.dataset);
    for (const query of queryDeclarations(output)) {
      queryDigests.add(query.querySha256);
    }
  }
  for (const output of mapping.outputs) {
    if (output.dependsOn.some(dependency => !outputNames.has(dependency))) {
      invalid(`Mapping output '${output.dataset}' depends on an unknown output`);
    }
  }
  const pending = new Set(outputNames);
  const resolved = new Set<string>();
  while (pending.size > 0) {
    const ready = mapping.outputs.filter(
      output =>
        pending.has(output.dataset) &&
        output.dependsOn.every(dependency => resolved.has(dependency))
    );
    if (ready.length === 0) {
      invalid(`Mapping '${mapping.id}@${mapping.version}' has cyclic dependencies`);
    }
    for (const output of ready) {
      pending.delete(output.dataset);
      resolved.add(output.dataset);
    }
  }
  if (mapping.output.delivery !== undefined && !outputNames.has(mapping.output.delivery.dataset)) {
    invalid(`Mapping '${mapping.id}@${mapping.version}' has invalid inline delivery`);
  }
  if (entry.querySha256 !== undefined && !queryDigests.has(entry.querySha256)) {
    invalid(`Mapping '${mapping.id}@${mapping.version}' does not contain querySha256`);
  }
}

function assertCatalogCurrentRules(catalog: GovernedCatalog): void {
  const identities = new Set<string>();
  const languages = new Map<string, number>();
  const mappings = new Map<string, number>();
  const currentPairs = new Set<string>();
  for (const entry of catalog.entries) {
    const identity =
      entry.kind === 'language'
        ? `language:${entry.name}@${entry.version}`
        : `mapping:${entry.id}@${entry.version}`;
    if (identities.has(identity)) {
      invalid(`Duplicate catalog identity '${identity}'`);
    }
    identities.add(identity);
    if (entry.kind === 'language') {
      languages.set(entry.name, (languages.get(entry.name) ?? 0) + Number(entry.current));
      continue;
    }
    mappings.set(entry.id, (mappings.get(entry.id) ?? 0) + Number(entry.current));
    if (entry.current && entry.status === 'ENABLED') {
      const pair = `${entry.from}->${entry.to}`;
      if (currentPairs.has(pair)) {
        invalid(`Multiple enabled current mappings exist for '${pair}'`);
      }
      currentPairs.add(pair);
    }
  }
  for (const [name, currentCount] of languages) {
    if (currentCount !== 1) invalid(`Language '${name}' must have exactly one current version`);
  }
  for (const [id, currentCount] of mappings) {
    if (currentCount !== 1) invalid(`Mapping '${id}' must have exactly one current version`);
  }
}

async function validateCatalogClosure(input: {
  catalog: GovernedCatalog;
  catalogKey: string;
  bundle: Map<string, Uint8Array>;
  store: ArtifactStore;
  config: PublicationConfig;
  catalogIdentity: string;
}): Promise<Set<string>> {
  const dependencies = new Set<string>([input.catalogKey]);
  const destinationBase = expectedDestinationBase(input.config, input.catalogIdentity);
  assertCatalogCurrentRules(input.catalog);

  const schemaKey = resolveRelativeKey(input.catalogKey, input.catalog.languageSchema.path);
  const languageSchemaBytes = await loadPinnedDependency({
    key: schemaKey,
    expectedSha256: input.catalog.languageSchema.sha256,
    bundle: input.bundle,
    store: input.store,
    dependencies,
  });
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  let validateLanguage: ReturnType<typeof ajv.compile>;
  try {
    validateLanguage = ajv.compile(
      parseJson(languageSchemaBytes, 'Pipeline language schema') as object
    );
  } catch {
    return invalid('Pipeline language JSON Schema cannot be compiled');
  }

  const languages = new Map<string, LoadedLanguage>();
  const mappings: Array<{
    entry: Extract<GovernedCatalog['entries'][number], { kind: 'mapping' }>;
    key: string;
    manifest: GovernedMappingManifest;
  }> = [];
  for (const entry of input.catalog.entries) {
    const key = catalogLocationKey(entry, input.catalogKey, input.config, destinationBase);
    const bytes = await loadPinnedDependency({
      key,
      expectedSha256: entry.sha256,
      bundle: input.bundle,
      store: input.store,
      dependencies,
    });
    if (entry.kind === 'language') {
      const parsed = parseLanguage(bytes, `Language '${entry.name}@${entry.version}'`);
      if (!validateLanguage(parsed)) {
        invalid(`Language '${entry.name}@${entry.version}' does not match its schema`);
      }
      if (
        parsed.contractVersion !== 2 ||
        parsed.name !== entry.name ||
        parsed.version !== entry.version ||
        parsed.shape !== entry.shape
      ) {
        invalid(`Language '${entry.name}@${entry.version}' identity does not match`);
      }
      assertLanguageSemantics(parsed, `Language '${entry.name}@${entry.version}'`);
      languages.set(`${entry.name}@${entry.version}`, parsed);
    } else {
      const manifest = governedMappingManifestSchema.parse(
        parseJson(bytes, `Mapping '${entry.id}@${entry.version}'`)
      );
      mappings.push({ entry, key, manifest });
    }
  }

  for (const mapping of mappings) {
    assertMappingSemantics({
      mapping: mapping.manifest,
      entry: mapping.entry,
      languages,
    });
    const manifestDirectory = path.posix.dirname(mapping.key);
    for (const output of mapping.manifest.outputs) {
      for (const query of queryDeclarations(output)) {
        await loadPinnedDependency({
          key: resolveRelativeKey(mapping.key, query.queryPath),
          expectedSha256: query.querySha256,
          bundle: input.bundle,
          store: input.store,
          dependencies,
        });
      }
      for (const evidence of output.invariantEvidence ?? []) {
        const outputQueries = new Set(queryDeclarations(output).map(query => query.querySha256));
        if (evidence.querySha256s.some(digest => !outputQueries.has(digest))) {
          invalid(
            `Invariant '${evidence.invariant}' references a query outside '${output.dataset}'`
          );
        }
        for (const test of evidence.tests) {
          const key = path.posix.join(manifestDirectory, test.path);
          await loadPinnedDependency({
            key,
            expectedSha256: test.sha256,
            bundle: input.bundle,
            store: input.store,
            dependencies,
          });
        }
      }
    }
  }
  return dependencies;
}

export async function buildPublicationPlan(input: {
  manifest: ReleaseManifest;
  config: PublicationConfig;
  source: SourceRepository;
  store: ArtifactStore;
  pointerStore: PointerStore;
}): Promise<PublicationPlan> {
  assertManifestBoundary(input.manifest, input.config);
  const sourceApproval = await input.source.verifyApproval(input.manifest);
  const bundle = await loadSourceArtifacts(input.manifest, input.source);
  const catalogBytes = bundle.get(input.manifest.catalog.destinationKey);
  if (catalogBytes === undefined) invalid('Catalog bytes were not loaded');
  const catalog = governedCatalogSchema.parse(parseJson(catalogBytes, 'Catalog'));
  if (
    catalog.publisher !==
      input.manifest.source.repository
        .replace(/^https:\/\/github\.com\//u, '')
        .replace(/\.git$/u, '') ||
    catalog.repository.replace(/\.git$/u, '') !==
      input.manifest.source.repository.replace(/\.git$/u, '') ||
    catalog.ssMPointer !== input.config.pointerName
  ) {
    invalid('Catalog publisher, repository, or pointer is not authorized');
  }

  const currentPointer = await input.pointerStore.read(input.config.pointerName);
  const alreadyPublished = currentPointer.value === input.manifest.requestedPointer.value;
  if (
    !alreadyPublished &&
    (currentPointer.version !== input.manifest.expectedPriorPointer.version ||
      currentPointer.value !== input.manifest.expectedPriorPointer.value)
  ) {
    throw new PublicationError(
      'POINTER_CONFLICT',
      "Current pointer does not match the release's expected prior pointer"
    );
  }

  const priorLocation = parseS3Uri(input.manifest.expectedPriorPointer.value);
  const priorCatalog = await input.store.read(
    priorLocation.key,
    input.manifest.expectedPriorPointer.catalogVersionId
  );
  if (
    priorCatalog === undefined ||
    priorCatalog.sha256 !== input.manifest.expectedPriorPointer.catalogSha256
  ) {
    throw new PublicationError(
      'ARTIFACT_DIGEST_MISMATCH',
      'Expected prior catalog cannot be verified'
    );
  }
  if (
    input.manifest.expectedPriorPointer.catalogVersionId !== undefined &&
    priorCatalog.versionId !== input.manifest.expectedPriorPointer.catalogVersionId
  ) {
    invalid('Expected prior catalog VersionId does not match');
  }

  const dependencies = await validateCatalogClosure({
    catalog,
    catalogKey: input.manifest.catalog.destinationKey,
    bundle,
    store: input.store,
    config: input.config,
    catalogIdentity: input.manifest.catalogIdentity,
  });
  for (const key of bundle.keys()) {
    if (!dependencies.has(key)) {
      invalid(`Declared artifact '${key}' is not reachable from the catalog`);
    }
  }

  const artifacts: PlannedArtifact[] = [];
  for (const declaration of [input.manifest.catalog, ...input.manifest.artifacts]) {
    const existing = await input.store.read(declaration.destinationKey);
    if (existing === undefined) {
      artifacts.push({ declaration, action: 'WRITE' });
      continue;
    }
    const bytes = bundle.get(declaration.destinationKey);
    if (
      bytes === undefined ||
      existing.sha256 !== declaration.sha256 ||
      existing.size !== declaration.size ||
      !sameBytes(existing.bytes, bytes)
    ) {
      throw new PublicationError(
        'ARTIFACT_CONFLICT',
        `Destination '${declaration.destinationKey}' already contains different bytes`
      );
    }
    artifacts.push({
      declaration,
      action: 'REUSE',
      existingVersionId: existing.versionId,
    });
  }

  return {
    releaseId: input.manifest.releaseId,
    stage: input.manifest.stage,
    catalogIdentity: input.manifest.catalogIdentity,
    sourceApproval,
    artifacts,
    dependencyCount: dependencies.size,
    priorPointer: currentPointer,
    requestedPointer: input.manifest.requestedPointer.value,
    priorCatalog: {
      key: priorCatalog.key,
      versionId: priorCatalog.versionId,
      sha256: priorCatalog.sha256,
    },
    alreadyPublished,
  };
}

export function receiptKey(config: PublicationConfig, manifest: ReleaseManifest): string {
  return `${normalizedPrefix(config.receiptPrefix)}/${manifest.stage}/${manifest.catalogIdentity}/${manifest.releaseId}.json`;
}

export async function publishRelease(input: {
  operationId: string;
  actor: { accountId: string; arn: string };
  submittedAt: string;
  manifest: ReleaseManifest;
  plan: PublicationPlan;
  config: PublicationConfig;
  source: SourceRepository;
  store: ArtifactStore;
  pointerStore: PointerStore;
}): Promise<{
  receipt: PublicationReceipt;
  receiptObject: Omit<StoredArtifact, 'bytes'>;
}> {
  const bundle = await loadSourceArtifacts(input.manifest, input.source);
  const declarations = [input.manifest.catalog, ...input.manifest.artifacts];
  const catalog = declarations[0] as ArtifactDeclaration;
  const nonCatalog = declarations.slice(1);
  const written: StoredArtifact[] = [];
  for (const declaration of nonCatalog) {
    const bytes = bundle.get(declaration.destinationKey);
    if (bytes === undefined) invalid(`Missing source bytes for '${declaration.sourcePath}'`);
    written.push(
      await input.store.writeImmutable(declaration, bytes, {
        'model-release-id': input.manifest.releaseId,
        'source-revision': input.manifest.source.revision,
      })
    );
  }
  const catalogBytes = bundle.get(catalog.destinationKey);
  if (catalogBytes === undefined) invalid('Missing source catalog bytes');
  written.push(
    await input.store.writeImmutable(catalog, catalogBytes, {
      'model-release-id': input.manifest.releaseId,
      'source-revision': input.manifest.source.revision,
    })
  );

  const pointer = input.plan.alreadyPublished
    ? await input.pointerStore.read(input.config.pointerName)
    : await input.pointerStore.compareAndSet({
        scope: `${input.manifest.stage}#${input.manifest.catalogIdentity}`,
        operationId: input.operationId,
        expected: {
          name: input.config.pointerName,
          version: input.manifest.expectedPriorPointer.version,
          value: input.manifest.expectedPriorPointer.value,
        },
        requestedValue: input.manifest.requestedPointer.value,
      });
  if (pointer.value !== input.manifest.requestedPointer.value) {
    throw new PublicationError(
      'POINTER_CONFLICT',
      'Pointer readback does not match the requested catalog'
    );
  }

  const receipt: PublicationReceipt = {
    contractVersion: 1,
    releaseId: input.manifest.releaseId,
    stage: input.manifest.stage,
    catalogIdentity: input.manifest.catalogIdentity,
    actor: input.actor,
    submittedAt: input.submittedAt,
    publishedAt: input.submittedAt,
    source: input.plan.sourceApproval,
    objects: written
      .map(object => ({
        key: object.key,
        versionId: object.versionId,
        sha256: object.sha256,
        size: object.size,
        contentType: object.contentType as ArtifactDeclaration['contentType'],
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    pointer: {
      name: pointer.name,
      priorVersion: input.manifest.expectedPriorPointer.version,
      version: pointer.version,
      value: pointer.value,
    },
    rollbackTarget: {
      pointerValue: input.manifest.expectedPriorPointer.value,
      pointerVersion: input.manifest.expectedPriorPointer.version,
      catalogSha256: input.plan.priorCatalog.sha256,
      catalogVersionId: input.plan.priorCatalog.versionId,
    },
  };
  const bytes = canonicalBytes(receipt);
  const declaration: ArtifactDeclaration = {
    sourcePath: receiptKey(input.config, input.manifest),
    destinationKey: receiptKey(input.config, input.manifest),
    sha256: sha256(bytes),
    size: bytes.byteLength,
    contentType: 'application/json',
  };
  const receiptObject = await input.store.writeImmutable(declaration, bytes, {
    'model-release-id': input.manifest.releaseId,
    'source-revision': input.manifest.source.revision,
  });
  const { bytes: _bytes, ...metadata } = receiptObject;
  return { receipt, receiptObject: metadata };
}
