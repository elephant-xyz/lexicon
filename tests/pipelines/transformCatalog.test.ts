import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

type PublicationSchemaRegistration = {
  version: string;
  status: 'ENABLED' | 'DISABLED';
  path: string;
  sha256: string;
};

type LanguageEntry = {
  kind: 'language';
  name: string;
  version: string;
  current: boolean;
  status: 'ENABLED' | 'DISABLED';
  shape: 'tabular';
  path: string;
  sha256: string;
};

type MappingEntry = {
  kind: 'mapping';
  id: string;
  version: string;
  current: boolean;
  status: 'ENABLED' | 'DISABLED';
  from: string;
  to: string;
  path: string;
  sha256: string;
  querySha256?: string;
};

type TransformCatalog = {
  contractVersion: number;
  languageSchema: PublicationSchemaRegistration;
  mappingSchema: PublicationSchemaRegistration;
  documentExtractionSchema: PublicationSchemaRegistration;
  entries: Array<LanguageEntry | MappingEntry>;
};

type PipelineDataset = {
  type: string;
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

type PipelineLanguage = {
  contractVersion: number;
  name: string;
  version: string;
  shape: string;
  datasets: PipelineDataset[];
};

type MappingManifest = {
  contractVersion: number;
  id: string;
  version: string;
  status: 'ENABLED' | 'DISABLED';
  engine: string;
  from: { name: string; version: string };
  to: { name: string; version: string };
  inputs: Array<{
    table: string;
    derivedDataset?: string;
    view: string;
    format: string;
    hydration?: {
      recordsTable: string;
      runManifestTable: string;
    };
    bundle?: {
      bundleDataset: string;
      runDataset: string;
      runView: string;
      recordsDataset: string;
      recordsView: string;
      rawDocumentsDataset: string;
      rawDocumentsView: string;
    };
  }>;
  documentExtraction?: {
    configPath: string;
    configSha256: string;
  };
  output: { shape: string; format: string };
  outputs: Array<{
    dataset: string;
    dependsOn: string[];
    queryPath: string;
    querySha256: string;
    determinism?: {
      status: string;
      runtimeFunctions: string[];
    };
  }>;
};

const transformRoot = path.resolve(process.cwd(), 'publish', 'pipelines', 'transform');
const catalog = readJson<TransformCatalog>(path.join(transformRoot, 'catalog.json'));
const semverPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function resolvePinnedPath(relativePath: string): string {
  const resolved = path.resolve(transformRoot, relativePath);
  expect(resolved.startsWith(`${transformRoot}${path.sep}`)).toBe(true);
  return resolved;
}

describe('Transform pipeline catalog publication', () => {
  it('pins authoritative language, mapping, and extraction schemas', () => {
    expect(catalog.contractVersion).toBe(2);
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const schemas = [
      ['pipeline-language', catalog.languageSchema],
      ['pipeline-mapping', catalog.mappingSchema],
      ['document-extraction', catalog.documentExtractionSchema],
    ] as const;
    for (const [name, registration] of schemas) {
      expect(registration.status).toBe('ENABLED');
      expect(semverPattern.test(registration.version)).toBe(true);
      expect(registration.path).toBe(`schemas/${name}/${registration.version}/schema.json`);
      const schemaPath = resolvePinnedPath(registration.path);
      expect(sha256(schemaPath)).toBe(registration.sha256);
      expect(() => ajv.compile(readJson<object>(schemaPath))).not.toThrow();
    }
  });

  it('validates immutable language identities, paths, shapes, and digests', () => {
    const schemaPath = resolvePinnedPath(catalog.languageSchema.path);
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validateLanguage = ajv.compile(readJson<object>(schemaPath));
    const identities = new Set<string>();
    const enabledCurrentNames = new Set<string>();

    for (const entry of catalog.entries) {
      if (entry.kind !== 'language') continue;

      const identity = `${entry.name}@${entry.version}`;
      expect(identities.has(identity), `duplicate language ${identity}`).toBe(false);
      identities.add(identity);
      expect(semverPattern.test(entry.version)).toBe(true);
      expect(entry.path).toBe(`languages/${entry.name}/${entry.version}/${entry.name}.json`);

      const artifactPath = resolvePinnedPath(entry.path);
      expect(sha256(artifactPath), identity).toBe(entry.sha256);
      const language = readJson<PipelineLanguage>(artifactPath);
      expect(validateLanguage(language), JSON.stringify(validateLanguage.errors)).toBe(true);
      expect(language).toMatchObject({
        contractVersion: 2,
        name: entry.name,
        version: entry.version,
        shape: entry.shape,
      });
      expect(language).not.toHaveProperty('vertices');
      expect(language).not.toHaveProperty('edges');

      const datasetNames = new Set<string>();
      for (const dataset of language.datasets) {
        expect(
          datasetNames.has(dataset.type),
          `duplicate dataset ${identity}:${dataset.type}`
        ).toBe(false);
        datasetNames.add(dataset.type);
        for (const requiredColumn of dataset.required) {
          expect(
            Object.hasOwn(dataset.properties, requiredColumn),
            `${identity}:${dataset.type} requires unknown column ${requiredColumn}`
          ).toBe(true);
        }
      }

      if (entry.current && entry.status === 'ENABLED') {
        expect(
          enabledCurrentNames.has(entry.name),
          `multiple enabled current versions for ${entry.name}`
        ).toBe(false);
        enabledCurrentNames.add(entry.name);
      }
    }
  });

  it('validates mapping references, directional uniqueness, and SQL digests', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validateMapping = ajv.compile(
      readJson<object>(resolvePinnedPath(catalog.mappingSchema.path))
    );
    const validateExtraction = ajv.compile(
      readJson<object>(resolvePinnedPath(catalog.documentExtractionSchema.path))
    );
    const languages = new Map<string, PipelineLanguage>();
    for (const entry of catalog.entries) {
      if (entry.kind !== 'language') continue;
      languages.set(
        `${entry.name}@${entry.version}`,
        readJson<PipelineLanguage>(resolvePinnedPath(entry.path))
      );
    }

    const mappingIdentities = new Set<string>();
    const enabledPairs = new Set<string>();
    for (const entry of catalog.entries) {
      if (entry.kind !== 'mapping') continue;

      const identity = `${entry.id}@${entry.version}`;
      expect(mappingIdentities.has(identity), `duplicate mapping ${identity}`).toBe(false);
      mappingIdentities.add(identity);
      expect(semverPattern.test(entry.version)).toBe(true);
      expect(entry.path).toBe(`mappings/${entry.id}/${entry.version}/manifest.json`);

      const manifestPath = resolvePinnedPath(entry.path);
      expect(sha256(manifestPath), identity).toBe(entry.sha256);
      const manifest = readJson<MappingManifest>(manifestPath);
      expect(validateMapping(manifest), JSON.stringify(validateMapping.errors)).toBe(true);
      expect(manifest).toMatchObject({
        contractVersion: 2,
        id: entry.id,
        version: entry.version,
        status: entry.status,
        engine: 'spark-sql',
        from: { name: entry.from },
        to: { name: entry.to },
      });

      const fromIdentity = `${manifest.from.name}@${manifest.from.version}`;
      const toIdentity = `${manifest.to.name}@${manifest.to.version}`;
      const fromLanguage = languages.get(fromIdentity);
      const toLanguage = languages.get(toIdentity);
      expect(fromLanguage, `missing source language ${fromIdentity}`).toBeDefined();
      expect(toLanguage, `missing target language ${toIdentity}`).toBeDefined();

      const sourceDatasets = new Set(fromLanguage?.datasets.map(dataset => dataset.type));
      const targetDatasets = new Set(toLanguage?.datasets.map(dataset => dataset.type));
      for (const input of manifest.inputs) {
        if (input.format === 'raw-artifacts') {
          expect(input.derivedDataset, `${identity} raw derived dataset`).toBeDefined();
          expect(
            sourceDatasets.has(input.derivedDataset!),
            `${identity} references unknown derived dataset ${input.derivedDataset}`
          ).toBe(true);
          expect(
            sourceDatasets.has(input.hydration?.recordsTable ?? ''),
            `${identity} references unknown hydration records table`
          ).toBe(true);
          expect(
            sourceDatasets.has(input.hydration?.runManifestTable ?? ''),
            `${identity} references unknown hydration manifest table`
          ).toBe(true);
        } else if (input.format === 'acquisition-bundle') {
          expect(input.bundle, `${identity} bundle adapter`).toBeDefined();
          expect(input.table).toBe(input.bundle?.bundleDataset);
          expect(input.derivedDataset).toBe(input.bundle?.recordsDataset);
          expect(input.view).toBe(input.bundle?.recordsView);
          for (const derivedDataset of [
            input.bundle?.bundleDataset,
            input.bundle?.runDataset,
            input.bundle?.recordsDataset,
            input.bundle?.rawDocumentsDataset,
          ]) {
            expect(
              sourceDatasets.has(derivedDataset ?? ''),
              `${identity} references unknown bundle dataset ${derivedDataset}`
            ).toBe(true);
          }
        } else {
          expect(
            sourceDatasets.has(input.table),
            `${identity} references unknown input ${input.table}`
          ).toBe(true);
        }
      }

      const adapterInput = manifest.inputs.find(input =>
        ['raw-artifacts', 'acquisition-bundle'].includes(input.format)
      );
      if (adapterInput === undefined) {
        expect(manifest.documentExtraction).toBeUndefined();
      } else {
        expect(manifest.documentExtraction).toBeDefined();
        const extractionPath = path.resolve(
          path.dirname(manifestPath),
          manifest.documentExtraction!.configPath
        );
        expect(extractionPath.startsWith(`${path.dirname(manifestPath)}${path.sep}`)).toBe(true);
        expect(sha256(extractionPath)).toBe(manifest.documentExtraction!.configSha256);
        const extraction = readJson<Record<string, unknown>>(extractionPath);
        expect(validateExtraction(extraction), JSON.stringify(validateExtraction.errors)).toBe(
          true
        );
        expect(extraction.sourceView).toBe(
          adapterInput.bundle?.rawDocumentsView ?? adapterInput.view
        );
      }

      const declaredOutputNames = new Set(manifest.outputs.map(output => output.dataset));
      const outputNames = new Set<string>();
      const queryDigests: string[] = [];
      for (const output of manifest.outputs) {
        expect(
          outputNames.has(output.dataset),
          `${identity} repeats output ${output.dataset}`
        ).toBe(false);
        outputNames.add(output.dataset);
        expect(
          targetDatasets.has(output.dataset),
          `${identity} references unknown output ${output.dataset}`
        ).toBe(true);
        for (const dependency of output.dependsOn) {
          expect(
            declaredOutputNames.has(dependency),
            `${identity}:${output.dataset} depends on unknown output ${dependency}`
          ).toBe(true);
          expect(dependency).not.toBe(output.dataset);
        }
        expect(output.queryPath).toMatch(/^queries\/[A-Za-z0-9._/-]+$/u);
        expect(output.queryPath).not.toContain('..');

        const queryPath = path.resolve(path.dirname(manifestPath), output.queryPath);
        expect(queryPath.startsWith(`${path.dirname(manifestPath)}${path.sep}`)).toBe(true);
        expect(sha256(queryPath), `${identity}:${output.dataset}`).toBe(output.querySha256);
        queryDigests.push(output.querySha256);
      }
      if (entry.querySha256 !== undefined) {
        expect(queryDigests).toContain(entry.querySha256);
      }

      if (entry.current && entry.status === 'ENABLED') {
        const pair = `${fromIdentity}->${toIdentity}`;
        expect(enabledPairs.has(pair), `multiple enabled mappings for ${pair}`).toBe(false);
        enabledPairs.add(pair);
      }
    }
  });

  it('requires complete bundle adapters without weakening ordinary inputs', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validateMapping = ajv.compile(
      readJson<object>(resolvePinnedPath(catalog.mappingSchema.path))
    );
    const candidate = readJson<Record<string, unknown>>(
      resolvePinnedPath(
        'mappings/connect-http-acquisition-bundle-to-sale-availability-inference-input/1.0.0/manifest.json'
      )
    );
    expect(validateMapping(candidate), JSON.stringify(validateMapping.errors)).toBe(true);

    const missingExtraction = cloneJson(candidate);
    delete missingExtraction.documentExtraction;
    expect(validateMapping(missingExtraction)).toBe(false);

    const missingDerivedDataset = cloneJson(candidate) as {
      inputs: Array<Record<string, unknown>>;
    };
    delete missingDerivedDataset.inputs[0]?.derivedDataset;
    expect(validateMapping(missingDerivedDataset)).toBe(false);

    const missingBundle = cloneJson(candidate) as {
      inputs: Array<Record<string, unknown>>;
    };
    delete missingBundle.inputs[0]?.bundle;
    expect(validateMapping(missingBundle)).toBe(false);

    const ordinary = readJson<Record<string, unknown>>(
      resolvePinnedPath('mappings/crm-to-warehouse/1.0.0/manifest.json')
    );
    expect(validateMapping(ordinary), JSON.stringify(validateMapping.errors)).toBe(true);
  });
});
