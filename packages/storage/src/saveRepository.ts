import fs from 'node:fs';
import path from 'node:path';
import {
  SaveIdSchema,
  SaveMetadataSchema,
  type SaveMetadata,
  type SaveSlotSummary,
} from '@footmanager/schemas';
import {
  checkpointWal,
  openSqliteDatabase,
  verifyDatabaseIntegrity,
  type SqliteDatabase,
} from './sqliteClient.js';
import { runMigrations } from './migrations/index.js';

const META_KEY_SNAPSHOT = 'save_metadata';

/**
 * Caminhos validados de um slot de save dentro do diretório sandboxed.
 */
export interface SaveFilePaths {
  mainFile: string;
  backupFile: string;
  walFile: string;
  shmFile: string;
}

/**
 * Resultado ao carregar um save, indicando se houve recuperação automática via `.bak`.
 */
export interface LoadedSaveResult {
  metadata: SaveMetadata;
  recoveredFromBackup: boolean;
}

/**
 * Garante que o `saveId` é seguro e que o caminho resolvido permanece dentro de `savesDir` (anti path-traversal).
 */
export function resolveSafeSavePaths(savesDir: string, rawSaveId: string): SaveFilePaths {
  const parsedId = SaveIdSchema.parse(rawSaveId);
  const rootDir = path.resolve(savesDir);
  const mainFile = path.resolve(rootDir, `${parsedId}.fmsave`);

  if (!mainFile.startsWith(`${rootDir}${path.sep}`)) {
    throw new Error('Caminho de save fora do diretório permitido.');
  }

  return {
    mainFile,
    backupFile: `${mainFile}.bak`,
    walFile: `${mainFile}-wal`,
    shmFile: `${mainFile}-shm`,
  };
}

/**
 * Remove arquivos auxiliares WAL/SHM órfãos de um banco fechado.
 */
function removeWalSidecars(paths: SaveFilePaths): void {
  for (const sidecar of [paths.walFile, paths.shmFile]) {
    if (fs.existsSync(sidecar)) {
      fs.rmSync(sidecar, { force: true });
    }
  }
}

/**
 * Restaura atomicamente o arquivo principal a partir do `.fmsave.bak` via arquivo temporário.
 */
function restoreAtomicFromBackup(paths: SaveFilePaths): void {
  const tempRecover = `${paths.mainFile}.recover.tmp`;
  fs.copyFileSync(paths.backupFile, tempRecover);
  fs.renameSync(tempRecover, paths.mainFile);
}

/**
 * Rotaciona atomicamente a cópia estável `.fmsave` para `.fmsave.bak` via arquivo temporário.
 */
function rotateAtomicBackup(paths: SaveFilePaths): void {
  const tempBackup = `${paths.backupFile}.tmp`;
  fs.copyFileSync(paths.mainFile, tempBackup);
  fs.renameSync(tempBackup, paths.backupFile);
}

/**
 * Persiste os metadados e técnicos humanos em transação SQLite usando 100% prepared statements.
 */
function writeMetadataInTransaction(db: SqliteDatabase, metadata: SaveMetadata): void {
  const stamped: SaveMetadata = SaveMetadataSchema.parse({
    ...metadata,
    updatedAt: new Date().toISOString(),
  });

  const upsertMeta = db.prepare(`
    INSERT INTO meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const deleteHumanManagers = db.prepare('DELETE FROM managers WHERE is_human = 1');
  const insertManager = db.prepare(`
    INSERT INTO managers (
      id, name, nationality, is_human, club_id, national_team_id,
      board_confidence, reputation, career_points
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    upsertMeta.run(META_KEY_SNAPSHOT, JSON.stringify(stamped));
    upsertMeta.run('schema_version', stamped.schemaVersion);
    upsertMeta.run('current_year', String(stamped.currentYear));
    upsertMeta.run('current_week', String(stamped.currentWeek));

    // Sincroniza técnicos humanos preservando suporte a múltiplos técnicos na v2 (DEC-007)
    deleteHumanManagers.run();
    for (const manager of stamped.humanManagers) {
      insertManager.run(
        manager.id,
        manager.name,
        manager.nationality,
        null, // FK club_id será populado quando os clubes do snapshot forem inseridos
        manager.nationalTeamId,
        manager.boardConfidence,
        manager.reputation,
        manager.careerPoints,
      );
    }
  });

  tx();
}

