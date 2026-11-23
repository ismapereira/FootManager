import type {
  MatchSubstitutionState,
  MoraleLevel,
  Player,
  Position,
} from '@footmanager/schemas';
import { getPositionSuitabilityFactor } from '../tactics/formations.js';

/**
 * Entrada mínima de um titular escalado em uma vaga tática específica.
 */
export interface LineupAssignment {
  player: Pick<
    Player,
    'overall' | 'energy' | 'morale' | 'primaryPosition' | 'secondaryPosition' | 'isStar' | 'traits'
  >;
  assignedSlot: Position;
}

/**
 * Força consolidada por setor da equipe em campo (Seção 6.2).
 */
export interface SectorStrengths {
  gk: number;
  def: number;
  mid: number;
  att: number;
}

/**
 * Converte energia (0..100) em multiplicador de desempenho (1.00 >= 80% até 0.72 < 30%).
 */
export function calculateEnergyFactor(energy: number): number {
  const clamped = Math.max(0, Math.min(100, energy));
  if (clamped >= 80) return 1.0;
  if (clamped <= 30) return 0.72;
  // Interpolação linear suave entre 30% (0.72) e 80% (1.00)
  return Number((0.72 + ((clamped - 30) / 50) * 0.28).toFixed(4));
}

/**
 * Converte moral (1..5) em multiplicador de desempenho (0.94 Péssima a 1.06 Excelente).
 */
export function calculateMoraleFactor(morale: MoraleLevel): number {
  const factors: Record<MoraleLevel, number> = {
    1: 0.94,
    2: 0.97,
    3: 1.0,
    4: 1.03,
    5: 1.06,
  };
  return factors[morale];
}

/**
 * Fórmula oficial de força efetiva de um titular (Seção 6.2):
 * eff = overall × fatorEnergia × fatorMoral × fatorPosicao + bonusEstrela (+2.5)
 */
export function calculateEffectiveStrength(assignment: LineupAssignment): number {
  const { player, assignedSlot } = assignment;
  const energyFactor = calculateEnergyFactor(player.energy);
  const moraleFactor = calculateMoraleFactor(player.morale);
  const positionFactor = getPositionSuitabilityFactor(
    player.primaryPosition,
    player.secondaryPosition,
    assignedSlot,
  );
  const starBonus = player.isStar ? 2.5 : 0;

  const raw = player.overall * energyFactor * moraleFactor * positionFactor + starBonus;
  return Number(raw.toFixed(2));
}

/**
 * Calcula bônus incremental por características especiais (traits) relevantes a um setor.
 */
function calculateTraitBonus(
  traits: readonly string[],
  matchingTraits: readonly string[],
  bonusPerTrait: number,
): number {
  let bonus = 0;
  for (const trait of traits) {
    if (matchingTraits.includes(trait)) {
      bonus += bonusPerTrait;
    }
  }
  return bonus;
}

interface WeightedEntry {
  value: number;
  weight: number;
}

interface SectorBuckets {
  gk: WeightedEntry[];
  def: WeightedEntry[];
  mid: WeightedEntry[];
  att: WeightedEntry[];
}

/**
 * Calcula média ponderada de um setor evitando divisão por zero.
 */
function weightedAverage(entries: readonly WeightedEntry[]): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const entry of entries) {
    weightedSum += entry.value * entry.weight;
    totalWeight += entry.weight;
  }
  if (totalWeight === 0) return 0;
  return Number((weightedSum / totalWeight).toFixed(2));
}

/**
 * Registra a contribuição ponderada de um titular nos setores compatíveis com sua vaga tática.
 */
