import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const require = createRequire(import.meta.url);

/**
 * Inicia o binário real do Electron diretamente (sem `shell: true`) apontando para o servidor local do Vite.
 * Garante propagação limpa de sinais de encerramento no Windows e evita aviso DEP0190.
 */
const electronBinary = require('electron');
const child = spawn(String(electronBinary), ['.'], {
  cwd: desktopDir,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
