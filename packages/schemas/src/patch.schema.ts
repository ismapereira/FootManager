import { z } from 'zod';
import { CountryCodeSchema, CountrySchema } from './country.schema.js';
import { CompetitionSchema, EntityIdSchema } from './competition.schema.js';
import { ClubSchema, StadiumSchema } from './club.schema.js';
import { PlayerSchema } from './player.schema.js';

/**
 * Classificação de pacotes declarativos .fmpack (zero código executável - DEC-009).
 */
export const PatchTypeSchema = z.enum(['core', 'expansion', 'update', 'cosmetic']);

export type PatchType = z.infer<typeof PatchTypeSchema>;

/**
 * Manifesto obrigatório na raiz de cada arquivo .fmpack ou da base data/core/.
 */
export const PatchManifestSchema = z.object({
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'schemaVersion deve seguir SemVer (ex.: 1.0.0)'),
  id: EntityIdSchema,
  name: z.string().trim().min(2).max(120),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version deve seguir SemVer (ex.: 1.0.0)'),
  author: z.string().trim().min(1).max(80),
  type: PatchTypeSchema,
  requires: z.array(z.string().trim().min(1).max(80)).default([]),
  countriesAdded: z.array(CountryCodeSchema).default([]),
  countriesModified: z.array(CountryCodeSchema).default([]),
  description: z.string().trim().max(500).default(''),
});

export type PatchManifest = z.infer<typeof PatchManifestSchema>;

/**
 * Severidade das 3 camadas de resolução de conflitos (DEC-010):
 * - warning: Camada 1 (sobrescrita parcial por Load Order)
 * - auto_resolved: Camada 2 (deduplicação automática de atleta em 2 clubes)
 * - blocking: Camada 3 (conflito estrutural ou dependência ausente)
 */
export const PatchConflictSeveritySchema = z.enum(['warning', 'auto_resolved', 'blocking']);

export type PatchConflictSeverity = z.infer<typeof PatchConflictSeveritySchema>;

/**
 * Registro estruturado de um conflito detectado durante a composição de patches.
 */
export const PatchConflictSchema = z.object({
  layer: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  severity: PatchConflictSeveritySchema,
  code: z.string().trim().min(2).max(80),
  message: z.string().trim().min(2).max(400),
  sourcePatchId: EntityIdSchema,
  targetPatchId: EntityIdSchema.optional(),
  entityId: z.string().trim().min(1).max(120).optional(),
});

export type PatchConflict = z.infer<typeof PatchConflictSchema>;

/**
 * Entrada de patch configurado pelo usuário com prioridade explícita de Load Order.
 */
export const PatchLoadEntrySchema = z.object({
  manifest: PatchManifestSchema,
  priority: z.number().int().min(0).max(999),
  enabled: z.boolean().default(true),
  filePath: z.string().trim().min(1).max(500).optional(),
});

export type PatchLoadEntry = z.infer<typeof PatchLoadEntrySchema>;

/**
 * Carga útil de dados declarativos extraída e validada de um pack/patch.
 */
export const PatchBundleDataSchema = z.object({
  manifest: PatchManifestSchema,
  countries: z.array(CountrySchema).default([]),
  competitions: z.array(CompetitionSchema).default([]),
  stadiums: z.array(StadiumSchema).default([]),
  clubs: z.array(ClubSchema).default([]),
  players: z.array(PlayerSchema).default([]),
  /**
   * Mapa de escudos sanitizados (caminho relativo -> conteúdo seguro ou buffer em base64/UTF-8).
   */
  badges: z.record(z.string(), z.string()).default({}),
});

export type PatchBundleData = z.infer<typeof PatchBundleDataSchema>;
