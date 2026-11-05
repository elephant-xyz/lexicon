import { readFile } from 'node:fs/promises';

import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';

const [methodArgument, urlArgument, bodyPath] = process.argv.slice(2);
if (
  methodArgument === undefined ||
  urlArgument === undefined ||
  !['GET', 'POST'].includes(methodArgument)
) {
  throw new Error(
    'Usage: npm run model:request -- <GET|POST> <function-url/path> [json-body-file]'
  );
}
const method = methodArgument as 'GET' | 'POST';
if (method === 'POST' && bodyPath === undefined) {
  throw new Error('POST requests require a JSON body file.');
}

const url = new URL(urlArgument);
const region =
  process.env.MODEL_TARGET_REGION ??
  /^.+\.lambda-url\.([a-z0-9-]+)\.on\.aws$/u.exec(url.hostname)?.[1] ??
  'us-east-2';
const body = bodyPath === undefined ? undefined : await readFile(bodyPath, 'utf8');
if (body !== undefined) JSON.parse(body);

const signer = new SignatureV4({
  credentials: defaultProvider(),
  region,
  service: 'lambda',
  sha256: Sha256,
});
const request = new HttpRequest({
  protocol: url.protocol,
  hostname: url.hostname,
  method,
  path: `${url.pathname}${url.search}`,
  headers: {
    host: url.hostname,
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
  },
  body,
});
const signed = await signer.sign(request);
const response = await fetch(url, {
  method,
  headers: signed.headers,
  body,
});
const responseBody = await response.text();
process.stdout.write(`${response.status}\n${responseBody}\n`);
if (!response.ok) process.exitCode = 1;
