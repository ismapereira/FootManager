import { create, type StoreApi } from 'zustand';
import { advanceWorldWeek } from '@footmanager/engine';
import type {
  AdvanceWeekResult,
  ClubGovernance,
  MoraleLevel,
  PlayerTrait,
  Position,
  SaveSlotSummary,
} from '@footmanager/schemas';
import {
  applyClubThemeToDocument,
  resolveClubThemeTokens,
  type ClubThemeTokens,
  type ThemeMode,
} from '@/app/theme';
import { soundManager } from '@/audio/soundManager';
import i18n from '@/i18n';
import type { FootManagerBridgeApi } from '../../electron/preload.js';

/**
 * Os 8 itens oficiais do menu lateral enxuto (Seção 10.1).
 */
export type NavSectionId =
  | 'squad'
  | 'competitions'
  | 'transfers'
  | 'finance'
  | 'youth'
  | 'national'
  | 'history'
  | 'system';

export interface PreviewPlayer {
  id: string;
  name: string;
  birthDate: string;
  primaryPosition: Position;
  secondaryPosition?: Position;
  overall: number;
  isStar: boolean;
  traits: PlayerTrait[];
  energy: number;
  morale: MoraleLevel;
}

export interface DemoClubProfile {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  stadiumName: string;
  stadiumCapacity: number;
  governance: ClubGovernance;
  investorTier: 0 | 1 | 2 | 3;
  cashBalanceLabel: string;
  squad: PreviewPlayer[];
}

/**
 * Clubes demonstrativos da Fase 0 para testar tema dinâmico (cores escuras, claras, vivas)
 * e validação visual de contraste WCAG em tempo real.
 */
