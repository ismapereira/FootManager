import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(desktopDir, '..', '..');

const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none';";

/**
 * Injeta a Content-Security-Policy estrita apenas no build de produção,
 * evitando conflitos com o HMR do Vite em desenvolvimento e eliminando origens localhost no pacote final.
 */
function injectProductionCspPlugin(): Plugin {
  return {
    name: 'footmanager-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), injectProductionCspPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(desktopDir, 'src'),
      '@footmanager/schemas': path.resolve(repoRoot, 'packages/schemas/src/index.ts'),
      '@footmanager/engine': path.resolve(repoRoot, 'packages/engine/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
