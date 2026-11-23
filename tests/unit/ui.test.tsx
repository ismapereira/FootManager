import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '@footmanager/schemas';
import {
  registerIpcHandlers,
  type IpcRegistrar,
} from '../../apps/desktop/electron/ipcHandlers.js';
import type { FootManagerBridgeApi } from '../../apps/desktop/electron/preload.js';
import '@/i18n';
import { App, shouldTriggerGlobalAdvanceShortcut } from '@/app/App';
import { CompetitionsScreen } from '@/features/competitions/CompetitionsScreen';
import { FinanceScreen } from '@/features/finance/FinanceScreen';
import { HistoryScreen } from '@/features/history/HistoryScreen';
import { SaveSlotRow, SystemScreen } from '@/features/menu/SystemScreen';
import { NationalScreen } from '@/features/national/NationalScreen';
import { SquadScreen } from '@/features/squad/SquadScreen';
import { TransfersScreen } from '@/features/transfers/TransfersScreen';
import { YouthScreen } from '@/features/youth/YouthScreen';
import { DEMO_CLUBS, useAppStore } from '@/store/useAppStore';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const compiledWorkerPath = path.join(
  repoRoot,
  'apps',
  'desktop',
  'dist-electron',
  'simulationWorker.cjs',
);

describe('Interface React Minimalista, Atalho Enter e Store Zustand (@footmanager/desktop)', () => {
  let tempUserDataDir: string;
  let worker: Worker | null = null;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footmanager-ui-'));
    // Reinicia store para estado limpo antes de cada teste
    useAppStore.setState({
      activeSection: 'squad',
      theme: 'dark',
      activeClub: DEMO_CLUBS[0],
      currentYear: 2026,
      currentWeek: 1,
      seed: 20260001,
      isAdvancing: false,
      lastAdvanceResult: null,
      audioEnabled: true,
      audioVolume: 0.6,
      autoSave: true,
      runtimeMode: 'browser-preview',
      saves: [],
      activeSaveId: null,
      workerLatencyMs: null,
      statusMessage: null,
    });
  });

  afterEach(async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
    fs.rmSync(tempUserDataDir, { recursive: true, force: true });
  });

  it('renderiza o shell principal com os 8 itens do menu lateral, CTA fixo e todas as 8 telas sem erro', () => {
    const initialHtml = renderToStaticMarkup(<App />);
    // Os 8 itens oficiais do menu lateral (Seção 10.1) + botão principal
    expect(initialHtml).toContain('Elenco &amp; Tática');
    expect(initialHtml).toContain('Competições');
    expect(initialHtml).toContain('Mercado');
    expect(initialHtml).toContain('Finanças &amp; Estádio');
    expect(initialHtml).toContain('Base (Juniores)');
    expect(initialHtml).toContain('Seleções');
    expect(initialHtml).toContain('Carreira &amp; Histórico');
    expect(initialHtml).toContain('Sistema');
    expect(initialHtml).toContain('Jogar Rodada / Avançar Semana');
    expect(initialHtml).toContain('CR Flamengo');
    expect(initialHtml).toContain('Contraste WCAG');

    // Renderiza diretamente todas as 8 telas funcionais/placeholder garantindo i18n completo
    const screenOutputs = [
      renderToStaticMarkup(<SquadScreen />),
      renderToStaticMarkup(<CompetitionsScreen />),
      renderToStaticMarkup(<TransfersScreen />),
      renderToStaticMarkup(<FinanceScreen />),
      renderToStaticMarkup(<YouthScreen />),
      renderToStaticMarkup(<NationalScreen />),
      renderToStaticMarkup(<HistoryScreen />),
      renderToStaticMarkup(<SystemScreen />),
    ];
    for (const html of screenOutputs) {
      expect(html.length).toBeGreaterThan(100);
      expect(html).not.toContain('undefined');
    }
    expect(screenOutputs[7]).toContain('Modo Escuro');
    expect(screenOutputs[7]).toContain('Áudio Clássico');

    // Troca de clube na store atualiza clube ativo e tokens WCAG imediatamente
    useAppStore.getState().selectClub('bra_atletico_mg');
    const updatedState = useAppStore.getState();
    expect(updatedState.activeClub.id).toBe('bra_atletico_mg');
    expect(updatedState.activeClub.governance).toBe('saf');
    expect(updatedState.themeTokens.primary).toBe('#18181B');
    expect(updatedState.themeTokens.contrastRatioOnPrimary).toBeGreaterThanOrEqual(4.5);
  });

  it('bloqueia atalho global Enter quando foco está em elementos interativos ou com teclas modificadoras', () => {
    const baseEvent = {
      key: 'Enter',
      repeat: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    };

    expect(shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, target: { tagName: 'BODY' } })).toBe(true);
    expect(shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, target: { tagName: 'DIV' } })).toBe(true);
    expect(shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, target: null })).toBe(true);

    // Deve bloquear em inputs, botões, links, selects, textareas e contentEditable
    expect(shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, target: { tagName: 'INPUT' } })).toBe(false);
    expect(shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, target: { tagName: 'TEXTAREA' } })).toBe(false);
    expect(shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, target: { tagName: 'SELECT' } })).toBe(false);
    expect(shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, target: { tagName: 'BUTTON' } })).toBe(false);
    expect(shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, target: { tagName: 'A' } })).toBe(false);
    expect(
      shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, target: { tagName: 'DIV', isContentEditable: true } }),
    ).toBe(false);

    // Deve bloquear em teclas repetidas, modificadores ou outras teclas
    expect(shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, repeat: true, target: null })).toBe(false);
    expect(shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, ctrlKey: true, target: null })).toBe(false);
    expect(shouldTriggerGlobalAdvanceShortcut({ ...baseEvent, key: 'Space', target: null })).toBe(false);
  });

  it('integra useAppStore ponta a ponta com a ponte IPC real (SQLite WAL + Worker Thread + AutoSave)', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const registrar: IpcRegistrar = {
      handle(channel, listener) {
        handlers.set(channel, listener);
      },
    };
    const invoke = <T,>(channel: string, ...args: unknown[]) =>
      Promise.resolve(handlers.get(channel)?.({}, ...args)) as Promise<T>;

    worker = new Worker(compiledWorkerPath);
    registerIpcHandlers({
      ipc: registrar,
      appVersion: '0.1.0',
      userDataDir: tempUserDataDir,
      getWorker: () => worker as Worker,
    });

    const bridge: FootManagerBridgeApi = {
      getAppInfo: () => invoke(IPC_CHANNELS.APP_GET_INFO),
      getSettings: () => invoke(IPC_CHANNELS.SETTINGS_GET),
      updateSettings: (patch) => invoke(IPC_CHANNELS.SETTINGS_UPDATE, patch),
      listSaves: () => invoke(IPC_CHANNELS.SAVES_LIST),
      createSave: (req) => invoke(IPC_CHANNELS.SAVES_CREATE, req),
      loadSave: (saveId) => invoke(IPC_CHANNELS.SAVES_LOAD, { saveId }),
      persistSave: (metadata) => invoke(IPC_CHANNELS.SAVES_SAVE, { metadata }),
      deleteSave: (saveId) => invoke(IPC_CHANNELS.SAVES_DELETE, { saveId }),
      verifySave: (saveId) => invoke(IPC_CHANNELS.SAVES_VERIFY, { saveId }),
      pingWorker: () => invoke(IPC_CHANNELS.SIMULATION_PING),
      advanceWeek: (req) => invoke(IPC_CHANNELS.SIMULATION_ADVANCE_WEEK, req),
    };

    (globalThis as { window?: unknown }).window = { footManagerApi: bridge };

    const store = useAppStore.getState();
    await store.initialize();
    expect(useAppStore.getState().runtimeMode).toBe('desktop');

    await useAppStore.getState().pingWorker();
    expect(useAppStore.getState().workerLatencyMs).not.toBeNull();

    // Cria save, avança semana (persiste semana 2), muda tema e recarrega o save
    await useAppStore.getState().createDemoSave();
    const saveId = useAppStore.getState().activeSaveId;
    expect(saveId).toBeTruthy();

    await useAppStore.getState().advanceWeek();
    expect(useAppStore.getState().currentWeek).toBe(2);

    await useAppStore.getState().setTheme('light');
    expect(useAppStore.getState().theme).toBe('light');

    await useAppStore.getState().setAutoSave(false);
    expect(useAppStore.getState().autoSave).toBe(false);

    // Com autoSave=false, avançar para semana 3 NÃO altera o save no disco; recarregar volta à semana 2
    await useAppStore.getState().advanceWeek();
    expect(useAppStore.getState().currentWeek).toBe(3);

    await useAppStore.getState().loadSave(saveId as string);
    expect(useAppStore.getState().currentWeek).toBe(2);

    // Verifica erro explícito quando tenta carregar save inexistente (não silencia erro)
    await useAppStore.getState().loadSave('save_inexistente_999');
    expect(useAppStore.getState().statusMessage).toMatch(/Erro ao carregar save/i);

    await useAppStore.getState().verifySave(saveId as string);
    expect(useAppStore.getState().statusMessage).toMatch(/principal=OK/);

    await useAppStore.getState().deleteSave(saveId as string);
    expect(useAppStore.getState().saves).toHaveLength(0);
  });

  it('trata erro IPC em setTheme exibindo mensagem traduzida via i18next e renderiza selos i18n em SystemScreen', async () => {
    const failingBridge = {
      updateSettings: async () => ({
        ok: false as const,
        error: { code: 'IPC_OPERATION_FAILED', message: 'Permissão negada no settings.json' },
      }),
    } as unknown as FootManagerBridgeApi;

    (globalThis as { window?: unknown }).window = { footManagerApi: failingBridge };

    await useAppStore.getState().setTheme('light');
    expect(useAppStore.getState().theme).toBe('light');
    expect(useAppStore.getState().statusMessage).toBe(
      'Erro ao salvar tema: Permissão negada no settings.json',
    );

    // Renderiza SaveSlotRow com slots íntegro/ativo e corrompido/recuperável validando selos via i18n
    const okSlotHtml = renderToStaticMarkup(
      <SaveSlotRow
        slot={{
          saveId: 'slot_ok',
          saveName: 'Carreira Flamengo',
          currentYear: 2026,
          currentWeek: 4,
          managerName: 'Técnico Principal',
          clubId: 'bra_flamengo',
          hasBackup: true,
          integrityOk: true,
          updatedAt: '2026-11-22T12:00:00.000Z',
          fileSizeBytes: 32768,
        }}
        isActive
        onLoad={() => undefined}
        onVerify={() => undefined}
        onDelete={() => undefined}
      />,
    );
    const brokenSlotHtml = renderToStaticMarkup(
      <SaveSlotRow
        slot={{
          saveId: 'slot_check',
          saveName: 'Carreira Recuperável',
          currentYear: 2026,
          currentWeek: 2,
          managerName: 'Técnico Principal',
          clubId: 'bra_palmeiras',
          hasBackup: true,
          integrityOk: false,
          updatedAt: '2026-11-22T11:00:00.000Z',
          fileSizeBytes: 16384,
        }}
        isActive={false}
        onLoad={() => undefined}
        onVerify={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(okSlotHtml).toContain('Ativo');
    expect(okSlotHtml).toContain('SQLite OK');
    expect(okSlotHtml).toContain('.bak');
    expect(brokenSlotHtml).toContain('Verificar');
    expect(brokenSlotHtml).not.toContain('SQLite OK');

    const appHtml = renderToStaticMarkup(<App />);
    expect(appHtml).toContain('aria-label="Navegação principal"');
    expect(appHtml).toContain('aria-label="Estrela"');
    expect(appHtml).toContain('lugares');
  });
});
