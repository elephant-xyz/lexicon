import fetch from 'node-fetch';
import FormData from 'form-data';

const RATE_LIMIT_DELAY_MS = 1500;
const MAX_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function uploadToIPFS(content: string, fileName: string): Promise<string> {
  const pinataJWT = process.env.PINATA_JWT;

  if (!pinataJWT) {
    throw new Error('PINATA_JWT environment variable is not set');
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const formData = new FormData();

    const blob = Buffer.from(content, 'utf-8');
    formData.append('file', blob, {
      filename: fileName,
      contentType: 'application/json',
    });

    formData.append(
      'pinataOptions',
      JSON.stringify({
        cidVersion: 1,
      })
    );

    formData.append(
      'pinataMetadata',
      JSON.stringify({
        name: fileName,
        keyvalues: {
          type: 'json-schema',
          source: 'elephant-lexicon',
        },
      })
    );

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pinataJWT}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (response.ok) {
      const result = (await response.json()) as { IpfsHash: string };
      return result.IpfsHash;
    }

    if (response.status === 429 && attempt < MAX_RETRIES - 1) {
      const backoff = RATE_LIMIT_DELAY_MS * Math.pow(2, attempt);
      await delay(backoff);
      continue;
    }

    const errorText = await response.text();
    throw new Error(`Pinata API error: ${response.status} - ${errorText}`);
  }

  throw new Error(`Pinata upload failed after ${MAX_RETRIES} retries for ${fileName}`);
}
