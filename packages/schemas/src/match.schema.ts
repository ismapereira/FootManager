import { z } from 'zod';
import { EntityIdSchema } from './competition.schema.js';

/**
 * Estilos táticos rápidos inspirados no Brasfoot com equilíbrio moderno (Seção 6.2).
 */
export const TacticalStyleSchema = z.enum([
  'balanced',
  'attacking',
  'defensive',
  'counter_attack',
  'high_press',
]);

export type TacticalStyle = z.infer<typeof TacticalStyleSchema>;

/**
 * Intensidade de marcação em campo.
 */
export const MarkingIntensitySchema = z.enum(['light', 'normal', 'heavy']);

export type MarkingIntensity = z.infer<typeof MarkingIntensitySchema>;

/**
 * Formações táticas padrão suportadas pelo motor.
 */
export const FormationSchema = z.enum([
  '4-4-2',
  '4-3-3',
  '4-2-3-1',
  '3-5-2',
  '5-3-2',
  '3-4-3',
  '4-1-4-1',
]);

export type Formation = z.infer<typeof FormationSchema>;

/**
 * Tipos de eventos exibidos no feed minimalista de partida ao vivo.
 */
export const MatchEventTypeSchema = z.enum([
  'kickoff',
  'goal',
  'save',
  'yellow_card',
  'red_card',
  'injury',
  'substitution',
  'halftime',
  'fulltime',
]);

export type MatchEventType = z.infer<typeof MatchEventTypeSchema>;

/**
 * Registro de um evento cronológico de partida.
 */
export const MatchEventSchema = z.object({
  minute: z.number().int().min(0).max(130),
  addedTime: z.number().int().min(0).max(15).default(0),
  type: MatchEventTypeSchema,
  clubId: EntityIdSchema.nullable(),
  primaryPlayerId: EntityIdSchema.optional(),
  secondaryPlayerId: EntityIdSchema.optional(),
  descriptionKey: z.string().trim().min(1).max(120),
});

export type MatchEvent = z.infer<typeof MatchEventSchema>;

/**
 * Controle de substituições (regra oficial 2026: até 5 substituições em até 3 paradas + intervalo + 1 na prorrogação).
 */
export const MatchSubstitutionStateSchema = z.object({
  substitutionsUsed: z.number().int().min(0).max(6).default(0),
  windowsUsedRegularTime: z.number().int().min(0).max(3).default(0),
  extraTimeSubUsed: z.boolean().default(false),
  maxSubstitutions: z.number().int().min(1).max(6).default(5),
  maxRegularWindows: z.number().int().min(1).max(3).default(3),
});

export type MatchSubstitutionState = z.infer<typeof MatchSubstitutionStateSchema>;

/**
 * Estatísticas agregadas de cada equipe em uma partida.
 */
export const MatchTeamStatsSchema = z.object({
  clubId: EntityIdSchema,
  goals: z.number().int().min(0).default(0),
  possessionPct: z.number().min(0).max(100).default(50),
  shots: z.number().int().min(0).default(0),
  shotsOnTarget: z.number().int().min(0).default(0),
  yellowCards: z.number().int().min(0).default(0),
  redCards: z.number().int().min(0).default(0),
  formation: FormationSchema.default('4-4-2'),
  tacticalStyle: TacticalStyleSchema.default('balanced'),
  marking: MarkingIntensitySchema.default('normal'),
  substitutions: MatchSubstitutionStateSchema.default({
    substitutionsUsed: 0,
    windowsUsedRegularTime: 0,
    extraTimeSubUsed: false,
    maxSubstitutions: 5,
    maxRegularWindows: 3,
  }),
});

export type MatchTeamStats = z.infer<typeof MatchTeamStatsSchema>;

/**
 * Estado completo de uma partida (em andamento ou encerrada).
 */
export const MatchStateSchema = z.object({
  matchId: EntityIdSchema,
  competitionId: EntityIdSchema,
  seasonYear: z.number().int().min(2020).max(2200),
  week: z.number().int().min(1).max(52),
  stadiumId: EntityIdSchema,
  attendance: z.number().int().min(0),
  minute: z.number().int().min(0).max(130).default(0),
  status: z.enum(['scheduled', 'live', 'halftime', 'extra_time', 'finished']).default('scheduled'),
  home: MatchTeamStatsSchema,
  away: MatchTeamStatsSchema,
  events: z.array(MatchEventSchema).default([]),
});

export type MatchState = z.infer<typeof MatchStateSchema>;
