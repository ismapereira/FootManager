import type { ClubGovernance } from '@footmanager/schemas';
import { getGovernanceProfile } from '../finance/governance.js';

/**
 * Atualiza a confiança da diretoria (0..100) aplicando a penalidade mais rígida de clubes SAF (Seção 6.3).
 */
export function applyBoardConfidenceDelta(
  currentConfidence: number,
  rawDelta: number,
  governance: ClubGovernance,
  investorTier: 0 | 1 | 2 | 3 = 0,
): number {
  const profile = getGovernanceProfile(governance, investorTier);
  const adjustedDelta =
    rawDelta < 0 ? Math.round(rawDelta * profile.boardPressureMultiplier) : Math.round(rawDelta);

  return Math.max(0, Math.min(100, currentConfidence + adjustedDelta));
}
