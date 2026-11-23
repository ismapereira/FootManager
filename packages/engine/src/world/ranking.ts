/**
 * Regras puras do Ranking Quadrienal de Clubes da Confederação (Seção 5.5),
 * utilizado para distribuir vagas do Mundial de Clubes de 32 equipes.
 */
export interface ContinentalPerformance {
  wins: number;
  draws: number;
  stagesAdvanced: number;
}

/**
 * Calcula pontuação de coeficiente continental (padrão FIFA: 3 pts vitória, 1 pt empate, 3 pts por fase).
 */
export function calculateClubCoefficientPoints(perf: ContinentalPerformance): number {
  return Math.max(0, perf.wins * 3 + perf.draws + perf.stagesAdvanced * 3);
}
