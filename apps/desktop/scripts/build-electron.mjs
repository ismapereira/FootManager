import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');

/**
 * Empacota main.ts, preload.ts e simulationWorker.ts em CommonJS isolado para Electron endurecido
 * (compatível com sandbox: true e worker_threads sem conflitos de resolução de workspace).
 */
const workspaceAliasPlugin = {
  name: 'footmanager-workspace-alias',
  setup(build) {
    const aliasMap = {
      '@footmanager/schemas': path.resolve(repoRoot, 'packages/schemas/src/index.ts'),
      '@footmanager/engine': path.resolve(repoRoot, 'packages/engine/src/index.ts'),
      '@footmanager/patches': path.resolve(repoRoot, 'packages/patches/src/index.ts'),
      '@footmanager/storage': path.resolve(repoRoot, 'packages/storage/src/index.ts'),
    };
    for (const [pkgName, entryFile] of Object.entries(aliasMap)) {
      const escaped = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      build.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => ({ path: entryFile }));
    }
  },
};

const commonConfig = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: ['electron', 'better-sqlite3'],
  plugins: [workspaceAliasPlugin],
};

await Promise.all([
  esbuild.build({
    ...commonConfig,
    entryPoints: [path.resolve(desktopDir, 'electron/main.ts')],
    outfile: path.resolve(desktopDir, 'dist-electron/main.cjs'),
  }),
  esbuild.build({
    ...commonConfig,
    entryPoints: [path.resolve(desktopDir, 'electron/preload.ts')],
    outfile: path.resolve(desktopDir, 'dist-electron/preload.cjs'),
  }),
  esbuild.build({
    ...commonConfig,
    entryPoints: [path.resolve(desktopDir, 'electron/simulationWorker.ts')],
    outfile: path.resolve(desktopDir, 'dist-electron/simulationWorker.cjs'),
  }),
]);

console.log('[build-electron] main.cjs, preload.cjs e simulationWorker.cjs compilados com sucesso.');
