import { z } from 'zod';
import { CountryCodeSchema } from './country.schema.js';
import { EntityIdSchema } from './competition.schema.js';

/**
 * Modelo de governança do clube conforme Seção 6.3:
 * - associative: clube associativo tradicional
 * - saf: Sociedade Anônima do Futebol / gestão com investidor
 */
export const ClubGovernanceSchema = z.enum(['associative', 'saf']);

export type ClubGovernance = z.infer<typeof ClubGovernanceSchema>;

/**
 * Validação estrita de cor hexadecimal (#RRGGBB) para o tema dinâmico da UI.
 */
export const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato hexadecimal #RRGGBB');

export type HexColor = z.infer<typeof HexColorSchema>;

/**
 * Caminho relativo seguro para escudos dentro de um pack (bloqueia path traversal e URLs).
 */
export const SafeAssetPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(
    /^[a-zA-Z0-9/_-]+\.(png|webp|svg)$/,
    'Caminho de escudo deve ser relativo e usar extensão .png, .webp ou .svg',
  )
  .refine((value) => !value.includes('..') && !value.startsWith('/'), {
    message: 'Caminho de escudo não pode conter ".." nem começar com "/"',
  });

/**
 * Contrato de Estádio real ou personalizado.
 */
export const StadiumSchema = z
  .object({
    id: EntityIdSchema,
    name: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(80),
    countryId: CountryCodeSchema,
    capacity: z.number().int().min(1000).max(150000),
    expansionMaxCapacity: z.number().int().min(1000).max(150000).optional(),
    maintenanceCostWeekly: z.number().finite().min(0).default(15000),
  })
  .refine(
    (stadium) =>
      stadium.expansionMaxCapacity === undefined ||
      stadium.expansionMaxCapacity >= stadium.capacity,
    {
      message: 'expansionMaxCapacity deve ser maior ou igual à capacity atual',
    },
  );

export type Stadium = z.infer<typeof StadiumSchema>;

/**
 * Contrato completo de Clube (Seção 8.1).
 */
export const ClubSchema = z.object({
  id: EntityIdSchema,
  countryId: CountryCodeSchema,
  stateCode: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Código estadual deve conter 2 letras maiúsculas (ex.: RJ, SP)')
    .optional(),
  name: z.string().trim().min(2).max(100),
  shortName: z.string().trim().min(2).max(4).transform((value) => value.toUpperCase()),
  primaryColor: HexColorSchema,
  secondaryColor: HexColorSchema,
  badgePath: SafeAssetPathSchema.optional(),
  stadiumId: EntityIdSchema,
  reputation: z.number().int().min(1).max(100),
  governance: ClubGovernanceSchema,
  investorTier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(0),
  cashBalance: z.number().finite(),
  youthAcademyLevel: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .default(3),
  isPlayable: z.boolean().default(true),
});

export type Club = z.infer<typeof ClubSchema>;
