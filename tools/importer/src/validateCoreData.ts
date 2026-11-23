import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClubSchema,
  CompetitionSchema,
  CountrySchema,
  PatchManifestSchema,
  PlayerSchema,
  StadiumSchema,
  type Club,
  type Competition,
  type Country,
  type Player,
  type Stadium,
} from '@footmanager/schemas';
import { z } from 'zod';
import { normalizeSlug } from './normalize.js';

export interface CoreDataAuditReport {
  valid: boolean;
  countriesCount: number;
  competitionsCount: number;
  stadiumsCount: number;
  clubsCount: number;
  playersCount: number;
  errors: string[];
  warnings: string[];
}

function readJsonFileSafe(
  filePath: string,
  errors: string[],
): { ok: true; data: unknown } | { ok: false } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { ok: true, data: JSON.parse(content) as unknown };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'JSON inválido';
    errors.push(`Erro ao ler/parsear JSON "${filePath}": ${detail}`);
    return { ok: false };
  }
}

function validateArrayFile<T>(
  filePath: string,
  schema: z.ZodType<T>,
  label: string,
  errors: string[],
): T[] {
  if (!fs.existsSync(filePath)) return [];
  const readResult = readJsonFileSafe(filePath, errors);
  if (!readResult.ok) return [];
  const raw = readResult.data;
  const items = Array.isArray(raw) ? raw : [raw];
  const parsed: T[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const result = schema.safeParse(items[i]);
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
        .join('; ');
      errors.push(`[${filePath}#${i}] ${label} inválido: ${detail}`);
    } else {
      parsed.push(result.data);
    }
  }
  return parsed;
}

interface LoadedCoreEntities {
  countries: Country[];
  competitions: Competition[];
  stadiums: Stadium[];
  clubs: Club[];
  players: Player[];
}

/**
 * Valida a presença e o contrato Zod do arquivo `manifest.json` na raiz da base oficial.
 */
function validateCoreManifest(resolvedRoot: string, errors: string[]): void {
  const manifestPath = path.join(resolvedRoot, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    errors.push(`Manifesto obrigatório não encontrado: ${manifestPath}`);
    return;
  }

  const readManifest = readJsonFileSafe(manifestPath, errors);
  if (!readManifest.ok) return;

  const parsedManifest = PatchManifestSchema.safeParse(readManifest.data);
  if (!parsedManifest.success) {
    errors.push(`manifest.json inválido: ${parsedManifest.error.message}`);
  }
}

/**
 * Carrega e valida com Zod os JSONs de cada subpasta de país em `data/core/countries/`.
 */
function loadCountryEntities(resolvedRoot: string, errors: string[]): LoadedCoreEntities {
  const loaded: LoadedCoreEntities = {
    countries: [],
    competitions: [],
    stadiums: [],
    clubs: [],
    players: [],
  };

  const countriesDir = path.join(resolvedRoot, 'countries');
  if (!fs.existsSync(countriesDir)) return loaded;

  for (const entry of fs.readdirSync(countriesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(countriesDir, entry.name);
    loaded.countries.push(...validateArrayFile(path.join(dir, 'country.json'), CountrySchema, 'País', errors));
    loaded.competitions.push(
      ...validateArrayFile(path.join(dir, 'competitions.json'), CompetitionSchema, 'Competição', errors),
    );
    loaded.stadiums.push(...validateArrayFile(path.join(dir, 'stadiums.json'), StadiumSchema, 'Estádio', errors));
    loaded.clubs.push(...validateArrayFile(path.join(dir, 'clubs.json'), ClubSchema, 'Clube', errors));
    loaded.players.push(...validateArrayFile(path.join(dir, 'players.json'), PlayerSchema, 'Jogador', errors));
  }

  return loaded;
}

/**
 * Garante unicidade de IDs em uma coleção de entidades e devolve o conjunto de IDs encontrados.
 */
function collectUniqueIds(
  items: ReadonlyArray<{ id: string }>,
  entityLabel: string,
  errors: string[],
): Set<string> {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      errors.push(`ID duplicado em ${entityLabel}: "${item.id}"`);
    }
    seen.add(item.id);
  }
  return seen;
}

/**
 * Valida referências de país/estádio em competições, estádios e clubes, além do elenco mínimo jogável.
 */
