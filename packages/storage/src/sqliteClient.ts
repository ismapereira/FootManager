import Database from 'better-sqlite3';

export type SqliteDatabase = Database.Database;

/**
 * Abre uma conexão SQLite endurecida em modo WAL com chaves estrangeiras ativadas (DEC-011).
 * Fecha automaticamente o descritor em caso de falha nos PRAGMAs (ex.: arquivo corrompido).
 */
export function openSqliteDatabase(filePath: string, options?: { readonly?: boolean }): SqliteDatabase {
  const db = new Database(filePath, {
    readonly: options?.readonly ?? false,
    fileMustExist: options?.readonly ?? false,
  });

  try {
    if (!options?.readonly) {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
    }
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Verifica integridade física e lógica do banco SQLite usando `PRAGMA quick_check`.
 */
export function verifyDatabaseIntegrity(db: SqliteDatabase): boolean {
  try {
    const rows = db.pragma('quick_check') as Array<{ quick_check: string }>;
    return rows.length === 1 && rows[0]?.quick_check === 'ok';
  } catch {
    return false;
  }
}

/**
 * Consolida os registros pendentes do WAL no arquivo principal do save antes da rotação de backup.
 */
export function checkpointWal(db: SqliteDatabase): void {
  db.pragma('wal_checkpoint(TRUNCATE)');
}
