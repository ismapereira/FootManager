import type {
  Club,
  Competition,
  Country,
  PatchBundleData,
  PatchConflict,
  Player,
  Stadium,
} from '@footmanager/schemas';
import { buildPlayerCanonicalKey } from './sanitizer.js';

/**
 * Pacote pronto para resolução com prioridade explícita de Load Order (0 = Base Oficial, 1..N = Patches).
 */
export interface PrioritizedPatchBundle {
  priority: number;
  bundle: PatchBundleData;
}

/**
 * Estado final resolvido pela composição de Base Oficial + Patches ativos.
 */
export interface ResolvedPatchWorld {
  countries: Country[];
  competitions: Competition[];
  stadiums: Stadium[];
  clubs: Club[];
  players: Player[];
  badges: Record<string, string>;
  conflicts: PatchConflict[];
  hasBlockingConflicts: boolean;
}

interface ResolutionState {
  countries: Map<string, { data: Country; ownerPatchId: string; ownerPriority: number }>;
  competitions: Map<string, { data: Competition; ownerPatchId: string; ownerPriority: number }>;
  stadiums: Map<string, { data: Stadium; ownerPatchId: string }>;
  clubs: Map<string, { data: Club; ownerPatchId: string }>;
  playersById: Map<string, { data: Player; ownerPatchId: string }>;
  playerIdByCanonicalKey: Map<string, string>;
  badges: Record<string, string>;
  conflicts: PatchConflict[];
}

/**
 * Executa merge parcial preservando propriedades já definidas na base quando o patch traz `undefined`.
 * Valores explícitos (incluindo `null`, `0`, `false` e `""`) sobrescrevem a base normalmente.
 */
function mergeDefinedFields<T extends object>(base: T, patch: T): T {
  const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as T;
}

/**
 * Compara duas versões SemVer (`major.minor.patch`). Retorna <0 se a < b, 0 se igual, >0 se a > b.
 */