function validateClubAndCompetitionReferences(
  entities: LoadedCoreEntities,
  countryIds: ReadonlySet<string>,
  stadiumIds: ReadonlySet<string>,
  strictSquadMinimum: boolean,
  errors: string[],
  warnings: string[],
): void {
  for (const competition of entities.competitions) {
    if (competition.countryId !== null && !countryIds.has(competition.countryId)) {
      errors.push(`Competição "${competition.id}" referencia país inexistente: "${competition.countryId}"`);
    }
  }

  for (const stadium of entities.stadiums) {
    if (!countryIds.has(stadium.countryId)) {
      errors.push(`Estádio "${stadium.id}" referencia país inexistente: "${stadium.countryId}"`);
    }
  }

  for (const club of entities.clubs) {
    if (!countryIds.has(club.countryId)) {
      errors.push(`Clube "${club.id}" referencia país inexistente: "${club.countryId}"`);
    }
    if (!stadiumIds.has(club.stadiumId)) {
      errors.push(`Clube "${club.id}" referencia estádio inexistente: "${club.stadiumId}"`);
    }

    if (club.isPlayable) {
      const squad = entities.players.filter((player) => player.clubId === club.id);
      const gks = squad.filter((player) => player.primaryPosition === 'GOL');
      if (squad.length < 20 || gks.length < 2) {
        const msg = `Clube jogável "${club.id}" possui ${squad.length} atletas (${gks.length} GOL); meta para produção: >= 20 atletas e >= 2 GOL.`;
        if (strictSquadMinimum) {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }
    }
  }
}

/**
 * Valida vínculos de clube/empréstimo e garante zero jogadores duplicados canonicamente (Seção 9).
 */
function validatePlayersIntegrity(
  players: readonly Player[],
  clubIds: ReadonlySet<string>,
  errors: string[],
): void {
  const seenCanonicalPlayers = new Map<string, { id: string; clubId: string | null }>();

  for (const player of players) {
    if (player.clubId !== null && !clubIds.has(player.clubId)) {
      errors.push(`Jogador "${player.id}" referencia clube inexistente: "${player.clubId}"`);
    }
    if (
      player.loanFromClubId !== undefined &&
      player.loanFromClubId !== null &&
      !clubIds.has(player.loanFromClubId)
    ) {
      errors.push(
        `Jogador "${player.id}" referencia clube de empréstimo inexistente: "${player.loanFromClubId}"`,
      );
    }

    const canonicalKey = `${player.nationality.toUpperCase()}:${player.birthDate}:${normalizeSlug(player.name)}`;
    const existingCanonical = seenCanonicalPlayers.get(canonicalKey);
    if (existingCanonical && existingCanonical.id !== player.id) {
      errors.push(
        `Jogador duplicado canonicamente ("${player.name}" / ${player.birthDate}): "${existingCanonical.id}" (${existingCanonical.clubId ?? 'Livre'}) vs "${player.id}" (${player.clubId ?? 'Livre'}).`,
      );
    } else {
      seenCanonicalPlayers.set(canonicalKey, { id: player.id, clubId: player.clubId });
    }
  }
}

/**
 * Audita a integridade completa da pasta modular `data/core/` (Seção 9):
 * - Valida manifest.json e entidades contra schemas Zod
 * - Detecta IDs duplicados e jogadores duplicados canonicamente
 * - Confirma que todos os clubes referenciam um estádio e país válidos
 * - Em modo `strictSquadMinimum`, exige >= 20 atletas e >= 2 goleiros por clube jogável
 */
export function validateCoreDataDirectory(
  coreDir: string,
  options?: { strictSquadMinimum?: boolean },
): CoreDataAuditReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const resolvedRoot = path.resolve(coreDir);

  validateCoreManifest(resolvedRoot, errors);
  const entities = loadCountryEntities(resolvedRoot, errors);

  const countryIds = collectUniqueIds(entities.countries, 'countries', errors);
  collectUniqueIds(entities.competitions, 'competitions', errors);
  const stadiumIds = collectUniqueIds(entities.stadiums, 'stadiums', errors);
  const clubIds = collectUniqueIds(entities.clubs, 'clubs', errors);
  collectUniqueIds(entities.players, 'players', errors);

  validateClubAndCompetitionReferences(
    entities,
    countryIds,
    stadiumIds,
    Boolean(options?.strictSquadMinimum),
    errors,
    warnings,
  );
  validatePlayersIntegrity(entities.players, clubIds, errors);

  return {
    valid: errors.length === 0,
    countriesCount: entities.countries.length,
    competitionsCount: entities.competitions.length,
    stadiumsCount: entities.stadiums.length,
    clubsCount: entities.clubs.length,
    playersCount: entities.players.length,
    errors,
    warnings,
  };
}

// Execução direta via CLI (`npm run validate:data`)
const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  const strict = process.argv.includes('--strict');
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const corePath = path.join(repoRoot, 'data', 'core');
  const report = validateCoreDataDirectory(corePath, { strictSquadMinimum: strict });

  console.log('=== Auditoria da Base Core (data/core) ===');
  console.log(
    `Países: ${report.countriesCount} | Competições: ${report.competitionsCount} | Estádios: ${report.stadiumsCount} | Clubes: ${report.clubsCount} | Jogadores: ${report.playersCount}`,
  );
  for (const warning of report.warnings) {
    console.warn(`[AVISO] ${warning}`);
  }
  for (const error of report.errors) {
    console.error(`[ERRO] ${error}`);
  }

  if (!report.valid) {
    process.exitCode = 1;
  } else {
    console.log('Auditoria concluída com sucesso.');
  }
}
