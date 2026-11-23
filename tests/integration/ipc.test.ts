import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IPC_CHANNELS,
  type AdvanceWeekResult,
  type AppSettings,
  type IpcResponse,
  type SaveMetadata,
  type SaveSlotSummary,
} from '@footmanager/schemas';
import { resolveSafeSavePaths } from '@footmanager/storage';
import {
  registerIpcHandlers,
  SimulationWorkerBridge,
  type IpcRegistrar,
} from '../../apps/desktop/electron/ipcHandlers.js';
import {
  buildCspHeader,
  isAllowedNavigationUrl,
} from '../../apps/desktop/electron/security.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const compiledWorkerPath = path.join(
  repoRoot,
  'apps',
  'desktop',
  'dist-electron',
  'simulationWorker.cjs',
);

/**
 * Simulador leve do registro `ipcMain.handle` permitindo testar 100% dos handlers IPC reais
 * conectados a SQLite WAL e Worker Thread reais sem depender de janela GUI.
 */
function createInMemoryIpcBus() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const registrar: IpcRegistrar = {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
  };
  const invoke = async <T>(channel: string, ...args: unknown[]): Promise<IpcResponse<T>> => {
    const fn = handlers.get(channel);
    if (!fn) {
      throw new Error(`Canal IPC não registrado: ${channel}`);
    }
    return (await fn({}, ...args)) as IpcResponse<T>;
  };
  return { registrar, invoke, channels: () => Array.from(handlers.keys()) };
}

