import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalize } from 'json-canonicalize';

import {
  generateJSONSchemaForClass,
  generateJSONSchemaForDataGroup,
  generateJSONSchemaForRelationship,
} from '../vite-plugins/json-schema-generator/index';
import type { DataGroupRelationship, LexiconData } from '../src/types/lexicon';

type SchemaType = 'class' | 'relationship' | 'dataGroup';
type Upload = (key: string, body: string) => Promise<string>;

export interface PublishedManifestEntry {
  ipfsCid: string;
  type: SchemaType;
  objectKey: string;
  sha256: string;
  bytes: number;
}

export type PublishedManifest = Record<string, PublishedManifestEntry>;

function entry(type: SchemaType, objectKey: string, body: string, ipfsCid: string) {
  return {
    ipfsCid,
    type,
    objectKey,
    sha256: createHash('sha256').update(body).digest('hex'),
    bytes: Buffer.byteLength(body),
  };
}

async function publish(
  manifest: PublishedManifest,
  upload: Upload,
  name: string,
  fileName: string,
  type: SchemaType,
  body: string
): Promise<string> {
  const bodySha256 = createHash('sha256').update(body).digest('hex');
  const objectKey = `schemas/${bodySha256}/${fileName}`;
  const previous = manifest[name];
  if (previous) {
    if (previous.sha256 !== bodySha256) {
      throw new Error(`Manifest key ${name} maps to conflicting schema bodies`);
    }
    return previous.ipfsCid;
  }

  const ipfsCid = await upload(objectKey, body);
  const next = entry(type, objectKey, body, ipfsCid);
  manifest[name] = next;
  return ipfsCid;
}

export async function publishSchemaCatalog(
  lexiconData: LexiconData,
  upload: Upload
): Promise<PublishedManifest> {
  const blockchainTag = lexiconData.tags.find(tag => tag.name === 'blockchain');
  if (!blockchainTag) throw new Error('Lexicon has no blockchain tag');

  const manifest: PublishedManifest = {};
  const classCids: Record<string, string> = {};

  // Classes and their examples are leaves, so publish them first.
  for (const className of blockchainTag.classes) {
    const lexiconClass = lexiconData.classes.find(candidate => candidate.type === className);
    if (!lexiconClass) throw new Error(`Blockchain class ${className} is not defined`);
    classCids[className] = await publish(
      manifest,
      upload,
      className,
      `${className}.json`,
      'class',
      canonicalize(generateJSONSchemaForClass(lexiconClass))
    );
    if (lexiconClass.example) {
      await publish(
        manifest,
        upload,
        `${className}_example`,
        `${className}_example.json`,
        'class',
        canonicalize(lexiconClass.example)
      );
    }
  }

  // Relationships embed class CIDs, so publish them only after all classes.
  const uniqueRelationships = new Map<string, DataGroupRelationship>();
  for (const dataGroup of lexiconData.data_groups) {
    for (const relationship of dataGroup.relationships || []) {
      if (
        blockchainTag.classes.includes(relationship.from) &&
        blockchainTag.classes.includes(relationship.to)
      ) {
        uniqueRelationships.set(`${relationship.from}_to_${relationship.to}`, relationship);
      }
    }
  }

  const relationshipCids: Record<string, string> = {};
  const relationshipClass = lexiconData.classes.find(
    candidate => candidate.type === 'relationship'
  );
  const relationshipExamples = relationshipClass?.examples || [];

  for (const [relationshipKey, relationship] of uniqueRelationships) {
    relationshipCids[relationshipKey] = await publish(
      manifest,
      upload,
      relationshipKey,
      `${relationshipKey}.json`,
      'relationship',
      canonicalize(generateJSONSchemaForRelationship(relationship, classCids))
    );

    const examples = relationshipExamples.filter(
      example =>
        example.type === relationship.relationship_type || example.type === `has_${relationship.to}`
    );
    for (const example of examples) {
      await publish(
        manifest,
        upload,
        `relationship_${example.type}_example`,
        `${relationshipKey}_${example.type}_example.json`,
        'class',
        canonicalize(example)
      );
    }
  }

  // Data groups embed relationship CIDs and are the final schema layer.
  const allDataGroupLabels = lexiconData.data_groups.map(group => group.label);
  for (const dataGroup of lexiconData.data_groups) {
    const relationships: Record<string, { cid: string; relationshipType: string }> = {};
    for (const relationship of dataGroup.relationships || []) {
      const relationshipKey = `${relationship.from}_to_${relationship.to}`;
      if (relationshipCids[relationshipKey]) {
        relationships[relationshipKey] = {
          cid: relationshipCids[relationshipKey],
          relationshipType: relationship.relationship_type || `has_${relationship.to}`,
        };
      }
    }
    if (Object.keys(relationships).length === 0) continue;

    const groupKey = dataGroup.label.replace(/\s+/g, '_');
    await publish(
      manifest,
      upload,
      groupKey,
      `${groupKey}.json`,
      'dataGroup',
      canonicalize(generateJSONSchemaForDataGroup(dataGroup, relationships, allDataGroupLabels))
    );
    if (dataGroup.example) {
      await publish(
        manifest,
        upload,
        `${groupKey}_example`,
        `${groupKey}_example.json`,
        'class',
        canonicalize(dataGroup.example)
      );
    }
  }

  return manifest;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireCid(value: string | undefined, key: string): string {
  const cid = value?.trim();
  if (!cid || !/^[A-Za-z0-9]{46,120}$/.test(cid)) {
    throw new Error(`Filebase returned an invalid CID for ${key}`);
  }
  return cid;
}

async function uploadFilebaseObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'application/json',
  });
  let headerCid: string | undefined;
  command.middlewareStack.add(
    next => async args => {
      const result = await next(args);
      const response = result.response;
      if (
        typeof response === 'object' &&
        response !== null &&
        'headers' in response &&
        typeof response.headers === 'object' &&
        response.headers !== null
      ) {
        headerCid = (response.headers as Record<string, string>)['x-amz-meta-cid'];
      }
      return result;
    },
    {
      step: 'deserialize',
      name: `capture-filebase-cid-${createHash('sha1').update(key).digest('hex')}`,
    }
  );
  await client.send(command);
  if (headerCid?.trim()) return requireCid(headerCid, key);

  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return requireCid(head.Metadata?.cid, key);
}

