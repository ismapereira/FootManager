import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import {
  AdvanceWeekRequestSchema,
  AdvanceWeekResultSchema,
  AppSettingsSchema,
  CreateSaveRequestSchema,
  IPC_CHANNELS,
  PersistSaveRequestSchema,
  SaveIdRequestSchema,
  UpdateSettingsRequestSchema,
  type AppSettings,
  type CreateSaveRequest,
  type IpcResponse,
  type SaveMetadata,
} from '@footmanager/schemas';
import { SaveRepository } from '@footmanager/storage';
import type { Worker } from 'node:worker_threads';
import type {
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from './simulationWorker.js';

/**
 * Interface mínima do registrador IPC (compatível com `ipcMain` do Electron e fácil de testar em integração).
 */
export interface IpcRegistrar {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

export interface IpcHandlerContext {
  ipc: IpcRegistrar;
  appVersion: string;
  userDataDir: string;
  /** Fornecedor da Worker Thread ativa (permite reinício automático em caso de queda inesperada). */
  getWorker: () => Worker;
  workerRequestTimeoutMs?: number;
}

interface PendingWorkerRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Gerenciador resiliente de requisições correlacionadas com a Worker Thread de simulação.
 * Garante rejeição imediata em caso de crash, encerramento ou timeout (nunca trava a UI).
 */
export class SimulationWorkerBridge {
  private readonly getWorker: () => Worker;
  private readonly timeoutMs: number;
  private attachedWorker: Worker | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingWorkerRequest>();

  constructor(getWorker: () => Worker, timeoutMs = 15_000) {
    this.getWorker = getWorker;
    this.timeoutMs = timeoutMs;
    this.ensureAttached(this.getWorker());
  }

  private rejectAllPending(reason: string): void {
    for (const [requestId, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      this.pending.delete(requestId);
      entry.reject(new Error(reason));
    }
  }

  private ensureAttached(worker: Worker): void {
    if (this.attachedWorker === worker) return;
    this.attachedWorker = worker;

    worker.on('message', (msg: SimulationWorkerResponse) => {
      const entry = this.pending.get(msg.requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(msg.requestId);
      if (msg.ok) {
        entry.resolve(msg.data);
      } else {
        entry.reject(new Error(msg.error));
      }
    });

    worker.on('error', (error) => {
      this.attachedWorker = null;
      const detail = error instanceof Error ? error.message : 'erro desconhecido';
      this.rejectAllPending(`Worker de simulação falhou: ${detail}`);
    });

    worker.on('exit', (code) => {
      this.attachedWorker = null;
      this.rejectAllPending(`Worker de simulação encerrada inesperadamente (código ${code}).`);
    });
  }

  public request<T>(
    command: { type: 'ping' } | { type: 'advanceWeek'; payload: unknown },
  ): Promise<T> {
    const worker = this.getWorker();
    this.ensureAttached(worker);

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(requestId)) return;
        this.pending.delete(requestId);
        reject(new Error(`Timeout na Worker de simulação após ${this.timeoutMs} ms.`));
      }, this.timeoutMs);

      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      const payload: SimulationWorkerRequest =
        command.type === 'ping'
          ? { requestId, type: 'ping' }
          : { requestId, type: 'advanceWeek', payload: command.payload };

      try {
        worker.postMessage(payload);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(
          error instanceof Error ? error : new Error('Falha ao enviar mensagem para a Worker.'),
        );
      }
    });
  }
}

/**
 * Lê e valida `settings.json` do usuário retornando padrões seguros em caso de ausência ou erro.
 */
function readSettingsFile(settingsPath: string): AppSettings {
  if (!fs.existsSync(settingsPath)) {
    return AppSettingsSchema.parse({});
  }
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as unknown;
    return AppSettingsSchema.parse(raw);
  } catch {
    return AppSettingsSchema.parse({});
  }
}

/**
 * Grava `settings.json` de forma atômica (arquivo temporário + rename).
 */
function writeSettingsFile(settingsPath: string, settings: AppSettings): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2), 'utf-8');
  fs.renameSync(tempPath, settingsPath);
}

/**
 * Formata erros de validação Zod em mensagem limpa sem expor detalhes internos de schema ou stack traces.
 */
