import { z } from 'zod';
import { EntityIdSchema } from './competition.schema.js';
import { AppSettingsSchema, SaveIdSchema, SaveMetadataSchema } from './save.schema.js';
import { CountryCodeSchema } from './country.schema.js';

/**
 * Whitelist oficial de canais IPC permitidos entre Renderer e Main Process.
 * Nenhum canal fora desta lista pode ser registrado ou invocado.
 */
export const IPC_CHANNELS = {
  APP_GET_INFO: 'app:getInfo',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SAVES_LIST: 'saves:list',
  SAVES_CREATE: 'saves:create',
  SAVES_LOAD: 'saves:load',
  SAVES_SAVE: 'saves:save',
  SAVES_DELETE: 'saves:delete',
  SAVES_VERIFY: 'saves:verify',
  SIMULATION_PING: 'simulation:ping',
  SIMULATION_ADVANCE_WEEK: 'simulation:advanceWeek',
} as const;

export type IpcChannelName = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/**
 * Payload validado para criação de um novo save (carreira).
 */
export const CreateSaveRequestSchema = z.object({
  saveId: SaveIdSchema,
  saveName: z.string().trim().min(2).max(100),
  managerName: z.string().trim().min(2).max(80),
  managerNationality: CountryCodeSchema.default('BRA'),
  clubId: EntityIdSchema.nullable().default('bra_flamengo'),
  activeCountries: z.array(CountryCodeSchema).min(1).default(['BRA']),
  enableBrazilianStateChampionships: z.boolean().default(true),
  seed: z.number().int().min(1).max(2147483647).optional(),
});

export type CreateSaveRequest = z.infer<typeof CreateSaveRequestSchema>;

/**
 * Payload validado para operações que recebem apenas o saveId.
 */
export const SaveIdRequestSchema = z.object({
  saveId: SaveIdSchema,
});

export type SaveIdRequest = z.infer<typeof SaveIdRequestSchema>;

/**
 * Payload validado para atualização parcial das preferências do aplicativo.
 */
export const UpdateSettingsRequestSchema = AppSettingsSchema.partial();

export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;

/**
 * Payload validado para avanço semanal executado na Worker Thread de simulação.
 */
export const AdvanceWeekRequestSchema = z.object({
  currentYear: z.number().int().min(2024).max(2500),
  currentWeek: z.number().int().min(1).max(52),
  seed: z.number().int().min(1).max(2147483647),
  saveId: SaveIdSchema.optional(),
});

export type AdvanceWeekRequest = z.infer<typeof AdvanceWeekRequestSchema>;

/**
 * Resultado padronizado do avanço de semana retornado pela Worker Thread.
 */
export const AdvanceWeekResultSchema = z.object({
  previousYear: z.number().int(),
  previousWeek: z.number().int(),
  currentYear: z.number().int(),
  currentWeek: z.number().int(),
  isFifaDate: z.boolean(),
  isSplitYearRollover: z.boolean(),
  isCalendarYearRollover: z.boolean(),
  nextSeed: z.number().int(),
  durationMs: z.number().min(0),
});

export type AdvanceWeekResult = z.infer<typeof AdvanceWeekResultSchema>;

/**
 * Payload para salvar metadados atualizados de uma carreira existente.
 */
export const PersistSaveRequestSchema = z.object({
  metadata: SaveMetadataSchema,
});

export type PersistSaveRequest = z.infer<typeof PersistSaveRequestSchema>;

/**
 * Envelope padrão de resposta IPC evitando vazamento de erros internos não tratados.
 */
export type IpcResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
