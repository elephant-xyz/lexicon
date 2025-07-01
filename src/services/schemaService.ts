export interface SchemaManifestEntry {
  ipfsCid: string;
  type: 'class' | 'relationship' | 'dataGroup';
}

export type SchemaManifest = Record<string, SchemaManifestEntry>;

class SchemaService {
  private manifest: SchemaManifest | null = null;
  private manifestPromise: Promise<SchemaManifest> | null = null;

  async getManifest(): Promise<SchemaManifest> {
    if (this.manifest) {
      return this.manifest;
    }

    if (this.manifestPromise) {
      return this.manifestPromise;
    }

    this.manifestPromise = fetch('/json-schemas/schema-manifest.json')
      .then(response => {
        if (!response.ok) {
          // Schema manifest not found
          return {};
        }
        return response.json();
      })
      .then(data => {
        this.manifest = data;
        return data;
      })
      .catch(_error => {
        // Error loading schema manifest
        this.manifestPromise = null; // Allow retries
        return {};
      });

    return this.manifestPromise;
  }

  async getSchemaInfo(className: string): Promise<SchemaManifestEntry | null> {
    const manifest = await this.getManifest();
    return manifest[className] || null;
  }

  getIPFSUrl(cid: string): string {
    return `https://ipfs.io/ipfs/${cid}`;
  }
}

export const schemaService = new SchemaService();
