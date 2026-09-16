export interface SchemaManifestEntry {
  ipfsCid: string;
  type: 'class' | 'relationship' | 'dataGroup';
}

export type SchemaManifest = Record<string, SchemaManifestEntry>;

class SchemaService {
  private manifestPromise: Promise<SchemaManifest> | null = null;

  async getManifest(): Promise<SchemaManifest> {
    if (this.manifestPromise) {
      return this.manifestPromise;
    }

    this.manifestPromise = fetch('/api/manifest', { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) {
          return {};
        }
        return response.json();
      })
      .catch(() => ({}))
      .finally(() => {
        this.manifestPromise = null;
      });

    return this.manifestPromise;
  }

  async getSchemaInfo(className: string): Promise<SchemaManifestEntry | null> {
    const manifest = await this.getManifest();
    return manifest[className] || null;
  }

  getIPFSUrl(cid: string): string {
    return `https://ipfs.filebase.io/ipfs/${cid}`;
  }
}

export const schemaService = new SchemaService();

// Function to extract human-readable rules from HTTP request validation schema
export function extractHTTPRequestRules(): Record<string, string[]> {
  // This function extracts rules from the generateHTTPRequestValidationRules() schema
  // and converts them to human-readable format
  return {
    method: [
      'GET requests cannot have body, json, or headers',
      'POST/PUT/PATCH with application/json must have json field',
      'POST/PUT/PATCH with non-application/json must have body field',
    ],
    headers: [
      'If method is POST/PUT/PATCH with application/json, content-type must be application/json',
      'If method is POST/PUT/PATCH with non-JSON payload, content-type must not be application/json',
    ],
    body: [
      'Only allowed for POST/PUT/PATCH with non-JSON content-type',
      'Cannot be used with json field',
    ],
    json: [
      'Only allowed for POST/PUT/PATCH with application/json content-type',
      'Cannot be used with body field',
    ],
    'content-type': ['Must be valid MIME type format'],
  };
}