export const DEMO_CLUBS: readonly DemoClubProfile[] = [
  {
    id: 'bra_flamengo',
    name: 'CR Flamengo',
    shortName: 'FLA',
    primaryColor: '#C8102E',
    secondaryColor: '#111111',
    stadiumName: 'Maracanã',
    stadiumCapacity: 78838,
    governance: 'associative',
    investorTier: 0,
    cashBalanceLabel: 'R$ 120,0 mi',
    squad: [
      { id: 'p1', name: 'Agustín Rossi', birthDate: '1995-08-21', primaryPosition: 'GOL', overall: 80, isStar: false, traits: ['PENALTIS', 'REFLEXO'], energy: 98, morale: 4 },
      { id: 'p2', name: 'Léo Ortiz', birthDate: '1996-01-03', primaryPosition: 'ZAG', secondaryPosition: 'VOL', overall: 81, isStar: false, traits: ['PASSE', 'DESARME'], energy: 95, morale: 4 },
      { id: 'p3', name: 'Giorgian De Arrascaeta', birthDate: '1994-06-01', primaryPosition: 'MEI', overall: 84, isStar: true, traits: ['ARMACAO', 'BOLA_PARADA'], energy: 89, morale: 5 },
      { id: 'p4', name: 'Pedro', birthDate: '1997-06-20', primaryPosition: 'ATA', overall: 83, isStar: true, traits: ['FINALIZACAO', 'CABECEIO'], energy: 92, morale: 4 },
    ],
  },
  {
    id: 'bra_palmeiras',
    name: 'SE Palmeiras',
    shortName: 'PAL',
    primaryColor: '#006437',
    secondaryColor: '#FFFFFF',
    stadiumName: 'Allianz Parque',
    stadiumCapacity: 43713,
    governance: 'associative',
    investorTier: 0,
    cashBalanceLabel: 'R$ 115,0 mi',
    squad: [
      { id: 'p5', name: 'Weverton', birthDate: '1987-12-13', primaryPosition: 'GOL', overall: 80, isStar: false, traits: ['REFLEXO', 'SAIDA_GOL'], energy: 96, morale: 4 },
      { id: 'p6', name: 'Gustavo Gómez', birthDate: '1993-05-06', primaryPosition: 'ZAG', overall: 82, isStar: true, traits: ['MARCACAO', 'CABECEIO'], energy: 93, morale: 4 },
      { id: 'p7', name: 'Raphael Veiga', birthDate: '1995-06-19', primaryPosition: 'MEI', overall: 82, isStar: true, traits: ['BOLA_PARADA', 'FINALIZACAO'], energy: 90, morale: 4 },
      { id: 'p8', name: 'Flaco López', birthDate: '2000-12-06', primaryPosition: 'ATA', overall: 78, isStar: false, traits: ['CABECEIO'], energy: 94, morale: 3 },
    ],
  },
  {
    id: 'bra_atletico_mg',
    name: 'Atlético Mineiro',
    shortName: 'CAM',
    primaryColor: '#18181B',
    secondaryColor: '#FAFAFA',
    stadiumName: 'Arena MRV',
    stadiumCapacity: 46000,
    governance: 'saf',
    investorTier: 2,
    cashBalanceLabel: 'R$ 65,0 mi',
    squad: [
      { id: 'p9', name: 'Everson', birthDate: '1990-07-22', primaryPosition: 'GOL', overall: 79, isStar: false, traits: ['SAIDA_GOL', 'REFLEXO'], energy: 97, morale: 4 },
      { id: 'p10', name: 'Guilherme Arana', birthDate: '1997-04-14', primaryPosition: 'LAT', secondaryPosition: 'MEI', overall: 80, isStar: false, traits: ['VELOCIDADE', 'PASSE'], energy: 91, morale: 4 },
      { id: 'p11', name: 'Gustavo Scarpa', birthDate: '1994-01-05', primaryPosition: 'MEI', overall: 80, isStar: false, traits: ['BOLA_PARADA', 'ARMACAO'], energy: 88, morale: 3 },
      { id: 'p12', name: 'Hulk', birthDate: '1986-07-25', primaryPosition: 'ATA', overall: 82, isStar: true, traits: ['FINALIZACAO', 'RESISTENCIA'], energy: 86, morale: 5 },
    ],
  },
  {
    id: 'arg_boca_demo',
    name: 'CA Boca Juniors',
    shortName: 'BOC',
    primaryColor: '#FACC15',
    secondaryColor: '#1E3A8A',
    stadiumName: 'La Bombonera',
    stadiumCapacity: 54000,
    governance: 'associative',
    investorTier: 0,
    cashBalanceLabel: 'US$ 28,5 mi',
    squad: [
      { id: 'p13', name: 'Sergio Romero', birthDate: '1987-02-22', primaryPosition: 'GOL', overall: 77, isStar: false, traits: ['PENALTIS'], energy: 95, morale: 3 },
      { id: 'p14', name: 'Edinson Cavani', birthDate: '1987-02-14', primaryPosition: 'ATA', overall: 79, isStar: true, traits: ['FINALIZACAO', 'CABECEIO'], energy: 82, morale: 4 },
    ],
  },
];

interface AppStoreState {
  activeSection: NavSectionId;
  theme: ThemeMode;
  activeClub: DemoClubProfile;
  themeTokens: ClubThemeTokens;
  currentYear: number;
  currentWeek: number;
  seed: number;
  isAdvancing: boolean;
  lastAdvanceResult: AdvanceWeekResult | null;
  audioEnabled: boolean;
  audioVolume: number;
  autoSave: boolean;
  runtimeMode: 'desktop' | 'browser-preview';
  saves: SaveSlotSummary[];
  activeSaveId: string | null;
  workerLatencyMs: number | null;
  statusMessage: string | null;

  initialize: () => Promise<void>;
  setActiveSection: (section: NavSectionId) => void;
  setTheme: (mode: ThemeMode) => Promise<void>;
  selectClub: (clubId: string) => void;
  setAudioConfig: (enabled: boolean, volume: number) => Promise<void>;
  setAutoSave: (enabled: boolean) => Promise<void>;
  advanceWeek: () => Promise<void>;
  refreshSaves: () => Promise<void>;
  createDemoSave: () => Promise<void>;
  loadSave: (saveId: string) => Promise<void>;
  verifySave: (saveId: string) => Promise<void>;
  deleteSave: (saveId: string) => Promise<void>;
  pingWorker: () => Promise<void>;
}

type SetState = StoreApi<AppStoreState>['setState'];
type GetState = StoreApi<AppStoreState>['getState'];

