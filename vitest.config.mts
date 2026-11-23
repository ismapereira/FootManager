import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Configuração global do Vitest para testes unitários, de integração e de estresse.
 * Resolve diretamente os fontes dos workspaces para execução rápida e determinística.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'apps/desktop/src'),
      '@footmanager/schemas': path.resolve(rootDir, 'packages/schemas/src/index.ts'),
      '@footmanager/engine': path.resolve(rootDir, 'packages/engine/src/index.ts'),
      '@footmanager/patches': path.resolve(rootDir, 'packages/patches/src/index.ts'),
      '@footmanager/storage': path.resolve(rootDir, 'packages/storage/src/index.ts'),
      '@footmanager/importer': path.resolve(rootDir, 'tools/importer/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 15000,
    reporters: ['verbose'],
  },
});