function compareSemver(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Valida uma única cláusula `requires` de um manifesto contra o mapa de pacotes ativos (Camada 3).
 */
function validateSingleRequirement(
  patchId: string,
  requirement: string,
  installedVersions: ReadonlyMap<string, string>,
  conflicts: PatchConflict[],
): void {
  const match = /^([a-z0-9_-]+)(?:\s*>=\s*(\d+\.\d+\.\d+))?$/i.exec(requirement.trim());
  if (!match) {
    conflicts.push({
      layer: 3,
      severity: 'blocking',
      code: 'INVALID_REQUIREMENT_SYNTAX',
      message: `Dependência com sintaxe inválida em "${patchId}": "${requirement}".`,
      sourcePatchId: patchId,
    });
    return;
  }

  const requiredId = match[1] as string;
  const minVersion = match[2];
  const availableVersion = installedVersions.get(requiredId);

  if (!availableVersion) {
    conflicts.push({
      layer: 3,
      severity: 'blocking',
      code: 'MISSING_DEPENDENCY',
      message: `O patch "${patchId}" exige o pacote "${requiredId}", que não está ativo.`,
      sourcePatchId: patchId,
      entityId: requiredId,
    });
  } else if (minVersion && compareSemver(availableVersion, minVersion) < 0) {
    conflicts.push({
      layer: 3,
      severity: 'blocking',
      code: 'INCOMPATIBLE_DEPENDENCY_VERSION',
      message: `O patch "${patchId}" exige "${requiredId} >= ${minVersion}", mas a versão ativa é ${availableVersion}.`,
      sourcePatchId: patchId,
      entityId: requiredId,
    });
  }
}

/**
 * Verifica todas as dependências `requires` dos pacotes ativos (Camada 3).
 */
function validateDependencies(
  sorted: readonly PrioritizedPatchBundle[],
  conflicts: PatchConflict[],
): void {
  const installedVersions = new Map<string, string>();
  for (const item of sorted) {
    installedVersions.set(item.bundle.manifest.id, item.bundle.manifest.version);
  }

  for (const item of sorted) {
    const { id: patchId, requires } = item.bundle.manifest;
    for (const requirement of requires) {
      validateSingleRequirement(patchId, requirement, installedVersions, conflicts);
    }
  }
}

/**
 * Aplica países do patch aplicando bloqueio estrutural (Camada 3) ou merge parcial (Camada 1).
 */
function mergeCountries(
  state: ResolutionState,
  countries: readonly Country[],
  patchId: string,
  priority: number,
): void {
  for (const country of countries) {
    const existing = state.countries.get(country.id);
    if (!existing) {
      state.countries.set(country.id, { data: country, ownerPatchId: patchId, ownerPriority: priority });
      continue;
    }

    const structuralMismatch =
      existing.data.confederation !== country.confederation ||
      existing.data.seasonCycle !== country.seasonCycle;

    if (structuralMismatch && existing.ownerPriority > 0 && priority > 0) {
      state.conflicts.push({
        layer: 3,
        severity: 'blocking',
        code: 'STRUCTURAL_COUNTRY_CONFLICT',
        message: `Conflito estrutural no país "${country.id}": "${existing.ownerPatchId}" (${existing.data.confederation}/${existing.data.seasonCycle}) vs "${patchId}" (${country.confederation}/${country.seasonCycle}). Desative um dos patches.`,
        sourcePatchId: patchId,
        targetPatchId: existing.ownerPatchId,
        entityId: country.id,
      });
      continue;
    }

    state.conflicts.push({
      layer: 1,
      severity: 'warning',
      code: 'COUNTRY_OVERRIDE',
      message: `Patch "${patchId}" sobrescreveu dados do país "${country.id}" (anterior: "${existing.ownerPatchId}").`,
      sourcePatchId: patchId,
      targetPatchId: existing.ownerPatchId,
      entityId: country.id,
    });
    state.countries.set(country.id, {
      data: mergeDefinedFields(existing.data, country),
      ownerPatchId: patchId,
      ownerPriority: priority,
    });
  }
}

/**
 * Aplica uma única competição aplicando bloqueio estrutural (Camada 3) ou merge parcial (Camada 1).
 */
function mergeSingleCompetition(
  state: ResolutionState,
  competition: Competition,
  patchId: string,
  priority: number,
): void {
  const existing = state.competitions.get(competition.id);
  if (!existing) {
    state.competitions.set(competition.id, {
      data: competition,
      ownerPatchId: patchId,
      ownerPriority: priority,
    });
    return;
  }

  const structuralMismatch =
    existing.data.template !== competition.template ||
    existing.data.seasonCycle !== competition.seasonCycle;

  if (structuralMismatch && existing.ownerPriority > 0 && priority > 0) {
    state.conflicts.push({
      layer: 3,
      severity: 'blocking',
      code: 'STRUCTURAL_COMPETITION_CONFLICT',
      message: `Conflito estrutural na competição "${competition.id}": "${existing.ownerPatchId}" (${existing.data.template}/${existing.data.seasonCycle}) vs "${patchId}" (${competition.template}/${competition.seasonCycle}). Desative um dos patches.`,
      sourcePatchId: patchId,
      targetPatchId: existing.ownerPatchId,
      entityId: competition.id,
    });
    return;
  }

  state.conflicts.push({
    layer: 1,
    severity: 'warning',
    code: 'COMPETITION_OVERRIDE',
    message: `Patch "${patchId}" atualizou a competição "${competition.id}" (anterior: "${existing.ownerPatchId}").`,
    sourcePatchId: patchId,
    targetPatchId: existing.ownerPatchId,
    entityId: competition.id,
  });
  const mergedComp = mergeDefinedFields(existing.data, competition);
  mergedComp.params = mergeDefinedFields(existing.data.params, competition.params);
  state.competitions.set(competition.id, {
    data: mergedComp,
    ownerPatchId: patchId,
    ownerPriority: priority,
  });
}

/**
 * Aplica todas as competições de um patch respeitando Load Order e bloqueios estruturais.
 */
function mergeCompetitions(
  state: ResolutionState,
  competitions: readonly Competition[],
  patchId: string,
  priority: number,
): void {
  for (const competition of competitions) {
    mergeSingleCompetition(state, competition, patchId, priority);
  }
}

/**
 * Aplica estádios do patch fazendo merge parcial preservando campos opcionais da base (Camada 1).
 */
function mergeStadiums(
  state: ResolutionState,
  stadiums: readonly Stadium[],
  patchId: string,
): void {
  for (const stadium of stadiums) {
    const existing = state.stadiums.get(stadium.id);
    if (existing) {
      state.conflicts.push({
        layer: 1,
        severity: 'warning',
        code: 'STADIUM_OVERRIDE',
        message: `Patch "${patchId}" sobrescreveu estádio "${stadium.id}" (anterior: "${existing.ownerPatchId}").`,
        sourcePatchId: patchId,
        targetPatchId: existing.ownerPatchId,
        entityId: stadium.id,
      });
      state.stadiums.set(stadium.id, {
        data: mergeDefinedFields(existing.data, stadium),
        ownerPatchId: patchId,
      });
    } else {
      state.stadiums.set(stadium.id, { data: stadium, ownerPatchId: patchId });
    }
  }
}

/**
 * Aplica clubes do patch fazendo merge parcial preservando campos opcionais da base (Camada 1).
 */
function mergeClubs(state: ResolutionState, clubs: readonly Club[], patchId: string): void {
  for (const club of clubs) {
    const existing = state.clubs.get(club.id);
    if (existing) {
      state.conflicts.push({
        layer: 1,
        severity: 'warning',
        code: 'CLUB_OVERRIDE',
        message: `Patch "${patchId}" sobrescreveu clube "${club.id}" (anterior: "${existing.ownerPatchId}").`,
        sourcePatchId: patchId,
        targetPatchId: existing.ownerPatchId,
        entityId: club.id,
      });
      state.clubs.set(club.id, {
        data: mergeDefinedFields(existing.data, club),
        ownerPatchId: patchId,
      });
    } else {
      state.clubs.set(club.id, { data: club, ownerPatchId: patchId });
    }
  }
}

/**
 * Remove a chave canônica antiga de um jogador caso ela ainda aponte para o mesmo `id`.
 */
function removeStaleCanonicalKey(
  state: ResolutionState,
  previousPlayer: Player,
  nextCanonicalKey: string,
): void {
  const previousKey = buildPlayerCanonicalKey(
    previousPlayer.name,
    previousPlayer.birthDate,
    previousPlayer.nationality,
  );
  if (previousKey !== nextCanonicalKey && state.playerIdByCanonicalKey.get(previousKey) === previousPlayer.id) {
    state.playerIdByCanonicalKey.delete(previousKey);
  }
}

/**
 * Registra o conflito de sobrescrita (Camada 1) ou deduplicação de clube (Camada 2) de um atleta.
 */
function recordPlayerConflict(
  conflicts: PatchConflict[],
  previous: { data: Player; ownerPatchId: string },
  incoming: Player,
  patchId: string,
  forceLayer2 = false,
): void {
  const movedClubs = previous.data.clubId !== incoming.clubId;
  if (movedClubs || forceLayer2) {
    conflicts.push({
      layer: 2,
      severity: 'auto_resolved',
      code: 'PLAYER_DUPLICATE_CLUB_DEDUPLICATED',
      message: `Atleta "${incoming.name}" duplicado (${previous.data.clubId ?? 'Livre'} -> ${incoming.clubId ?? 'Livre'}). Mantido apenas no patch de maior prioridade "${patchId}".`,
      sourcePatchId: patchId,
      targetPatchId: previous.ownerPatchId,
      entityId: incoming.id,
    });
    return;
  }

  conflicts.push({
    layer: 1,
    severity: 'warning',
    code: 'PLAYER_OVERRIDE',
    message: `Patch "${patchId}" atualizou atributos do jogador "${incoming.name}" (${incoming.id}).`,
    sourcePatchId: patchId,
    targetPatchId: previous.ownerPatchId,
    entityId: incoming.id,
  });
}

/**
 * Resolve inserção, atualização e deduplicação canônica de um atleta (Camadas 1 e 2).
 * Também elimina registros órfãos caso um patch altere nome/nascimento/nacionalidade de um `id`
 * existente fazendo-o colidir com a chave canônica de outro `id` já presente no mundo.
 */
function mergeSinglePlayer(state: ResolutionState, player: Player, patchId: string): void {
  const canonicalKey = buildPlayerCanonicalKey(player.name, player.birthDate, player.nationality);
  const matchedIdByCanonical = state.playerIdByCanonicalKey.get(canonicalKey);
  const existingById = state.playersById.get(player.id);
  const collidingId =
    matchedIdByCanonical && matchedIdByCanonical !== player.id ? matchedIdByCanonical : undefined;
  const collidingEntry = collidingId ? state.playersById.get(collidingId) : undefined;

  if (!existingById && !collidingEntry) {
    state.playersById.set(player.id, { data: player, ownerPatchId: patchId });
    state.playerIdByCanonicalKey.set(canonicalKey, player.id);
    return;
  }

  if (existingById) {
    removeStaleCanonicalKey(state, existingById.data, canonicalKey);
  }

  if (collidingId && collidingEntry) {
    // Remove o duplicado antigo para evitar atleta órfão sob outro ID com a mesma chave canônica
    state.playersById.delete(collidingId);
    recordPlayerConflict(state.conflicts, collidingEntry, player, patchId, true);
  }

  if (existingById) {
    const shouldLogById = !collidingEntry || existingById.data.clubId !== player.clubId;
    if (shouldLogById) {
      recordPlayerConflict(state.conflicts, existingById, player, patchId);
    }
  }

  const baseRecord = existingById?.data ?? (collidingEntry as { data: Player }).data;
  state.playersById.set(player.id, {
    data: mergeDefinedFields(baseRecord, player),
    ownerPatchId: patchId,
  });
  state.playerIdByCanonicalKey.set(canonicalKey, player.id);
}

/**
 * Executa a resolução de conflitos em 3 camadas conforme DEC-010 e Seção 7.3:
 * - Camada 1 (Aviso Amarelo): merge parcial respeitando Load Order crescente.
 * - Camada 2 (Auto-Resolvido): deduplicação de jogador em 2 clubes (ID ou chave canônica).
 * - Camada 3 (Bloqueio Vermelho): conflito estrutural de país/competição ou dependência ausente.
 */
export function resolvePatchConflicts(
  bundles: readonly PrioritizedPatchBundle[],
): ResolvedPatchWorld {
  const sorted = [...bundles].sort((a, b) => a.priority - b.priority);
  const state: ResolutionState = {
    countries: new Map(),
    competitions: new Map(),
    stadiums: new Map(),
    clubs: new Map(),
    playersById: new Map(),
    playerIdByCanonicalKey: new Map(),
    badges: {},
    conflicts: [],
  };

  validateDependencies(sorted, state.conflicts);

  for (const { priority, bundle } of sorted) {
    const patchId = bundle.manifest.id;
    mergeCountries(state, bundle.countries, patchId, priority);
    mergeCompetitions(state, bundle.competitions, patchId, priority);
    mergeStadiums(state, bundle.stadiums, patchId);
    mergeClubs(state, bundle.clubs, patchId);
    for (const player of bundle.players) {
      mergeSinglePlayer(state, player, patchId);
    }
    Object.assign(state.badges, bundle.badges);
  }

  return {
    countries: Array.from(state.countries.values(), (entry) => entry.data),
    competitions: Array.from(state.competitions.values(), (entry) => entry.data),
    stadiums: Array.from(state.stadiums.values(), (entry) => entry.data),
    clubs: Array.from(state.clubs.values(), (entry) => entry.data),
    players: Array.from(state.playersById.values(), (entry) => entry.data),
    badges: state.badges,
    conflicts: state.conflicts,
    hasBlockingConflicts: state.conflicts.some((conflict) => conflict.severity === 'blocking'),
  };
}