async function upsertIpnsName(
  label: string,
  manifestCid: string,
  accessKey: string,
  secretKey: string
): Promise<{ label: string; networkKey: string; cid: string; previousCid: string | null }> {
  const authorization = Buffer.from(`${accessKey}:${secretKey}`).toString('base64');
  const headers = {
    Authorization: `Bearer ${authorization}`,
    'Content-Type': 'application/json',
  };
  const list = await fetch('https://api.filebase.io/v1/names', { headers });
  if (!list.ok) throw new Error(`Filebase Names list returned ${list.status}`);
  const names = (await list.json()) as Array<{
    name?: string;
    label?: string;
    network_key?: string;
    cid?: string;
  }>;
  const existing = names.find(name => (name.label || name.name) === label);
  const response = await fetch(
    existing
      ? `https://api.filebase.io/v1/names/${encodeURIComponent(label)}`
      : 'https://api.filebase.io/v1/names',
    {
      method: existing ? 'PUT' : 'POST',
      headers,
      body: JSON.stringify(
        existing ? { cid: manifestCid } : { label, cid: manifestCid, enabled: true }
      ),
    }
  );
  if (!response.ok) throw new Error(`Filebase Names update returned ${response.status}`);
  const value = (await response.json()) as { network_key?: string };
  const networkKey = value.network_key || existing?.network_key;
  if (!networkKey) throw new Error(`Filebase Names response omitted network_key for ${label}`);
  return {
    label,
    networkKey,
    cid: manifestCid,
    previousCid: existing?.cid || null,
  };
}

async function main(): Promise<void> {
  if (process.env.CONFIRM_FILEBASE_PUBLISH !== 'publish') {
    throw new Error('Set CONFIRM_FILEBASE_PUBLISH=publish to allow remote writes');
  }
  const accessKey = required('FILEBASE_ACCESS_KEY');
  const secretKey = required('FILEBASE_SECRET_KEY');
  const bucket = required('FILEBASE_LEXICON_BUCKET');
  const label = process.env.FILEBASE_LEXICON_IPNS_LABEL?.trim() || 'elephant-lexicon-manifest';
  const endpoint = process.env.FILEBASE_S3_ENDPOINT?.trim() || 'https://s3.filebase.com';
  const lexiconPath = resolve('src/data/lexicon.json');
  const receiptPath = resolve('artifacts/schema-publication.json');

  const lexiconData = JSON.parse(await readFile(lexiconPath, 'utf8')) as LexiconData;
  const client = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  let count = 0;
  const upload: Upload = async (key, body) => {
    const cid = await uploadFilebaseObject(client, bucket, key, body);
    count += 1;
    console.log(`[${count}] ${key} -> ${cid}`);
    return cid;
  };

  const manifest = await publishSchemaCatalog(lexiconData, upload);
  const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestSha256 = createHash('sha256').update(manifestBody).digest('hex');
  const manifestKey = `manifests/${manifestSha256}/schema-manifest.json`;
  const manifestCid = await uploadFilebaseObject(client, bucket, manifestKey, manifestBody);
  const ipns = await upsertIpnsName(label, manifestCid, accessKey, secretKey);

  const receipt = {
    version: 1,
    publishedAt: new Date().toISOString(),
    gitSha: process.env.GITHUB_SHA || null,
    bucket,
    manifest: {
      key: manifestKey,
      cid: manifestCid,
      entries: Object.keys(manifest).length,
      sha256: manifestSha256,
    },
    ipns,
  };
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`Published ${receipt.manifest.entries} schemas.`);
  console.log(`Manifest: https://ipfs.filebase.io/ipfs/${manifestCid}`);
  console.log(`Latest: https://ipfs.filebase.io/ipns/${ipns.networkKey}`);
}

if (!process.env.VITEST) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