function formatZodError(error: ZodError): string {
  const details = error.issues
    .map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`)
    .join('; ');
  return `Dados inválidos: ${details}`;
}

/**
 * Envolve execução de handler IPC garantindo resposta padronizada sem vazar stack traces.
 */
async function safeIpc<T>(handler: () => Promise<T> | T): Promise<IpcResponse<T>> {
  try {
    const data = await handler();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: formatZodError(error),
        },
      };
    }
    const message = error instanceof Error ? error.message : 'Erro inesperado ao processar operação.';
    return {
      ok: false,
      error: {
        code: 'IPC_OPERATION_FAILED',
        message,
      },
    };
  }
}

/**
 * Constrói os metadados iniciais de uma nova carreira validada pelo schema `CreateSaveRequest`.
 */
function buildInitialSaveMetadata(req: CreateSaveRequest): SaveMetadata {
  return {
    saveId: req.saveId,
    saveName: req.saveName,
    schemaVersion: '1.0.0',
    currentYear: 2026,
    currentWeek: 1,
    seed: req.seed ?? Math.max(1, Math.floor(Date.now() % 2147483647)),
    activeCountries: req.activeCountries,
    enableBrazilianStateChampionships: req.enableBrazilianStateChampionships,
    appliedPatches: [{ id: 'core', version: '1.0.0', priority: 0 }],
    humanManagers: [
      {
        id: 'mgr_human_1',
        name: req.managerName,
        nationality: req.managerNationality,
        clubId: req.clubId,
        nationalTeamId: null,
        boardConfidence: 70,
        reputation: 35,
        careerPoints: 0,
      },
    ],
  };
}

/**
 * Registra canais IPC de informações do aplicativo e preferências persistidas em `settings.json`.
 */
function registerAppAndSettingsHandlers(
  ipc: IpcRegistrar,
  appVersion: string,
  savesDir: string,
  settingsPath: string,
): void {
  ipc.handle(IPC_CHANNELS.APP_GET_INFO, () =>
    safeIpc(() => ({
      appName: 'FootManager',
      appVersion,
      platform: process.platform,
      savesDir,
      mode: 'desktop' as const,
    })),
  );

  ipc.handle(IPC_CHANNELS.SETTINGS_GET, () =>
    safeIpc(() => readSettingsFile(settingsPath)),
  );

  ipc.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_event, rawPayload: unknown) =>
    safeIpc(() => {
      const patch = UpdateSettingsRequestSchema.parse(rawPayload);
      const current = readSettingsFile(settingsPath);
      const updated = AppSettingsSchema.parse({ ...current, ...patch });
      writeSettingsFile(settingsPath, updated);
      return updated;
    }),
  );
}

/**
 * Registra canais IPC de gerenciamento de saves SQLite WAL + backup `.bak`.
 */
function registerSaveHandlers(ipc: IpcRegistrar, saveRepository: SaveRepository): void {
  ipc.handle(IPC_CHANNELS.SAVES_LIST, () => safeIpc(() => saveRepository.listSaves()));

  ipc.handle(IPC_CHANNELS.SAVES_CREATE, (_event, rawPayload: unknown) =>
    safeIpc(() => saveRepository.saveCareer(buildInitialSaveMetadata(CreateSaveRequestSchema.parse(rawPayload)))),
  );

  ipc.handle(IPC_CHANNELS.SAVES_LOAD, (_event, rawPayload: unknown) =>
    safeIpc(() => saveRepository.loadCareer(SaveIdRequestSchema.parse(rawPayload).saveId)),
  );

  ipc.handle(IPC_CHANNELS.SAVES_SAVE, (_event, rawPayload: unknown) =>
    safeIpc(() => saveRepository.saveCareer(PersistSaveRequestSchema.parse(rawPayload).metadata)),
  );

  ipc.handle(IPC_CHANNELS.SAVES_DELETE, (_event, rawPayload: unknown) =>
    safeIpc(() => ({ deleted: saveRepository.deleteSave(SaveIdRequestSchema.parse(rawPayload).saveId) })),
  );

  ipc.handle(IPC_CHANNELS.SAVES_VERIFY, (_event, rawPayload: unknown) =>
    safeIpc(() => saveRepository.verifySaveIntegrity(SaveIdRequestSchema.parse(rawPayload).saveId)),
  );
}

/**
 * Registra canais IPC de diagnóstico e avanço semanal na Worker Thread de simulação.
 */
function registerSimulationHandlers(
  ipc: IpcRegistrar,
  workerBridge: SimulationWorkerBridge,
  saveRepository: SaveRepository,
  settingsPath: string,
): void {
  ipc.handle(IPC_CHANNELS.SIMULATION_PING, () =>
    safeIpc(() => workerBridge.request<{ alive: boolean; timestamp: number }>({ type: 'ping' })),
  );

  ipc.handle(IPC_CHANNELS.SIMULATION_ADVANCE_WEEK, (_event, rawPayload: unknown) =>
    safeIpc(async () => {
      const req = AdvanceWeekRequestSchema.parse(rawPayload);
      const rawResult = await workerBridge.request<unknown>({
        type: 'advanceWeek',
        payload: req,
      });
      const result = AdvanceWeekResultSchema.parse(rawResult);

      // Respeita a preferência `autoSave` antes de gravar automaticamente o progresso semanal no SQLite WAL
      if (req.saveId && readSettingsFile(settingsPath).autoSave) {
        const loaded = saveRepository.loadCareer(req.saveId);
        saveRepository.saveCareer({
          ...loaded.metadata,
          currentYear: result.currentYear,
          currentWeek: result.currentWeek,
          seed: result.nextSeed,
        });
      }

      return result;
    }),
  );
}

/**
 * Registra todos os canais da whitelist IPC validando 100% das entradas com Zod (Seção 11.1).
 */
export function registerIpcHandlers(context: IpcHandlerContext): void {
  const savesDir = path.join(context.userDataDir, 'saves');
  const settingsPath = path.join(context.userDataDir, 'settings.json');
  const saveRepository = new SaveRepository(savesDir);
  const workerBridge = new SimulationWorkerBridge(
    context.getWorker,
    context.workerRequestTimeoutMs ?? 15_000,
  );

  registerAppAndSettingsHandlers(context.ipc, context.appVersion, savesDir, settingsPath);
  registerSaveHandlers(context.ipc, saveRepository);
  registerSimulationHandlers(context.ipc, workerBridge, saveRepository, settingsPath);
}
