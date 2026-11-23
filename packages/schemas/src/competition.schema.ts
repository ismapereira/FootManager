import { z } from 'zod';
import { ConfederationSchema, CountryCodeSchema, SeasonCycleSchema } from './country.schema.js';

/**
 * Catálogo oficial dos 8 templates declarativos suportados pelo motor (Seção 7.2).
 * Permite criar novas ligas e copas via patch .fmpack sem alterar o código-fonte.
 */
export const CompetitionTemplateSchema = z.enum([
  'round_robin',
  'knockout',
  'groups_knockout',
  'swiss_league',
  'conferences_playoffs',
  'brazil_state_standard',
  'brazil_serie_c',
  'brazil_serie_d',
]);

export type CompetitionTemplate = z.infer<typeof CompetitionTemplateSchema>;

/**
 * Regra individual de classificação para torneio continental/internacional.
 */
export const ContinentalSlotSchema = z.object({
  target: z.string().trim().min(2).max(80),
  qualification: z.enum([
    'champion',
    'runner_up',
    'top_table',
    'cup_winner',
    'best_regular_season',
    'playoff_winner',
  ]),
  count: z.number().int().min(1).max(16),
});

export type ContinentalSlot = z.infer<typeof ContinentalSlotSchema>;

/**
 * Vínculo de uma competição nacional com vagas continentais da sua confederação.
 */
export const ContinentalBindingSchema = z.object({
  confederation: ConfederationSchema,
  slots: z.array(ContinentalSlotSchema).min(1),
});

export type ContinentalBinding = z.infer<typeof ContinentalBindingSchema>;

/**
 * Identificador seguro para entidades internas e patches (apenas slug alfanumérico e underscore).
 */
export const EntityIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{1,79}$/, 'ID deve conter apenas letras minúsculas, números, _ ou -');

/**
 * Contrato declarativo de competição (liga nacional, copa, estadual, continental ou mundial).
 */
export const CompetitionSchema = z
  .object({
    id: EntityIdSchema,
    countryId: CountryCodeSchema.nullable(),
    confederation: ConfederationSchema.optional(),
    name: z.string().trim().min(2).max(100),
    shortName: z.string().trim().min(2).max(24).optional(),
    tier: z.number().int().min(0).max(10),
    template: CompetitionTemplateSchema,
    seasonCycle: SeasonCycleSchema,
    startWeek: z.number().int().min(1).max(52),
    endWeek: z.number().int().min(1).max(52),
    optional: z.boolean().default(false),
    reputation: z.number().int().min(1).max(100).default(70),
    /**
     * Parâmetros específicos do template (ex.: nº de clubes, turnos, rebaixados, conferências).
     */
    params: z.record(z.string(), z.unknown()).default({}),
    continentalBinding: ContinentalBindingSchema.optional(),
  })
  .refine(
    (comp) => {
      // No ciclo dividido (split_year), uma liga pode começar na semana 32 e terminar na 21 do ano seguinte.
      if (comp.seasonCycle === 'calendar_year') {
        return comp.startWeek <= comp.endWeek;
      }
      return true;
    },
    {
      message: 'Em competições calendar_year, startWeek deve ser menor ou igual a endWeek',
    },
  );

export type Competition = z.infer<typeof CompetitionSchema>;
