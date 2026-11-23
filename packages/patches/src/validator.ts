import {
  ClubSchema,
  CompetitionSchema,
  CountrySchema,
  PatchManifestSchema,
  PlayerSchema,
  StadiumSchema,
  type Club,
  type Competition,
  type PatchBundleData,
  type PatchManifest,
  type Player,
} from '@footmanager/schemas';
import { z } from 'zod';
import type { UnpackedFmpack } from './unpacker.js';

/**
 * Diagnóstico detalhado retornado pela validação de um pacote `.fmpack`.
 */
export interface PatchValidationResult {
  valid: boolean;
  bundle?: PatchBundleData;
  errors: string[];
  warnings: string[];
}

/**
 * Extrai e normaliza coleções JSON que podem estar em raiz (`country.json` / `countries.json`)
 * ou em subpastas modulares (`countries/bra/clubs.json`), mantendo compatibilidade com `data/core/`.
 */
function collectMatchingJsonEntries(
  jsonFiles: Record<string, unknown>,
  matcher: (filePath: string) => boolean,
): Array<{ filePath: string; value: unknown }> {
  return Object.entries(jsonFiles)
    .filter(([filePath]) => matcher(filePath))
    .map(([filePath, value]) => ({ filePath, value }));
}

/**
 * Converte tanto um objeto único quanto um array em lista uniforme para validação Zod.
 */
function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Valida uma coleção contra um schema Zod acumulando erros legíveis com nome do arquivo.
 */
function parseEntityArray<T>(
  entries: Array<{ filePath: string; value: unknown }>,
  schema: z.ZodType<T>,
  entityLabel: string,
  errors: string[],
): T[] {
  const parsed: T[] = [];

  for (const { filePath, value } of entries) {
    const items = toArray(value);
    for (let index = 0; index < items.length; index += 1) {
      const result = schema.safeParse(items[index]);
      if (!result.success) {
        const issueSummary = result.error.issues
          .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
          .join('; ');
        errors.push(`[${filePath}#${index}] ${entityLabel} inválido: ${issueSummary}`);
      } else {
        parsed.push(result.data);
      }
    }
  }

  return parsed;
}

/**
 * Calcula quantas semanas úteis estão disponíveis na janela `[startWeek..endWeek]` dentro do ano de 52 semanas.
 */
function calculateCompetitionWindowWeeks(competition: Competition): number {
  if (competition.seasonCycle === 'calendar_year' || competition.startWeek <= competition.endWeek) {
    return competition.endWeek - competition.startWeek + 1;
  }
  return 52 - competition.startWeek + 1 + competition.endWeek;
}

/**
 * Estima a quantidade mínima de datas exigidas pelo template/parâmetros da competição
 * para validar consistência de calendário dentro das 52 semanas (Seção 7.3).
 */
function estimateRequiredMatchDates(competition: Competition): number {
  const params = competition.params;
  const clubCount = typeof params['clubCount'] === 'number' ? params['clubCount'] : undefined;
  const legs = typeof params['legs'] === 'number' ? params['legs'] : 2;

  switch (competition.template) {
    case 'round_robin':
      if (clubCount && clubCount >= 2) {
        const roundsPerLeg = clubCount % 2 === 0 ? clubCount - 1 : clubCount;
        return roundsPerLeg * Math.max(1, legs);
      }
      return 1;
    case 'conferences_playoffs': {
      const regularMatches =
        typeof params['regularSeasonMatches'] === 'number' ? params['regularSeasonMatches'] : 0;
      const qualifiers =
        typeof params['playoffQualifiersPerConference'] === 'number'
          ? params['playoffQualifiersPerConference']
          : 0;
      const playoffRounds = qualifiers >= 2 ? Math.ceil(Math.log2(qualifiers * 2)) : 0;
      return regularMatches + playoffRounds;
    }
    case 'brazil_serie_c':
      return 27; // 19 turno único + 6 quadrangular + 2 final
    case 'brazil_serie_d':
      return 24; // 14 fase de grupos + 10 mata-mata (ida e volta)
    case 'brazil_state_standard':
      return 9;
    default:
      return 1;
  }
}

/**
 * Valida se todas as competições do pacote cabem nas suas janelas semanais (até 2 jogos/semana em calendários cheios).
 */
function validateCompetitionsCalendar(
  competitions: readonly Competition[],
  errors: string[],
  warnings: string[],
): void {
  for (const competition of competitions) {
    const availableWeeks = calculateCompetitionWindowWeeks(competition);
    const requiredDates = estimateRequiredMatchDates(competition);

    if (availableWeeks < 1 || availableWeeks > 52) {
      errors.push(
        `Competição "${competition.id}" possui janela semanal inválida (${availableWeeks} semanas).`,
      );
      continue;
    }

    // Calendários reais suportam no máximo 2 datas/semana (meio + fim de semana); acima disso é fisicamente inviável
    if (requiredDates > availableWeeks * 2 || requiredDates > 104) {
      errors.push(
        `Competição "${competition.id}" exige ~${requiredDates} datas, mas sua janela (S${competition.startWeek}–S${competition.endWeek}) oferece apenas ${availableWeeks} semana(s).`,
      );
    } else if (requiredDates > availableWeeks) {
      warnings.push(
        `Competição "${competition.id}" possui calendário apertado (~${requiredDates} datas em ${availableWeeks} semanas; exigirá rodadas no meio de semana).`,
      );
    }
  }
}