const initialClub = DEMO_CLUBS[0] as DemoClubProfile;
const initialTokens = resolveClubThemeTokens(
  initialClub.primaryColor,
  initialClub.secondaryColor,
  'dark',
);

/**
 * Retorna a ponte IPC segura exposta pelo preload do Electron, quando executando em modo desktop.
 */
function getDesktopApi(): FootManagerBridgeApi | undefined {
  return typeof window !== 'undefined' ? window.footManagerApi : undefined;
}

/**
 * Inicializa tema, áudio e sincroniza preferências + slots de save com o processo principal Electron.
 */
async function performInitialize(set: SetState, get: GetState): Promise<void> {
  const api = getDesktopApi();
  const { activeClub, theme, audioEnabled, audioVolume } = get();
  applyClubThemeToDocument(
    resolveClubThemeTokens(activeClub.primaryColor, activeClub.secondaryColor, theme),
    theme,
  );
  soundManager.configure(audioEnabled, audioVolume);
  if (!api) return;

  const [settingsRes, savesRes] = await Promise.all([api.getSettings(), api.listSaves()]);
  if (settingsRes.ok) {
    const nextTheme = settingsRes.data.theme;
    const nextTokens = resolveClubThemeTokens(
      activeClub.primaryColor,
      activeClub.secondaryColor,
      nextTheme,
    );
    applyClubThemeToDocument(nextTokens, nextTheme);
    soundManager.configure(settingsRes.data.audioEnabled, settingsRes.data.audioVolume);
    set({
      theme: nextTheme,
      themeTokens: nextTokens,
      audioEnabled: settingsRes.data.audioEnabled,
      audioVolume: settingsRes.data.audioVolume,
      autoSave: settingsRes.data.autoSave,
      runtimeMode: 'desktop',
    });
  } else {
    set({ statusMessage: i18n.t('status.loadSettingsError', { error: settingsRes.error.message }) });
  }

  if (savesRes.ok) {
    set({ saves: savesRes.data });
  } else {
    set({ statusMessage: i18n.t('status.listSavesError', { error: savesRes.error.message }) });
  }
}

/**
 * Alterna modo claro/escuro e persiste a escolha via IPC validado, relatando erros de gravação.
 */
async function performSetTheme(set: SetState, get: GetState, mode: ThemeMode): Promise<void> {
  const { activeClub } = get();
  const tokens = resolveClubThemeTokens(activeClub.primaryColor, activeClub.secondaryColor, mode);
  applyClubThemeToDocument(tokens, mode);
  soundManager.play('click');
  set({ theme: mode, themeTokens: tokens });

  const api = getDesktopApi();
  if (!api) return;
  const res = await api.updateSettings({ theme: mode });
  if (!res.ok) {
    set({ statusMessage: i18n.t('status.saveThemeError', { error: res.error.message }) });
  }
}

/**
 * Atualiza volume/mudo na Web Audio API e persiste via IPC.
 */
async function performSetAudioConfig(
  set: SetState,
  enabled: boolean,
  volume: number,
): Promise<void> {
  const clampedVolume = Math.max(0, Math.min(1, volume));
  soundManager.configure(enabled, clampedVolume);
  set({ audioEnabled: enabled, audioVolume: clampedVolume });

  const api = getDesktopApi();
  if (!api) return;
  const res = await api.updateSettings({ audioEnabled: enabled, audioVolume: clampedVolume });
  if (!res.ok) {
    set({ statusMessage: i18n.t('status.saveAudioError', { error: res.error.message }) });
  }
}

/**
 * Atualiza a preferência de auto-save semanal e persiste via IPC.
 */
async function performSetAutoSave(set: SetState, enabled: boolean): Promise<void> {
  soundManager.play('click');
  set({ autoSave: enabled });

  const api = getDesktopApi();
  if (!api) return;
  const res = await api.updateSettings({ autoSave: enabled });
  if (!res.ok) {
    set({ statusMessage: i18n.t('status.saveAutoSaveError', { error: res.error.message }) });
  }
}

/**
 * Avança 1 semana via Worker Thread (desktop) ou motor puro local (browser preview).
 */
