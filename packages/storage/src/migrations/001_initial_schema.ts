/**
 * Migração inicial v1 do banco autocontido `.fmsave` (Seção 8.2).
 * Cria todas as tabelas normalizadas e índices estratégicos de busca e histórico.
 */
export const MIGRATION_001_INITIAL_SCHEMA = {
  version: 1,
  name: '001_initial_schema',
  sql: `
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS countries (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      confederation TEXT NOT NULL,
      season_cycle TEXT NOT NULL,
      currency_code TEXT NOT NULL,
      transfer_windows_json TEXT NOT NULL,
      is_playable INTEGER NOT NULL DEFAULT 1,
      fifa_ranking_points REAL NOT NULL DEFAULT 1200
    );

    CREATE TABLE IF NOT EXISTS competitions (
      id TEXT PRIMARY KEY NOT NULL,
      country_id TEXT,
      confederation TEXT,
      name TEXT NOT NULL,
      short_name TEXT,
      tier INTEGER NOT NULL,
      template TEXT NOT NULL,
      season_cycle TEXT NOT NULL,
      start_week INTEGER NOT NULL,
      end_week INTEGER NOT NULL,
      optional INTEGER NOT NULL DEFAULT 0,
      reputation INTEGER NOT NULL DEFAULT 70,
      params_json TEXT NOT NULL DEFAULT '{}',
      continental_binding_json TEXT,
      FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS competition_seasons (
      id TEXT PRIMARY KEY NOT NULL,
      competition_id TEXT NOT NULL,
      season_year INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      champion_club_id TEXT,
      runner_up_club_id TEXT,
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stadiums (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      country_id TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      expansion_max_capacity INTEGER,
      maintenance_cost_weekly REAL NOT NULL DEFAULT 15000,
      FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS clubs (
      id TEXT PRIMARY KEY NOT NULL,
      country_id TEXT NOT NULL,
      state_code TEXT,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      primary_color TEXT NOT NULL,
      secondary_color TEXT NOT NULL,
      badge_path TEXT,
      stadium_id TEXT NOT NULL,
      reputation INTEGER NOT NULL,
      governance TEXT NOT NULL DEFAULT 'associative',
      investor_tier INTEGER NOT NULL DEFAULT 0,
      cash_balance REAL NOT NULL DEFAULT 0,
      youth_academy_level INTEGER NOT NULL DEFAULT 3,
      is_playable INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE RESTRICT,
      FOREIGN KEY (stadium_id) REFERENCES stadiums(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      nationality TEXT NOT NULL,
      birth_date TEXT NOT NULL,
      primary_position TEXT NOT NULL,
      secondary_position TEXT,
      overall INTEGER NOT NULL,
      potential INTEGER NOT NULL,
      is_star INTEGER NOT NULL DEFAULT 0,
      traits_json TEXT NOT NULL DEFAULT '[]',
      energy REAL NOT NULL DEFAULT 100,
      morale INTEGER NOT NULL DEFAULT 3,
      club_id TEXT,
      loan_from_club_id TEXT,
      loan_buy_option_value REAL,
      contract_end_season INTEGER NOT NULL,
      contract_end_cycle TEXT NOT NULL,
      weekly_salary REAL NOT NULL DEFAULT 0,
      market_value REAL NOT NULL DEFAULT 0,
      release_clause REAL NOT NULL DEFAULT 0,
      injury_weeks INTEGER NOT NULL DEFAULT 0,
      yellow_cards_accumulated INTEGER NOT NULL DEFAULT 0,
      suspension_matches INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL,
      FOREIGN KEY (loan_from_club_id) REFERENCES clubs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS standings (
      competition_id TEXT NOT NULL,
      season_year INTEGER NOT NULL,
      group_name TEXT NOT NULL DEFAULT 'MAIN',
      club_id TEXT NOT NULL,
      played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      goals_for INTEGER NOT NULL DEFAULT 0,
      goals_against INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (competition_id, season_year, group_name, club_id),
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fixtures (
      id TEXT PRIMARY KEY NOT NULL,
      competition_id TEXT NOT NULL,
      season_year INTEGER NOT NULL,
      year INTEGER NOT NULL,
      week INTEGER NOT NULL,
      round_label TEXT NOT NULL,
      home_club_id TEXT NOT NULL,
      away_club_id TEXT NOT NULL,
      stadium_id TEXT,
      home_goals INTEGER,
      away_goals INTEGER,
      attendance INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'scheduled',
      events_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY (home_club_id) REFERENCES clubs(id) ON DELETE CASCADE,
      FOREIGN KEY (away_club_id) REFERENCES clubs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY NOT NULL,
      player_id TEXT NOT NULL,
      from_club_id TEXT,
      to_club_id TEXT,
      transfer_type TEXT NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      buy_option_value REAL,
      effective_year INTEGER NOT NULL,
      effective_week INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS managers (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      nationality TEXT NOT NULL,
      is_human INTEGER NOT NULL DEFAULT 0,
      club_id TEXT,
      national_team_id TEXT,
      board_confidence INTEGER NOT NULL DEFAULT 70,
      reputation INTEGER NOT NULL DEFAULT 35,
      career_points INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS trophies (
      id TEXT PRIMARY KEY NOT NULL,
      competition_id TEXT NOT NULL,
      season_year INTEGER NOT NULL,
      club_id TEXT,
      national_team_id TEXT,
      manager_id TEXT,
      awarded_week INTEGER NOT NULL,
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL,
      FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS player_season_stats (
      player_id TEXT NOT NULL,
      competition_id TEXT NOT NULL,
      season_year INTEGER NOT NULL,
      club_id TEXT,
      appearances INTEGER NOT NULL DEFAULT 0,
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      yellow_cards INTEGER NOT NULL DEFAULT 0,
      red_cards INTEGER NOT NULL DEFAULT 0,
      average_rating REAL NOT NULL DEFAULT 6.0,
      PRIMARY KEY (player_id, competition_id, season_year),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_fixtures_year_week ON fixtures(year, week);
    CREATE INDEX IF NOT EXISTS idx_fixtures_comp_season ON fixtures(competition_id, season_year);
    CREATE INDEX IF NOT EXISTS idx_players_club_id ON players(club_id);
    CREATE INDEX IF NOT EXISTS idx_players_nationality ON players(nationality);
    CREATE INDEX IF NOT EXISTS idx_players_position ON players(primary_position);
    CREATE INDEX IF NOT EXISTS idx_players_overall ON players(overall DESC);
    CREATE INDEX IF NOT EXISTS idx_players_contract_end ON players(contract_end_season);
    CREATE INDEX IF NOT EXISTS idx_trophies_manager ON trophies(manager_id, season_year);
    CREATE INDEX IF NOT EXISTS idx_stats_goals ON player_season_stats(competition_id, season_year, goals DESC);
  `,
} as const;