/**
 * Valida a existência e o formato do arquivo obrigatório `manifest.json` na raiz do pacote.
 */
function parsePatchManifest(
  unpacked: UnpackedFmpack,
): { ok: true; manifest: PatchManifest } | { ok: false; error: string } {
  const rawManifest = unpacked.jsonFiles['manifest.json'];
  if (!rawManifest) {
    return {
      ok: false,
      error: 'Arquivo obrigatório "manifest.json" não encontrado na raiz do pacote.',
    };
  }

  const manifestResult = PatchManifestSchema.safeParse(rawManifest);
  if (!manifestResult.success) {
    const details = manifestResult.error.issues
      .map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`)
      .join('; ');
    return { ok: false, error: `manifest.json inválido: ${details}` };
  }

  return { ok: true, manifest: manifestResult.data };
}

/**
 * Valida todas as coleções de entidades declarativas do pacote contra seus respectivos schemas Zod.
 */
function parseAllPatchEntities(
  jsonFiles: Record<string, unknown>,
  errors: string[],
): Omit<PatchBundleData, 'manifest' | 'badges'> {
  return {
    countries: parseEntityArray(
      collectMatchingJsonEntries(jsonFiles, (p) => /(^|\/)countr(y|ies)\.json$/i.test(p)),
      CountrySchema,
      'País',
      errors,
    ),
    competitions: parseEntityArray(
      collectMatchingJsonEntries(jsonFiles, (p) => /(^|\/)competitions?\.json$/i.test(p)),
      CompetitionSchema,
      'Competição',
      errors,
    ),
    stadiums: parseEntityArray(
      collectMatchingJsonEntries(jsonFiles, (p) => /(^|\/)stadiums?\.json$/i.test(p)),
      StadiumSchema,
      'Estádio',
      errors,
    ),
    clubs: parseEntityArray(
      collectMatchingJsonEntries(jsonFiles, (p) => /(^|\/)clubs?\.json$/i.test(p)),
      ClubSchema,
      'Clube',
      errors,
    ),
    players: parseEntityArray(
      collectMatchingJsonEntries(jsonFiles, (p) => /(^|\/)players?\.json$/i.test(p)),
      PlayerSchema,
      'Jogador',
      errors,
    ),
  };
}

/**
 * Emite avisos para clubes jogáveis com menos de 16 atletas ou menos de 2 goleiros (Seção 7.3).
 */
function validateSquadMinimums(
  clubs: readonly Club[],
  players: readonly Player[],
  warnings: string[],
): void {
  for (const club of clubs) {
    if (!club.isPlayable) continue;
    const squad = players.filter((player) => player.clubId === club.id);
    const goalkeepers = squad.filter((player) => player.primaryPosition === 'GOL');

    if (squad.length < 16) {
      warnings.push(
        `Clube "${club.name}" (${club.id}) possui apenas ${squad.length} jogadores (mínimo recomendado: 16; auto-preenchimento com juniores disponível).`,
      );
    }
    if (goalkeepers.length < 2) {
      warnings.push(
        `Clube "${club.name}" (${club.id}) possui apenas ${goalkeepers.length} goleiro(s) (mínimo recomendado: 2).`,
      );
    }
  }
}

/**
 * Valida todos os JSONs de um `.fmpack` desempacotado com Zod e verifica integridade básica de calendário e elencos.
 */
export function validateUnpackedFmpack(unpacked: UnpackedFmpack): PatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsedManifest = parsePatchManifest(unpacked);
  if (!parsedManifest.ok) {
    return { valid: false, errors: [parsedManifest.error], warnings };
  }

  const entities = parseAllPatchEntities(unpacked.jsonFiles, errors);

  // Verificação de consistência de calendário nas 52 semanas (Seção 7.3)
  validateCompetitionsCalendar(entities.competitions, errors, warnings);

  // Verificação de integridade de elencos mínimos para expansões ou patches com atletas (Seção 7.3)
  const shouldCheckSquads =
    entities.clubs.length > 0 &&
    (parsedManifest.manifest.type === 'expansion' || entities.players.length > 0);
  if (shouldCheckSquads) {
    validateSquadMinimums(entities.clubs, entities.players, warnings);
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return {
    valid: true,
    bundle: {
      manifest: parsedManifest.manifest,
      ...entities,
      badges: unpacked.badges,
    },
    errors,
    warnings,
  };
}
