/**
 * Linha padronizada de classificação usada em ligas e fases de grupos.
 */
export interface StandingRow {
  clubId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

/**
 * Critério oficial de ordenação de tabela (pontos -> vitórias -> saldo de gols -> gols pró -> ID).
 * Garante ordenação 100% determinística sem empates indefinidos.
 */
export function compareStandings(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;

  const goalDiffA = a.goalsFor - a.goalsAgainst;
  const goalDiffB = b.goalsFor - b.goalsAgainst;
  if (goalDiffB !== goalDiffA) return goalDiffB - goalDiffA;

  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.clubId.localeCompare(b.clubId);
}

/**
 * Retorna nova cópia ordenada da tabela de classificação.
 */
export function sortStandings(rows: readonly StandingRow[]): StandingRow[] {
  return [...rows].sort(compareStandings);
}
