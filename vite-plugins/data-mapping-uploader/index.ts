import { Plugin } from 'vite';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadToIPFS } from '../json-schema-generator/ipfs-uploader';

interface DataMappingUploaderOptions {
  dataMappingPath: string;
  outputDir: string;
}

interface DataMappingEntry {
  lexiconClass: string;
  lexiconProperty: string;
  iconName?: string;
  enumValue?: string;
  enumDescription?: string;
}

export function dataMappingUploaderPlugin(options: DataMappingUploaderOptions): Plugin {
  return {
    name: 'data-mapping-uploader',
    async buildStart() {
      try {
        console.log('🔄 Starting data mapping upload process...');

        // Check if IPFS upload is available
        const pinataJWT = process.env.PINATA_JWT;
        const enableIPFSUpload = !!pinataJWT;

        if (!enableIPFSUpload) {
          console.log(
            '⚠️  PINATA_JWT not set - skipping IPFS upload. Data mapping will be saved locally only.'
          );
        }

        // Read the data-mapping.json file
        const dataMappingPath = path.resolve(options.dataMappingPath);
        const dataMappingContent = await fs.readFile(dataMappingPath, 'utf-8');
        const _dataMapping: DataMappingEntry[] = JSON.parse(dataMappingContent);

        // Read lexicon data to find blockchain classes
        const lexiconPath = path.resolve('./src/data/lexicon.json');
        const lexiconContent = await fs.readFile(lexiconPath, 'utf-8');
        const lexiconData = JSON.parse(lexiconContent);

        // Find blockchain classes (classes tagged with 'blockchain')
        const blockchainTag = lexiconData.tags.find(
          (tag: { name: string }) => tag.name === 'blockchain'
        );
        if (!blockchainTag) {
          console.log('⚠️  No blockchain tag found in lexicon data');
          return;
        }

        const blockchainClasses = blockchainTag.classes
          .map((className: string) =>
            lexiconData.classes.find((cls: { type: string }) => cls.type === className)
          )
          .filter(Boolean);

        console.log(`📊 Found ${blockchainClasses.length} blockchain classes`);

        // Create output directory
        await fs.mkdir(options.outputDir, { recursive: true });

        // Create manifest for data mapping uploads
        const manifest: Record<string, { ipfsCid: string }> = {};

        // Process data-mapping.json for each blockchain class
        for (const blockchainClass of blockchainClasses) {
          const className = blockchainClass.type;
          const manifestKey = `${className}_icon_mapping`;

          console.log(`📤 Processing data mapping for ${className}...`);

          try {
            let ipfsCid = '';

            if (enableIPFSUpload) {
              // Upload to IPFS
              ipfsCid = await uploadToIPFS(dataMappingContent, 'data-mapping.json');
              console.log(`✅ ${className} - CID: ${ipfsCid}`);
            } else {
              // Save locally instead
              const localPath = path.join(options.outputDir, `${className}_icon_mapping.json`);
              await fs.writeFile(localPath, dataMappingContent);
              console.log(`✅ ${className} - saved locally`);
            }

            manifest[manifestKey] = {
              ipfsCid: ipfsCid,
              type: 'class',
            };
          } catch (_error) {
            console.error(`❌ Failed to process data mapping for ${className}:`, _error);
          }
        }

        // Update the existing schema manifest
        const manifestPath = path.resolve(options.outputDir, 'schema-manifest.json');
        let existingManifest: Record<string, { ipfsCid: string }> = {};

        try {
          const existingContent = await fs.readFile(manifestPath, 'utf-8');
          existingManifest = JSON.parse(existingContent);
        } catch {
          console.log('📝 Creating new schema manifest...');
        }

        // Merge the new data mapping entries with existing manifest
        const updatedManifest = { ...existingManifest, ...manifest };

        // Write the updated manifest
        await fs.writeFile(manifestPath, JSON.stringify(updatedManifest, null, 2));

        console.log('✅ Data mapping upload process completed!');
        console.log(`📊 Updated manifest with ${Object.keys(manifest).length} new entries`);
      } catch (error) {
        console.error('❌ Error in data mapping upload process:', error);
      }
    },
  };
}