function addLineupContribution(buckets: SectorBuckets, assignment: LineupAssignment): void {
  const eff = calculateEffectiveStrength(assignment);
  const { traits } = assignment.player;

  switch (assignment.assignedSlot) {
    case 'GOL':
      buckets.gk.push({ value: eff + calculateTraitBonus(traits, ['REFLEXO', 'SAIDA_GOL'], 1.5), weight: 1.0 });
      break;
    case 'ZAG':
      buckets.def.push({
        value: eff + calculateTraitBonus(traits, ['DESARME', 'MARCACAO', 'CABECEIO'], 1.2),
        weight: 1.0,
      });
      break;
    case 'LAT':
      buckets.def.push({ value: eff + calculateTraitBonus(traits, ['DESARME', 'MARCACAO'], 1.0), weight: 0.9 });
      buckets.mid.push({ value: eff + calculateTraitBonus(traits, ['PASSE', 'VELOCIDADE'], 0.8), weight: 0.25 });
      break;
    case 'VOL':
      buckets.def.push({ value: eff + calculateTraitBonus(traits, ['DESARME', 'MARCACAO'], 1.0), weight: 0.4 });
      buckets.mid.push({ value: eff + calculateTraitBonus(traits, ['PASSE', 'ARMACAO'], 1.0), weight: 1.0 });
      break;
    case 'MEI':
      buckets.mid.push({ value: eff + calculateTraitBonus(traits, ['PASSE', 'ARMACAO'], 1.3), weight: 1.0 });
      buckets.att.push({ value: eff + calculateTraitBonus(traits, ['FINALIZACAO', 'DRIBLE'], 1.0), weight: 0.35 });
      break;
    case 'ATA':
      buckets.att.push({
        value: eff + calculateTraitBonus(traits, ['FINALIZACAO', 'DRIBLE', 'VELOCIDADE', 'CABECEIO'], 1.4),
        weight: 1.0,
      });
      break;
  }
}

/**
 * Calcula as forças dos 4 setores (GK, DEF, MID, ATT) a partir da escalação atual (Seção 6.2).
 */
export function calculateSectorStrengths(lineup: readonly LineupAssignment[]): SectorStrengths {
  const buckets: SectorBuckets = { gk: [], def: [], mid: [], att: [] };

  for (const assignment of lineup) {
    addLineupContribution(buckets, assignment);
  }

  return {
    gk: weightedAverage(buckets.gk),
    def: weightedAverage(buckets.def),
    mid: weightedAverage(buckets.mid),
    att: weightedAverage(buckets.att),
  };
}

/**
 * Calcula multiplicador do fator casa (+3% a +7%) com base na taxa de ocupação do estádio (0..1).
 */
export function calculateHomeAdvantageFactor(occupancyRatio: number): number {
  const clamped = Math.max(0, Math.min(1, occupancyRatio));
  return Number((1.03 + clamped * 0.04).toFixed(4));
}

/**
 * Valida se uma substituição pode ser realizada conforme a regra moderna 2026 (Seção 6.2):
 * - Até 5 substituições em no máximo 3 janelas durante o tempo regulamentar
 * - Substituições feitas no intervalo não consomem parada regulamentar
 * - Na prorrogação permite +1 substituição extra (total até 6)
 */
export function canMakeSubstitution(
  state: MatchSubstitutionState,
  context: { isHalftime: boolean; isExtraTime: boolean; isSameStoppageWindow?: boolean },
): { allowed: boolean; reason?: string } {
  const maxAllowed = context.isExtraTime
    ? Math.min(6, state.maxSubstitutions + (state.extraTimeSubUsed ? 0 : 1))
    : state.maxSubstitutions;

  if (state.substitutionsUsed >= maxAllowed) {
    return {
      allowed: false,
      reason: `Limite máximo de ${maxAllowed} substituições atingido.`,
    };
  }

  if (
    !context.isHalftime &&
    !context.isExtraTime &&
    !context.isSameStoppageWindow &&
    state.windowsUsedRegularTime >= state.maxRegularWindows
  ) {
    return {
      allowed: false,
      reason: `Limite máximo de ${state.maxRegularWindows} paradas regulamentares atingido.`,
    };
  }

  return { allowed: true };
}