/**
 * Lê e valida os metadados de um arquivo SQLite específico.
 */
function readMetadataFromFile(filePath: string): SaveMetadata {
  const db = openSqliteDatabase(filePath, { readonly: true });
  try {
    if (!verifyDatabaseIntegrity(db)) {
      throw new Error('Verificação PRAGMA quick_check falhou.');
    }
    const stmt = db.prepare('SELECT value FROM meta WHERE key = ?');
    const row = stmt.get(META_KEY_SNAPSHOT) as { value: string } | undefined;
    if (!row) {
      throw new Error('Metadados do save não encontrados na tabela meta.');
    }
    return SaveMetadataSchema.parse(JSON.parse(row.value) as unknown);
  } finally {
    db.close();
  }
}

/**
 * Descobre todos os `saveId` válidos presentes no diretório (arquivos `.fmsave` e backups `.fmsave.bak`).
 */
function discoverSaveIds(savesDir: string): Set<string> {
  const entries = fs.readdirSync(savesDir, { withFileTypes: true });
  const discoveredIds = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    let candidateId: string | null = null;
    if (entry.name.endsWith('.fmsave')) {
      candidateId = entry.name.slice(0, -'.fmsave'.length);
    } else if (entry.name.endsWith('.fmsave.bak')) {
      candidateId = entry.name.slice(0, -'.fmsave.bak'.length);
    }

    if (candidateId && SaveIdSchema.safeParse(candidateId).success) {
      discoveredIds.add(candidateId);
    }
  }

  return discoveredIds;
}

/**
 * Monta o resumo exibido na lista de slots a partir dos metadados lidos e estatísticas do arquivo.
 */
function buildSaveSummary(
  metadata: SaveMetadata,
  stats: fs.Stats,
  options: { hasBackup: boolean; integrityOk: boolean; saveNameOverride?: string },
): SaveSlotSummary {
  const primaryManager = metadata.humanManagers[0];
  return {
    saveId: metadata.saveId,
    saveName: options.saveNameOverride ?? metadata.saveName,
    currentYear: metadata.currentYear,
    currentWeek: metadata.currentWeek,
    managerName: primaryManager?.name ?? 'Técnico',
    clubId: primaryManager?.clubId ?? null,
    hasBackup: options.hasBackup,
    integrityOk: options.integrityOk,
    updatedAt: metadata.updatedAt ?? stats.mtime.toISOString(),
    fileSizeBytes: stats.size,
  };
}

/**
 * Inspeciona um slot de save (arquivo principal e eventual `.fmsave.bak`) sem mutar o disco.
 */
function inspectSaveSlot(savesDir: string, saveId: string): SaveSlotSummary {
  const paths = resolveSafeSavePaths(savesDir, saveId);
  const hasMain = fs.existsSync(paths.mainFile);
  const hasBackup = fs.existsSync(paths.backupFile);
  const stats = fs.statSync(hasMain ? paths.mainFile : paths.backupFile);

  if (hasMain) {
    try {
      const metadata = readMetadataFromFile(paths.mainFile);
      return buildSaveSummary(metadata, stats, { hasBackup, integrityOk: true });
    } catch {
      // Segue para inspeção do backup abaixo
    }
  }

  if (hasBackup) {
    try {
      const backupMeta = readMetadataFromFile(paths.backupFile);
      return buildSaveSummary(backupMeta, stats, {
        hasBackup: true,
        integrityOk: false,
        saveNameOverride: `${backupMeta.saveName} (recuperável via .bak)`,
      });
    } catch {
      // Backup também ilegível
    }
  }

  return {
    saveId,
    saveName: `${saveId} (requer recuperação)`,
    currentYear: 2026,
    currentWeek: 1,
    managerName: 'Indisponível',
    clubId: null,
    hasBackup,
    integrityOk: false,
    updatedAt: stats.mtime.toISOString(),
    fileSizeBytes: stats.size,
  };
}

/**
 * Repositório de saves autocontidos em SQLite WAL com gravação atômica e recuperação via `.bak` (DEC-011).
 */
export class SaveRepository {
  private readonly savesDir: string;

  constructor(savesDir: string) {
    this.savesDir = path.resolve(savesDir);
    fs.mkdirSync(this.savesDir, { recursive: true });
  }

