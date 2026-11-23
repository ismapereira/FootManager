import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type AdvanceWeekRequest,
  type AdvanceWeekResult,
  type AppSettings,
  type CreateSaveRequest,
  type IpcResponse,
  type SaveMetadata,
  type SaveSlotSummary,
  type UpdateSettingsRequest,
} from '@footmanager/schemas';

/**
 * Contrato tipado da ponte segura exposta via ContextBridge para o Renderer (Seção 4.2 e 11.1).
 * Apenas canais explícitos da whitelist IPC são acessíveis pela interface React.
 */
export interface FootManagerBridgeApi {
  getAppInfo: () => Promise<
    IpcResponse<{
      appName: string;
      appVersion: string;
      platform: string;
      savesDir: string;
      mode: 'desktop';
    }>
  >;
  getSettings: () => Promise<IpcResponse<AppSettings>>;
  updateSettings: (patch: UpdateSettingsRequest) => Promise<IpcResponse<AppSettings>>;
  listSaves: () => Promise<IpcResponse<SaveSlotSummary[]>>;
  createSave: (request: CreateSaveRequest) => Promise<IpcResponse<SaveMetadata>>;
  loadSave: (
    saveId: string,
  ) => Promise<IpcResponse<{ metadata: SaveMetadata; recoveredFromBackup: boolean }>>;
  persistSave: (metadata: SaveMetadata) => Promise<IpcResponse<SaveMetadata>>;
  deleteSave: (saveId: string) => Promise<IpcResponse<{ deleted: boolean }>>;
  verifySave: (saveId: string) => Promise<
    IpcResponse<{ mainOk: boolean; backupOk: boolean; journalMode: string | null }>
  >;
  pingWorker: () => Promise<IpcResponse<{ alive: boolean; timestamp: number }>>;
  advanceWeek: (request: AdvanceWeekRequest) => Promise<IpcResponse<AdvanceWeekResult>>;
}

const api: FootManagerBridgeApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (patch) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, patch),
  listSaves: () => ipcRenderer.invoke(IPC_CHANNELS.SAVES_LIST),
  createSave: (request) => ipcRenderer.invoke(IPC_CHANNELS.SAVES_CREATE, request),
  loadSave: (saveId) => ipcRenderer.invoke(IPC_CHANNELS.SAVES_LOAD, { saveId }),
  persistSave: (metadata) => ipcRenderer.invoke(IPC_CHANNELS.SAVES_SAVE, { metadata }),
  deleteSave: (saveId) => ipcRenderer.invoke(IPC_CHANNELS.SAVES_DELETE, { saveId }),
  verifySave: (saveId) => ipcRenderer.invoke(IPC_CHANNELS.SAVES_VERIFY, { saveId }),
  pingWorker: () => ipcRenderer.invoke(IPC_CHANNELS.SIMULATION_PING),
  advanceWeek: (request) => ipcRenderer.invoke(IPC_CHANNELS.SIMULATION_ADVANCE_WEEK, request),
};

contextBridge.exposeInMainWorld('footManagerApi', api);
