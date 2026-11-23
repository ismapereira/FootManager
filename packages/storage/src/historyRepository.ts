import type { SqliteDatabase } from './sqliteClient.js';

export interface TopScorerRecord {
  playerId: string;
  playerName: string;
  clubId: string | null;
  appearances: number;
  goals: number;
  assists: number;
  averageRating: number;
}

export interface TrophyRecord {
  id: string;
  competitionId: string;
  seasonYear: number;
  clubId: string | null;
  nationalTeamId: string | null;
  managerId: string | null;
  awardedWeek: number;
}

/**
 * Repositório de consultas analíticas e históricas usando 100% prepared statements (Seção 8.2).
 */
export class HistoryRepository {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  /**
   * Retorna o ranking de artilheiros de uma competição em determinada temporada.
   */
  public getTopScorers(
    competitionId: string,
    seasonYear: number,
    limit = 20,
  ): TopScorerRecord[] {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const stmt = this.db.prepare(`
      SELECT
        s.player_id AS playerId,
        p.name AS playerName,
        s.club_id AS clubId,
        s.appearances AS appearances,
        s.goals AS goals,
        s.assists AS assists,
        s.average_rating AS averageRating
      FROM player_season_stats s
      INNER JOIN players p ON p.id = s.player_id
      WHERE s.competition_id = ? AND s.season_year = ?
      ORDER BY s.goals DESC, s.assists DESC, s.appearances ASC
      LIMIT ?
    `);

    return stmt.all(competitionId, seasonYear, safeLimit) as TopScorerRecord[];
  }

  /**
   * Retorna os títulos conquistados por um técnico ordenados do mais recente ao mais antigo.
   */
  public getManagerTrophies(managerId: string): TrophyRecord[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        competition_id AS competitionId,
        season_year AS seasonYear,
        club_id AS clubId,
        national_team_id AS nationalTeamId,
        manager_id AS managerId,
        awarded_week AS awardedWeek
      FROM trophies
      WHERE manager_id = ?
      ORDER BY season_year DESC, awarded_week DESC
    `);

    return stmt.all(managerId) as TrophyRecord[];
  }
}