  /**
   * Cria ou atualiza um save de forma atômica, valida integridade com `PRAGMA quick_check`
   * e atualiza a cópia de segurança `.fmsave.bak`.
   */
  public saveCareer(metadata: SaveMetadata): SaveMetadata {
    const validated = SaveMetadataSchema.parse({
      ...metadata,
      updatedAt: new Date().toISOString(),
    });
    const paths = resolveSafeSavePaths(this.savesDir, validated.saveId);

    const db = openSqliteDatabase(paths.mainFile);
    try {
      runMigrations(db);
      writeMetadataInTransaction(db, validated);
      checkpointWal(db);

      if (!verifyDatabaseIntegrity(db)) {
        throw new Error('Falha na verificação de integridade pós-gravação (PRAGMA quick_check).');
      }
    } finally {
      db.close();
    }

    // Após fechar com WAL consolidado, rotaciona cópia estável para .bak sem locks
    rotateAtomicBackup(paths);
    return validated;
  }

  /**
   * Carrega os metadados de um save. Caso o arquivo principal esteja corrompido,
   * tenta recuperação automática a partir do `.fmsave.bak` íntegro.
   */
  public loadCareer(saveId: string): LoadedSaveResult {
    const paths = resolveSafeSavePaths(this.savesDir, saveId);

    if (fs.existsSync(paths.mainFile)) {
      try {
        const metadata = readMetadataFromFile(paths.mainFile);
        return { metadata, recoveredFromBackup: false };
      } catch {
        // Segue para tentativa de recuperação via backup abaixo
      }
    }

    if (fs.existsSync(paths.backupFile)) {
      const metadata = readMetadataFromFile(paths.backupFile);
      removeWalSidecars(paths);
      restoreAtomicFromBackup(paths);
      return { metadata, recoveredFromBackup: true };
    }

    throw new Error(`Save "${saveId}" não encontrado ou corrompido sem backup válido.`);
  }

  /**
   * Executa verificação explícita de integridade (`PRAGMA quick_check`) em modo somente leitura
   * para inspecionar o arquivo principal e o backup sem mutar o banco nem criar sidecars WAL.
   */
  public verifySaveIntegrity(saveId: string): {
    mainOk: boolean;
    backupOk: boolean;
    journalMode: string | null;
  } {
    const paths = resolveSafeSavePaths(this.savesDir, saveId);
    let mainOk = false;
    let backupOk = false;
    let journalMode: string | null = null;

    if (fs.existsSync(paths.mainFile)) {
      try {
        const db = openSqliteDatabase(paths.mainFile, { readonly: true });
        try {
          journalMode = String(db.pragma('journal_mode', { simple: true }));
          mainOk = verifyDatabaseIntegrity(db);
        } finally {
          db.close();
        }
      } catch {
        mainOk = false;
      }
    }

    if (fs.existsSync(paths.backupFile)) {
      try {
        const bakDb = openSqliteDatabase(paths.backupFile, { readonly: true });
        try {
          backupOk = verifyDatabaseIntegrity(bakDb);
        } finally {
          bakDb.close();
        }
      } catch {
        backupOk = false;
      }
    }

    return { mainOk, backupOk, journalMode };
  }

  /**
   * Lista todos os slots disponíveis (incluindo backups órfãos `.fmsave.bak` recuperáveis)
   * ordenados do mais recente ao mais antigo.
   */
  public listSaves(): SaveSlotSummary[] {
    if (!fs.existsSync(this.savesDir)) {
      return [];
    }

    const discoveredIds = discoverSaveIds(this.savesDir);
    const summaries = Array.from(discoveredIds, (saveId) => inspectSaveSlot(this.savesDir, saveId));
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Remove um save e todos os seus arquivos auxiliares (`.bak`, `.tmp`, `-wal`, `-shm`) com validação segura.
   */
  public deleteSave(saveId: string): boolean {
    const paths = resolveSafeSavePaths(this.savesDir, saveId);
    const extraFiles = [
      paths.mainFile,
      paths.backupFile,
      `${paths.backupFile}.tmp`,
      `${paths.mainFile}.recover.tmp`,
    ];
    const existed = extraFiles.some((file) => fs.existsSync(file));

    removeWalSidecars(paths);
    for (const file of extraFiles) {
      if (fs.existsSync(file)) {
        fs.rmSync(file, { force: true });
      }
    }

    return existed;
  }
}
