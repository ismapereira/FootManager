import type { SqliteDatabase } from '../sqliteClient.js';
import { MIGRATION_001_INITIAL_SCHEMA } from './001_initial_schema.js';

export interface SchemaMigration {
  version: number;
  name: string;
  sql: string;
}

const ALL_MIGRATIONS: readonly SchemaMigration[] = [MIGRATION_001_INITIAL_SCHEMA];

/**
 * Executa todas as migrações SQL pendentes de forma transacional e idempotente.
 */
export function runMigrations(db: SqliteDatabase): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const selectApplied = db.prepare('SELECT version FROM schema_migrations');
  const appliedRows = selectApplied.all() as Array<{ version: number }>;
  const appliedSet = new Set(appliedRows.map((row) => row.version));

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
  );

  let appliedCount = 0;

  for (const migration of ALL_MIGRATIONS) {
    if (appliedSet.has(migration.version)) {
      continue;
    }

    const applyTransaction = db.transaction(() => {
      db.exec(migration.sql);
      insertMigration.run(migration.version, migration.name, new Date().toISOString());
    });

    applyTransaction();
    appliedCount += 1;
  }

  return appliedCount;
}
