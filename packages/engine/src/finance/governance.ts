import type { ClubGovernance } from '@footmanager/schemas';

/**
 * Regras financeiras e de pressão institucional entre Clube Associativo e SAF (Seção 6.3).
 */
export interface GovernanceProfile {
  governance: ClubGovernance;
  investorTier: 0 | 1 | 2 | 3;
  /** Multiplicador aplicado à queda de confiança quando metas não são cumpridas (SAF: +40%). */
  boardPressureMultiplier: number;
  /** Aporte base por janela proporcional ao porte do investidor (em moeda base do clube). */
  seasonalInjectionBase: number;
}

const SAF_INJECTION_BY_TIER: Record<0 | 1 | 2 | 3, number> = {
  0: 0,
  1: 5_000_000,
  2: 18_000_000,
  3: 45_000_000,
};

/**
 * Retorna perfil financeiro e institucional de um clube conforme sua governança.
 */
export function getGovernanceProfile(
  governance: ClubGovernance,
  investorTier: 0 | 1 | 2 | 3,
): GovernanceProfile {
  if (governance === 'saf') {
    return {
      governance,
      investorTier,
      boardPressureMultiplier: 1.4,
      seasonalInjectionBase: SAF_INJECTION_BY_TIER[investorTier],
    };
  }

  return {
    governance: 'associative',
    investorTier: 0,
    boardPressureMultiplier: 1.0,
    seasonalInjectionBase: 0,
  };
}
