/// <reference types="vitest" />
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import { jsonSchemaGeneratorPlugin } from './vite-plugins/json-schema-generator';
import readPublishedManifest from './api/manifest';

// Load environment variables
dotenv.config();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    jsonSchemaGeneratorPlugin({
      lexiconPath: resolve(__dirname, './src/data/lexicon.json'),
      outputDir: resolve(__dirname, './public/json-schemas'),
    }),
    lexiconManifestReaderPlugin(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api/ipfs': {
        target: 'https://ipfs.filebase.io',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/ipfs/, '/ipfs'),
      },
    },
  },
  build: {
    outDir: 'build',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        'src/reportWebVitals.ts',
        'src/index.tsx',
        'vite.config.ts',
        'eslint.config.js',
        'src/types/',
      ],
    },
  },
});

function lexiconManifestReaderPlugin(): Plugin {
  return {
    name: 'lexicon-manifest-reader',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/api/manifest') {
          next();
          return;
        }

        const response = await readPublishedManifest();
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}