async function performAdvanceWeek(set: SetState, get: GetState): Promise<void> {
  const state = get();
  if (state.isAdvancing) return;
  set({ isAdvancing: true });
  soundManager.play('whistle');

  try {
    const api = getDesktopApi();
    let result: AdvanceWeekResult;

    if (api) {
      const res = await api.advanceWeek({
        currentYear: state.currentYear,
        currentWeek: state.currentWeek,
        seed: state.seed,
        saveId: state.autoSave ? (state.activeSaveId ?? undefined) : undefined,
      });
      if (!res.ok) {
        set({ statusMessage: i18n.t('status.advanceWeekError', { error: res.error.message }) });
        return;
      }
      result = res.data;
    } else {
      result = advanceWorldWeek({
        currentYear: state.currentYear,
        currentWeek: state.currentWeek,
        seed: state.seed,
      });
    }

    set({
      currentYear: result.currentYear,
      currentWeek: result.currentWeek,
      seed: result.nextSeed,
      lastAdvanceResult: result,
      statusMessage: i18n.t('status.weekProcessed', {
        week: result.currentWeek,
        year: result.currentYear,
        ms: result.durationMs,
      }),
    });

    if (api && state.autoSave && state.activeSaveId) {
      const savesRes = await api.listSaves();
      if (savesRes.ok) set({ saves: savesRes.data });
    }
  } finally {
    set({ isAdvancing: false });
  }
}

/**
 * Recarrega a lista de saves em disco via IPC.
 */
async function performRefreshSaves(set: SetState): Promise<void> {
  const api = getDesktopApi();
  if (!api) return;
  const res = await api.listSaves();
  if (res.ok) {
    set({ saves: res.data });
  } else {
    set({ statusMessage: i18n.t('status.refreshSavesError', { error: res.error.message }) });
  }
}

/**
 * Cria um slot de save de demonstração em SQLite WAL + backup `.bak`.
 */
async function performCreateDemoSave(set: SetState, get: GetState): Promise<void> {
  const api = getDesktopApi();
  if (!api) return;
  const { activeClub } = get();
  const saveId = `carreira_${activeClub.shortName.toLowerCase()}_${Date.now().toString().slice(-5)}`;
  const res = await api.createSave({
    saveId,
    saveName: i18n.t('system.demoSaveName', { club: activeClub.name }),
    managerName: i18n.t('system.defaultManagerName'),
    managerNationality: 'BRA',
    clubId: activeClub.id,
    activeCountries: ['BRA'],
    enableBrazilianStateChampionships: true,
  });

  if (res.ok) {
    soundManager.play('goal');
    set({
      activeSaveId: res.data.saveId,
      currentYear: res.data.currentYear,
      currentWeek: res.data.currentWeek,
      seed: res.data.seed,
      statusMessage: i18n.t('status.saveCreated', { saveId: res.data.saveId }),
    });
    await get().refreshSaves();
  } else {
    set({ statusMessage: i18n.t('status.createSaveError', { error: res.error.message }) });
  }
}

/**
 * Carrega um save do disco (com suporte a recuperação automática via `.fmsave.bak`).
 */
async function performLoadSave(set: SetState, get: GetState, saveId: string): Promise<void> {
  const api = getDesktopApi();
  if (!api) return;
  const res = await api.loadSave(saveId);
  if (!res.ok) {
    set({ statusMessage: i18n.t('status.loadSaveError', { saveId, error: res.error.message }) });
    return;
  }

  const { metadata, recoveredFromBackup } = res.data;
  const managerClubId = metadata.humanManagers[0]?.clubId;
  if (managerClubId) {
    get().selectClub(managerClubId);
  }
  soundManager.play('click');
  set({
    activeSaveId: metadata.saveId,
    currentYear: metadata.currentYear,
    currentWeek: metadata.currentWeek,
    seed: metadata.seed,
    statusMessage: i18n.t(
      recoveredFromBackup ? 'status.saveLoadedRecovered' : 'status.saveLoaded',
      { saveName: metadata.saveName, week: metadata.currentWeek, year: metadata.currentYear },
    ),
  });
  await get().refreshSaves();
}

