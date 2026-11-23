import { z } from 'zod';
import { CountryCodeSchema, SeasonCycleSchema } from './country.schema.js';
import { EntityIdSchema } from './competition.schema.js';

/**
 * Conjunto padronizado das 6 posições de campo do FootManager (Seção 6.1).
 */
export const PositionSchema = z.enum(['GOL', 'ZAG', 'LAT', 'VOL', 'MEI', 'ATA']);

export type Position = z.infer<typeof PositionSchema>;

/**
 * Características especiais (traits) para jogadores de linha.
 */
export const OutfieldTraitSchema = z.enum([
  'FINALIZACAO',
  'ARMACAO',
  'PASSE',
  'DRIBLE',
  'VELOCIDADE',
  'CABECEIO',
  'DESARME',
  'MARCACAO',
  'RESISTENCIA',
  'BOLA_PARADA',
]);

/**
 * Características especiais (traits) exclusivas para goleiros.
 */
export const GoalkeeperTraitSchema = z.enum(['REFLEXO', 'SAIDA_GOL', 'PENALTIS']);

/**
 * União de todas as características especiais válidas.
 */
export const PlayerTraitSchema = z.union([OutfieldTraitSchema, GoalkeeperTraitSchema]);

export type PlayerTrait = z.infer<typeof PlayerTraitSchema>;

/**
 * Escala de moral simples do atleta (1=Péssima .. 5=Excelente).
 */
export const MoraleLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export type MoraleLevel = z.infer<typeof MoraleLevelSchema>;

/**
 * Validação de data ISO YYYY-MM-DD verificando calendário real.
 */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve seguir formato YYYY-MM-DD')
  .refine((raw) => {
    const [yearStr, monthStr, dayStr] = raw.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Data de nascimento inválida no calendário');

/**
 * Contrato completo de Jogador (Seção 6.1 e 8.1).
 */
export const PlayerSchema = z
  .object({
    id: EntityIdSchema,
    name: z.string().trim().min(2).max(100),
    nationality: CountryCodeSchema,
    birthDate: IsoDateSchema,
    primaryPosition: PositionSchema,
    secondaryPosition: PositionSchema.optional(),
    overall: z.number().int().min(1).max(99),
    potential: z.number().int().min(1).max(99),
    isStar: z.boolean().default(false),
    traits: z.array(PlayerTraitSchema).max(2).default([]),
    energy: z.number().finite().min(0).max(100).default(100),
    morale: MoraleLevelSchema.default(3),
    clubId: EntityIdSchema.nullable(),
    loanFromClubId: EntityIdSchema.nullable().optional(),
    loanBuyOptionValue: z.number().finite().min(0).nullable().optional(),
    contractEndSeason: z.number().int().min(2020).max(2200),
    contractEndCycle: SeasonCycleSchema,
    weeklySalary: z.number().finite().min(0),
    marketValue: z.number().finite().min(0),
    releaseClause: z.number().finite().min(0),
    injuryWeeks: z.number().int().min(0).max(104).default(0),
    yellowCardsAccumulated: z.number().int().min(0).max(50).default(0),
    suspensionMatches: z.number().int().min(0).max(30).default(0),
  })
  .refine((player) => new Set(player.traits).size === player.traits.length, {
    message: 'Jogador não pode possuir características (traits) duplicadas',
  })
  .refine(
    (player) =>
      player.secondaryPosition === undefined ||
      player.secondaryPosition !== player.primaryPosition,
    {
      message: 'secondaryPosition não deve ser igual à primaryPosition',
    },
  );

export type Player = z.infer<typeof PlayerSchema>;