describe('Ponte IPC Completa e Hardening Electron (ipcHandlers + security)', () => {
  let userDataDir: string;
  let activeWorker: Worker | null = null;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footmanager-ipc-'));
  });

  afterEach(async () => {
    if (activeWorker) {
      await activeWorker.terminate();
      activeWorker = null;
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('registra exatamente a whitelist IPC, valida entradas com Zod e executa fluxo completo Save + AutoSave + Worker', async () => {
    expect(fs.existsSync(compiledWorkerPath)).toBe(true);
    const bus = createInMemoryIpcBus();
    activeWorker = new Worker(compiledWorkerPath);

    registerIpcHandlers({
      ipc: bus.registrar,
      appVersion: '0.1.0-test',
      userDataDir,
      getWorker: () => {
        if (!activeWorker) {
          activeWorker = new Worker(compiledWorkerPath);
        }
        return activeWorker;
      },
    });

    // Confirma que todos os 11 canais da whitelist estão registrados e nenhum extra foi exposto
    expect(bus.channels().sort()).toEqual(Object.values(IPC_CHANNELS).sort());

    // 1. Informações do app + preferências padrão
    const infoRes = await bus.invoke<{ appName: string; appVersion: string; mode: string }>(
      IPC_CHANNELS.APP_GET_INFO,
    );
    expect(infoRes.ok).toBe(true);
    if (infoRes.ok) {
      expect(infoRes.data.appName).toBe('FootManager');
      expect(infoRes.data.appVersion).toBe('0.1.0-test');
    }

    const defaultSettings = await bus.invoke<AppSettings>(IPC_CHANNELS.SETTINGS_GET);
    expect(defaultSettings.ok).toBe(true);
    if (defaultSettings.ok) {
      expect(defaultSettings.data.theme).toBe('dark');
      expect(defaultSettings.data.autoSave).toBe(true);
    }

    // 2. Validação Zod rejeita payload malformado com código VALIDATION_ERROR limpo
    const badCreate = await bus.invoke<SaveMetadata>(IPC_CHANNELS.SAVES_CREATE, {
      saveId: '../../escape',
      saveName: 'X',
      managerName: 'A',
    });
    expect(badCreate.ok).toBe(false);
    if (!badCreate.ok) {
      expect(badCreate.error.code).toBe('VALIDATION_ERROR');
      expect(badCreate.error.message).toMatch(/^Dados inválidos:/);
    }

    // 3. Cria save real em SQLite WAL + verifica + lista
    const created = await bus.invoke<SaveMetadata>(IPC_CHANNELS.SAVES_CREATE, {
      saveId: 'ipc_career_01',
      saveName: 'Carreira IPC',
      managerName: 'Técnico IPC',
      clubId: 'bra_flamengo',
      seed: 20260001,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const ping = await bus.invoke<{ alive: boolean }>(IPC_CHANNELS.SIMULATION_PING);
    expect(ping.ok && ping.data.alive).toBe(true);

    // 4. Avança semana com autoSave = true -> deve persistir Semana 2 no SQLite
    const adv1 = await bus.invoke<AdvanceWeekResult>(IPC_CHANNELS.SIMULATION_ADVANCE_WEEK, {
      currentYear: 2026,
      currentWeek: 1,
      seed: 20260001,
      saveId: 'ipc_career_01',
    });
    expect(adv1.ok).toBe(true);
    if (!adv1.ok) return;
    expect(adv1.data.currentWeek).toBe(2);

    const loadedAfterAutoSave = await bus.invoke<{
      metadata: SaveMetadata;
      recoveredFromBackup: boolean;
    }>(IPC_CHANNELS.SAVES_LOAD, { saveId: 'ipc_career_01' });
    expect(loadedAfterAutoSave.ok).toBe(true);
    if (loadedAfterAutoSave.ok) {
      expect(loadedAfterAutoSave.data.metadata.currentWeek).toBe(2);
      expect(loadedAfterAutoSave.data.recoveredFromBackup).toBe(false);
    }

    // 5. Desativa autoSave -> avançar semana NÃO deve sobrescrever o disco
    const disabledAutoSave = await bus.invoke<AppSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      autoSave: false,
      theme: 'light',
    });
    expect(disabledAutoSave.ok && !disabledAutoSave.data.autoSave).toBe(true);

    const adv2 = await bus.invoke<AdvanceWeekResult>(IPC_CHANNELS.SIMULATION_ADVANCE_WEEK, {
      currentYear: 2026,
      currentWeek: 2,
      seed: adv1.data.nextSeed,
      saveId: 'ipc_career_01',
    });
    expect(adv2.ok && adv2.data.currentWeek === 3).toBe(true);

    const stillWeek2 = await bus.invoke<{ metadata: SaveMetadata }>(IPC_CHANNELS.SAVES_LOAD, {
      saveId: 'ipc_career_01',
    });
    expect(stillWeek2.ok && stillWeek2.data.metadata.currentWeek === 2).toBe(true);

    // 6. Gravação manual explícita + corrupção do .fmsave + recuperação automática via .bak pelo IPC
    const persisted = await bus.invoke<SaveMetadata>(IPC_CHANNELS.SAVES_SAVE, {
      metadata: { ...created.data, currentWeek: 9 },
    });
    expect(persisted.ok && persisted.data.currentWeek === 9).toBe(true);

    const savePaths = resolveSafeSavePaths(path.join(userDataDir, 'saves'), 'ipc_career_01');
    fs.writeFileSync(savePaths.mainFile, Buffer.from('CORRUPT_HEADER'));

    const recovered = await bus.invoke<{ metadata: SaveMetadata; recoveredFromBackup: boolean }>(
      IPC_CHANNELS.SAVES_LOAD,
      { saveId: 'ipc_career_01' },
    );
    expect(recovered.ok).toBe(true);
    if (recovered.ok) {
      expect(recovered.data.recoveredFromBackup).toBe(true);
      expect(recovered.data.metadata.currentWeek).toBe(9);
    }

    // 7. Verifica integridade, lista e exclui
    const verify = await bus.invoke<{ mainOk: boolean; backupOk: boolean; journalMode: string }>(
      IPC_CHANNELS.SAVES_VERIFY,
      { saveId: 'ipc_career_01' },
    );
    expect(verify.ok && verify.data.mainOk && verify.data.backupOk).toBe(true);

    const listed = await bus.invoke<SaveSlotSummary[]>(IPC_CHANNELS.SAVES_LIST);
    expect(listed.ok && listed.data.length === 1).toBe(true);

    const deleted = await bus.invoke<{ deleted: boolean }>(IPC_CHANNELS.SAVES_DELETE, {
      saveId: 'ipc_career_01',
    });
    expect(deleted.ok && deleted.data.deleted).toBe(true);
  });

  it('rejeita promessas pendentes imediatamente se a Worker Thread encerrar durante execução (sem travar UI)', async () => {
    const worker = new Worker(
      `const { parentPort } = require('node:worker_threads');
       parentPort.on('message', () => { process.exit(1); });`,
      { eval: true },
    );
    activeWorker = worker;
    const bridge = new SimulationWorkerBridge(() => worker, 5000);

    await expect(bridge.request({ type: 'ping' })).rejects.toThrow(/encerrada inesperadamente/i);
    activeWorker = null;
  });

  it('bloqueia bypasses de prefixo na política de navegação will-navigate e valida CSP de produção', () => {
    const distHtml = path.resolve(repoRoot, 'apps', 'desktop', 'dist', 'index.html');
    const exactProdUrl = pathToFileURL(distHtml).href;

    // Produção: aceita apenas o index.html empacotado, bloqueia qualquer outro arquivo local ou domínio externo
    expect(isAllowedNavigationUrl(exactProdUrl, { isDev: false, distHtmlPath: distHtml })).toBe(true);
    expect(
      isAllowedNavigationUrl(`${exactProdUrl}#squad`, { isDev: false, distHtmlPath: distHtml }),
    ).toBe(true);
    expect(
      isAllowedNavigationUrl('file:///C:/Windows/win.ini', { isDev: false, distHtmlPath: distHtml }),
    ).toBe(false);
    expect(
      isAllowedNavigationUrl('https://evil.com', { isDev: false, distHtmlPath: distHtml }),
    ).toBe(false);

    // Desenvolvimento: aceita apenas origem exata do Vite, bloqueia prefixo falso `127.0.0.1:5173.evil.com`
    expect(
      isAllowedNavigationUrl('http://127.0.0.1:5173/', {
        isDev: true,
        devServerUrl: 'http://127.0.0.1:5173',
        distHtmlPath: distHtml,
      }),
    ).toBe(true);
    expect(
      isAllowedNavigationUrl('http://127.0.0.1:5173.evil.com/', {
        isDev: true,
        devServerUrl: 'http://127.0.0.1:5173',
        distHtmlPath: distHtml,
      }),
    ).toBe(false);

    // CSP de produção não permite `unsafe-eval`, `unsafe-inline` em script-src nem origens localhost
    const prodCsp = buildCspHeader(false);
    expect(prodCsp).toContain("default-src 'self'");
    expect(prodCsp).toContain("script-src 'self'");
    expect(prodCsp).not.toContain('127.0.0.1');
    expect(prodCsp).not.toContain('unsafe-eval');
  });
});
