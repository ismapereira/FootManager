import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { registerIpcHandlers } from './ipcHandlers.js';
import { buildCspHeader, isAllowedNavigationUrl } from './security.js';

const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const isDev = Boolean(DEV_SERVER_URL);

let mainWindow: BrowserWindow | null = null;
let simulationWorker: Worker | null = null;
let isShuttingDown = false;

/**
 * Configura cabeçalho Content-Security-Policy endurecido na sessão padrão do Electron (Seção 11.1).
 * Remove eventuais duplicatas de cabeçalho CSP em caixa diferente antes de aplicar a política oficial.
 */
function installSecurityHeaders(): void {
  const cspHeader = buildCspHeader(isDev);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const cleanedHeaders: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(details.responseHeaders ?? {})) {
      if (key.toLowerCase() !== 'content-security-policy') {
        cleanedHeaders[key] = value;
      }
    }

    callback({
      responseHeaders: {
        ...cleanedHeaders,
        'Content-Security-Policy': [cspHeader],
      },
    });
  });
}

/**
 * Anexa políticas defensivas de navegação, bloqueio de popups e limpeza de referência à janela.
 */
function attachWindowListeners(win: BrowserWindow, distHtml: string): void {
  // Bloqueia abertura de janelas externas ou popups não autorizados
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Bloqueia navegação do renderer para origens ou arquivos fora do bundle do aplicativo
  win.webContents.on('will-navigate', (event, targetUrl) => {
    const allowed = isAllowedNavigationUrl(targetUrl, {
      isDev,
      devServerUrl: DEV_SERVER_URL,
      distHtmlPath: distHtml,
    });
    if (!allowed) {
      event.preventDefault();
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

/**
 * Cria a janela principal do FootManager com todas as flags de hardening ativadas (Seção 11.1).
 */
function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, 'preload.cjs');
  const distHtml = path.join(__dirname, '..', 'dist', 'index.html');

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    title: 'FootManager',
    backgroundColor: '#09090B',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev,
    },
  });

  attachWindowListeners(win, distHtml);

  if (isDev && DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(distHtml);
  }

  return win;
}

/**
 * Inicializa ou reinicia automaticamente a Worker Thread dedicada de simulação (Seção 11.2).
 */
function ensureSimulationWorker(): Worker {
  if (simulationWorker) {
    return simulationWorker;
  }

  const workerPath = path.join(__dirname, 'simulationWorker.cjs');
  const worker = new Worker(workerPath);
  worker.on('error', (error) => {
    console.error('[simulationWorker] Erro inesperado:', error);
    if (simulationWorker === worker) {
      simulationWorker = null;
    }
  });
  worker.on('exit', () => {
    if (simulationWorker === worker) {
      simulationWorker = null;
    }
  });

  simulationWorker = worker;
  return worker;
}

app.whenReady().then(() => {
  installSecurityHeaders();
  ensureSimulationWorker();

  registerIpcHandlers({
    ipc: ipcMain,
    appVersion: app.getVersion(),
    userDataDir: app.getPath('userData'),
    getWorker: () => {
      if (isShuttingDown) {
        throw new Error('Aplicativo em processo de encerramento.');
      }
      return ensureSimulationWorker();
    },
  });

  mainWindow = createMainWindow();

  app.on('activate', () => {
    if (!mainWindow || BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    } else if (!mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isShuttingDown = true;
  if (simulationWorker) {
    void simulationWorker.terminate();
    simulationWorker = null;
  }
});
