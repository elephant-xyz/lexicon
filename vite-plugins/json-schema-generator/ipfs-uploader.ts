import fetch from 'node-fetch';
import FormData from 'form-data';

export async function uploadToIPFS(content: string, fileName: string): Promise<string> {
  const pinataJWT = process.env.PINATA_JWT;

  if (!pinataJWT) {
    throw new Error('PINATA_JWT environment variable is not set');
  }

  const formData = new FormData();

  // Add file as a blob
  const blob = Buffer.from(content, 'utf-8');
  formData.append('file', blob, {
    filename: fileName,
    contentType: 'application/json',
  });

  // Add pinata options for CIDv1
  formData.append(
    'pinataOptions',
    JSON.stringify({
      cidVersion: 1,
    })
  );

  // Add pinata metadata
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

  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pinataJWT}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Pinata API error: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as { IpfsHash: string };
    return result.IpfsHash;
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    throw error;
  }
}
