import { z } from 'zod';
import { CountryCodeSchema } from './country.schema.js';
import { EntityIdSchema } from './competition.schema.js';

/**
 * Validação estrita de identificador de save para impedir path traversal no disco.
 */
export const SaveIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{3,64}$/, 'saveId deve conter apenas letras, números, _ ou - (3 a 64 caracteres)');

export type SaveId = z.infer<typeof SaveIdSchema>;

/**
 * Registro de técnico humano. Na v1 há exatamente 1 técnico no array,
 * mas a estrutura já nasce preparada para Hotseat Local na v2 (DEC-007).
 */
export const HumanManagerSchema = z.object({
  id: EntityIdSchema,
  name: z.string().trim().min(2).max(80),
  nationality: CountryCodeSchema,
  clubId: EntityIdSchema.nullable(),
  nationalTeamId: CountryCodeSchema.nullable().default(null),
  boardConfidence: z.number().int().min(0).max(100).default(70),
  reputation: z.number().int().min(1).max(100).default(35),
  careerPoints: z.number().int().min(0).default(0),
});

export type HumanManager = z.infer<typeof HumanManagerSchema>;

/**
 * Registro mínimo de patch gravado no snapshot de um save (isolamento total pós-criação).
 */
export const AppliedPatchSnapshotSchema = z.object({
  id: EntityIdSchema,
  version: z.string().min(1).max(32),
  priority: z.number().int().min(0),
});

/**
 * Metadados principais persistidos na tabela `meta` do banco SQLite `.fmsave` (Seção 8.1).
 */
export const SaveMetadataSchema = z.object({
  saveId: SaveIdSchema,
  saveName: z.string().trim().min(1).max(100),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  currentYear: z.number().int().min(2024).max(2500),
  currentWeek: z.number().int().min(1).max(52),
  seed: z.number().int().min(1).max(2147483647),
  activeCountries: z.array(CountryCodeSchema).min(1),
  enableBrazilianStateChampionships: z.boolean().default(true),
  appliedPatches: z.array(AppliedPatchSnapshotSchema).default([]),
  humanManagers: z.array(HumanManagerSchema).min(1),
  updatedAt: z.string().datetime().optional(),
});

export type SaveMetadata = z.infer<typeof SaveMetadataSchema>;

/**
 * Resumo leve de um slot de save para exibição na lista de carregamento.
 */
export const SaveSlotSummarySchema = z.object({
  saveId: SaveIdSchema,
  saveName: z.string(),
  currentYear: z.number().int(),
  currentWeek: z.number().int(),
  managerName: z.string(),
  clubId: z.string().nullable(),
  hasBackup: z.boolean(),
  integrityOk: z.boolean(),
  updatedAt: z.string(),
  fileSizeBytes: z.number().int().min(0),
});

export type SaveSlotSummary = z.infer<typeof SaveSlotSummarySchema>;

/**
 * Preferências persistentes globais do aplicativo (tema, idioma, áudio e auto-save).
 */
export const AppSettingsSchema = z.object({
  theme: z.enum(['dark', 'light']).default('dark'),
  locale: z.enum(['pt-BR', 'en-US', 'es-ES']).default('pt-BR'),
  audioEnabled: z.boolean().default(true),
  audioVolume: z.number().min(0).max(1).default(0.6),
  autoSave: z.boolean().default(true),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;
