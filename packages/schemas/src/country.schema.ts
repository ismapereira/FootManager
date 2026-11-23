import { z } from 'zod';

/**
 * Confederações continentais reconhecidas pelo motor global.
 */
export const ConfederationSchema = z.enum([
  'CONMEBOL',
  'UEFA',
  'AFC',
  'CONCACAF',
  'CAF',
  'OFC',
]);

export type Confederation = z.infer<typeof ConfederationSchema>;

/**
 * Ciclos de temporada suportados no calendário unificado de 52 semanas:
 * - calendar_year: janeiro a dezembro (ex.: Brasil, Argentina, Japão, MLS)
 * - split_year: agosto a maio/junho (ex.: ligas europeias, Arábia Saudita)
 */
export const SeasonCycleSchema = z.enum(['calendar_year', 'split_year']);

export type SeasonCycle = z.infer<typeof SeasonCycleSchema>;

/**
 * Identificador canônico de país em padrão ISO-3 maiúsculo (ex.: BRA, ENG, USA).
 */
export const CountryCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Código de país deve seguir ISO-3 maiúsculo (ex.: BRA)');

/**
 * Definição de janela de transferências nacional dentro das 52 semanas do ano.
 */
export const TransferWindowSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    startWeek: z.number().int().min(1).max(52),
    endWeek: z.number().int().min(1).max(52),
  })
  .refine((window) => window.startWeek <= window.endWeek, {
    message: 'startWeek da janela de transferências não pode ser maior que endWeek',
  });

export type TransferWindow = z.infer<typeof TransferWindowSchema>;

/**
 * Contrato completo de País no mundo do jogo e em patches .fmpack.
 */
export const CountrySchema = z.object({
  id: CountryCodeSchema,
  name: z.string().trim().min(2).max(80),
  confederation: ConfederationSchema,
  seasonCycle: SeasonCycleSchema,
  currencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/, 'Código de moeda deve seguir ISO-4217 (ex.: BRL, EUR)'),
  transferWindows: z.array(TransferWindowSchema).min(1).max(4),
  isPlayable: z.boolean().default(true),
  fifaRankingPoints: z.number().finite().min(0).max(3000).default(1200),
});

export type Country = z.infer<typeof CountrySchema>;
