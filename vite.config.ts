/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import { jsonSchemaGeneratorPlugin } from './vite-plugins/json-schema-generator';
import { dataMappingUploaderPlugin } from './vite-plugins/data-mapping-uploader';

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
    dataMappingUploaderPlugin({
      dataMappingPath: resolve(__dirname, './src/data/data-mapping.json'),
      outputDir: resolve(__dirname, './public/json-schemas'),
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
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
