import type {
  Formation,
  MarkingIntensity,
  Position,
  TacticalStyle,
} from '@footmanager/schemas';

/**
 * Distribuição de vagas por posição para cada formação tática (total sempre = 11 titulares).
 */
export const FORMATION_SLOTS: Record<Formation, readonly Position[]> = {
  '4-4-2': ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA'],
  '4-3-3': ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA', 'ATA'],
  '4-2-3-1': ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'VOL', 'MEI', 'MEI', 'MEI', 'ATA'],
  '3-5-2': ['GOL', 'ZAG', 'ZAG', 'ZAG', 'LAT', 'VOL', 'VOL', 'MEI', 'LAT', 'ATA', 'ATA'],
  '5-3-2': ['GOL', 'LAT', 'ZAG', 'ZAG', 'ZAG', 'LAT', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA'],
  '3-4-3': ['GOL', 'ZAG', 'ZAG', 'ZAG', 'LAT', 'VOL', 'MEI', 'LAT', 'ATA', 'ATA', 'ATA'],
  '4-1-4-1': ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'MEI', 'MEI', 'MEI', 'MEI', 'ATA'],
};

/**
 * Modificadores percentuais aplicados aos setores e consumo de energia conforme estilo de jogo (Seção 6.2).
 */
export interface TacticalModifiers {
  defMultiplier: number;
  midMultiplier: number;
  attMultiplier: number;
  energyDrainMultiplier: number;
}

const BASE_TACTICAL_MODIFIERS: Record<TacticalStyle, TacticalModifiers> = {
  balanced: { defMultiplier: 1.0, midMultiplier: 1.0, attMultiplier: 1.0, energyDrainMultiplier: 1.0 },
  attacking: { defMultiplier: 0.94, midMultiplier: 1.0, attMultiplier: 1.08, energyDrainMultiplier: 1.1 },
  defensive: { defMultiplier: 1.08, midMultiplier: 1.0, attMultiplier: 0.94, energyDrainMultiplier: 0.95 },
  counter_attack: { defMultiplier: 1.02, midMultiplier: 0.98, attMultiplier: 1.0, energyDrainMultiplier: 1.0 },
  high_press: { defMultiplier: 1.0, midMultiplier: 1.07, attMultiplier: 1.04, energyDrainMultiplier: 1.25 },
};

/**
 * Retorna modificadores táticos levando em conta o confronto contra o estilo adversário.
 * Contra-Ataque ganha +6% no Ataque contra adversário Ofensivo ou Pressão Alta (Seção 6.2).
 */
export function getTacticalModifiers(
  ownStyle: TacticalStyle,
  opponentStyle: TacticalStyle,
): TacticalModifiers {
  const base = { ...BASE_TACTICAL_MODIFIERS[ownStyle] };

  if (
    ownStyle === 'counter_attack' &&
    (opponentStyle === 'attacking' || opponentStyle === 'high_press')
  ) {
    base.attMultiplier = Number((base.attMultiplier + 0.06).toFixed(4));
  }

  return base;
}

/**
 * Modificadores de marcação: afeta defesa e risco relativo de faltas/cartões (Seção 6.2).
 */
export function getMarkingModifiers(marking: MarkingIntensity): {
  defMultiplier: number;
  foulRiskMultiplier: number;
} {
  switch (marking) {
    case 'light':
      return { defMultiplier: 0.97, foulRiskMultiplier: 0.7 };
    case 'normal':
      return { defMultiplier: 1.0, foulRiskMultiplier: 1.0 };
    case 'heavy':
      return { defMultiplier: 1.05, foulRiskMultiplier: 1.4 };
  }
}

/**
 * Calcula fator posicional conforme Seção 6.2:
 * - 1.00 na posição primária
 * - 0.97 na posição secundária
 * - 0.75 improvisado fora de posição (goleiro na linha ou linha no gol sofre penalidade mais severa: 0.45)
 */
export function getPositionSuitabilityFactor(
  primaryPosition: Position,
  secondaryPosition: Position | undefined,
  assignedSlot: Position,
): number {
  if (primaryPosition === assignedSlot) {
    return 1.0;
  }
  if (secondaryPosition && secondaryPosition === assignedSlot) {
    return 0.97;
  }
  if (primaryPosition === 'GOL' || assignedSlot === 'GOL') {
    return 0.45;
  }
  return 0.75;
}