/**
 * Executa diagnóstico somente leitura (`PRAGMA quick_check`) em um slot de save.
 */
async function performVerifySave(set: SetState, saveId: string): Promise<void> {
  const api = getDesktopApi();
  if (!api) return;
  const res = await api.verifySave(saveId);
  if (res.ok) {
    set({
      statusMessage: i18n.t('status.saveVerifyResult', {
        saveId,
        mainStatus: res.data.mainOk ? i18n.t('status.verifyOk') : i18n.t('status.verifyFail'),
        backupStatus: res.data.backupOk
          ? i18n.t('status.verifyOk')
          : i18n.t('status.verifyMissing'),
        journal: res.data.journalMode ?? 'n/a',
      }),
    });
  } else {
    set({ statusMessage: i18n.t('status.verifySaveError', { saveId, error: res.error.message }) });
  }
}

/**
 * Remove um save e seus arquivos auxiliares via IPC.
 */
async function performDeleteSave(set: SetState, get: GetState, saveId: string): Promise<void> {
  const api = getDesktopApi();
  if (!api) return;
  const res = await api.deleteSave(saveId);
  if (res.ok) {
    set((prev) => ({
      activeSaveId: prev.activeSaveId === saveId ? null : prev.activeSaveId,
      statusMessage: i18n.t('status.saveDeleted', { saveId }),
    }));
    await get().refreshSaves();
  } else {
    set({ statusMessage: i18n.t('status.deleteSaveError', { saveId, error: res.error.message }) });
  }
}

/**
 * Mede a latência de ida e volta da Worker Thread dedicada de simulação.
 */
async function performPingWorker(set: SetState): Promise<void> {
  const api = getDesktopApi();
  if (!api) return;
  const started = performance.now();
  const res = await api.pingWorker();
  const elapsed = Number((performance.now() - started).toFixed(2));
  if (res.ok) {
    set({
      workerLatencyMs: elapsed,
      statusMessage: i18n.t('status.workerPingOk', { ms: elapsed }),
    });
  } else {
    set({ statusMessage: i18n.t('status.workerPingError', { error: res.error.message }) });
  }
}

/**
 * Store global Zustand gerenciando navegação, tema dinâmico, preferências, Worker e saves.
 */
export const useAppStore = create<AppStoreState>((set, get) => ({
  activeSection: 'squad',
  theme: 'dark',
  activeClub: initialClub,
  themeTokens: initialTokens,
  currentYear: 2026,
  currentWeek: 1,
  seed: 20260001,
  isAdvancing: false,
  lastAdvanceResult: null,
  audioEnabled: true,
  audioVolume: 0.6,
  autoSave: true,
  runtimeMode: getDesktopApi() ? 'desktop' : 'browser-preview',
  saves: [],
  activeSaveId: null,
  workerLatencyMs: null,
  statusMessage: null,

  initialize: () => performInitialize(set, get),
  setActiveSection: (section) => {
    soundManager.play('click');
    set({ activeSection: section });
  },
  setTheme: (mode) => performSetTheme(set, get, mode),
  selectClub: (clubId) => {
    const found = DEMO_CLUBS.find((club) => club.id === clubId);
    if (!found) return;
    const { theme } = get();
    const tokens = resolveClubThemeTokens(found.primaryColor, found.secondaryColor, theme);
    applyClubThemeToDocument(tokens, theme);
    soundManager.play('click');
    set({ activeClub: found, themeTokens: tokens });
  },
  setAudioConfig: (enabled, volume) => performSetAudioConfig(set, enabled, volume),
  setAutoSave: (enabled) => performSetAutoSave(set, enabled),
  advanceWeek: () => performAdvanceWeek(set, get),
  refreshSaves: () => performRefreshSaves(set),
  createDemoSave: () => performCreateDemoSave(set, get),
  loadSave: (saveId) => performLoadSave(set, get, saveId),
  verifySave: (saveId) => performVerifySave(set, saveId),
  deleteSave: (saveId) => performDeleteSave(set, get, saveId),
  pingWorker: () => performPingWorker(set),
}));
