import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SaveMetadata } from '@footmanager/schemas';
import {
  HistoryRepository,
  openSqliteDatabase,
  resolveSafeSavePaths,
  runMigrations,
  SaveRepository,
} from '@footmanager/storage';

describe('Persistência SQLite WAL e Saves Atômicos (@footmanager/storage)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footmanager-storage-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeSampleSave = (overrides?: Partial<SaveMetadata>): SaveMetadata => ({
    saveId: 'carreira_bra_2026',
    saveName: 'Carreira Flamengo 2026',
    schemaVersion: '1.0.0',
    currentYear: 2026,
    currentWeek: 14,
    seed: 987654,
    activeCountries: ['BRA'],
    enableBrazilianStateChampionships: true,
    appliedPatches: [{ id: 'core', version: '1.0.0', priority: 0 }],
    humanManagers: [
      {
        id: 'mgr_human_1',
        name: "Tite O'Connor'); DROP TABLE meta; --",
        nationality: 'BRA',
        clubId: 'bra_flamengo',
        nationalTeamId: null,
        boardConfidence: 78,
        reputation: 60,
        careerPoints: 120,
      },
    ],
    ...overrides,
  });

  it('grava save atômico em modo WAL, cria .bak, valida integridade e neutraliza SQL Injection', () => {
    const repo = new SaveRepository(tempDir);
    const saved = repo.saveCareer(makeSampleSave());

    expect(saved.updatedAt).toBeDefined();

    const integrity = repo.verifySaveIntegrity('carreira_bra_2026');
    expect(integrity.mainOk).toBe(true);
    expect(integrity.backupOk).toBe(true);
    expect(integrity.journalMode).toBe('wal');

    const loaded = repo.loadCareer('carreira_bra_2026');
    expect(loaded.recoveredFromBackup).toBe(false);
    expect(loaded.metadata.currentWeek).toBe(14);
    expect(loaded.metadata.humanManagers[0]?.name).toBe("Tite O'Connor'); DROP TABLE meta; --");

    const list = repo.listSaves();
    expect(list).toHaveLength(1);
    expect(list[0]?.hasBackup).toBe(true);
    expect(list[0]?.integrityOk).toBe(true);
  });

  it('recupera automaticamente a carreira via .fmsave.bak quando o arquivo principal é corrompido', () => {
    const repo = new SaveRepository(tempDir);
    repo.saveCareer(makeSampleSave({ saveId: 'save_resiliente', currentWeek: 22 }));

    const paths = resolveSafeSavePaths(tempDir, 'save_resiliente');
    expect(fs.existsSync(paths.backupFile)).toBe(true);

    // Simula corrupção abrupta de disco no arquivo principal
    fs.writeFileSync(paths.mainFile, Buffer.from('CORRUPTED_SQLITE_HEADER_BYTES_XXXX'));

    const brokenCheck = repo.verifySaveIntegrity('save_resiliente');
    expect(brokenCheck.mainOk).toBe(false);
    expect(brokenCheck.backupOk).toBe(true);

    const recovered = repo.loadCareer('save_resiliente');
    expect(recovered.recoveredFromBackup).toBe(true);
    expect(recovered.metadata.currentWeek).toBe(22);

    // Após recuperação, o arquivo principal deve voltar a ficar íntegro
    const restoredCheck = repo.verifySaveIntegrity('save_resiliente');
    expect(restoredCheck.mainOk).toBe(true);
  });

  it('bloqueia tentativas de path traversal no saveId e executa migrações idempotentes', () => {
    const repo = new SaveRepository(tempDir);
    expect(() => resolveSafeSavePaths(tempDir, '../escape')).toThrow();
    expect(() => resolveSafeSavePaths(tempDir, 'sub/save')).toThrow();
    expect(() => repo.deleteSave('..\\evil')).toThrow();

    const dbFile = path.join(tempDir, 'migrations_test.fmsave');
    const db = openSqliteDatabase(dbFile);
    try {
      expect(runMigrations(db)).toBe(1);
      expect(runMigrations(db)).toBe(0); // Idempotente na segunda execução

      const history = new HistoryRepository(db);
      expect(history.getTopScorers('bra_serie_a', 2026)).toEqual([]);
      expect(history.getManagerTrophies('mgr_human_1')).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('inspeciona integridade em modo somente leitura, lista backups órfãos recuperáveis e limpa .tmp ao excluir', () => {
    const repo = new SaveRepository(tempDir);

    // 1. Cria banco em modo DELETE (não WAL): verifySaveIntegrity NÃO deve mutar para WAL
    const nonWalPaths = resolveSafeSavePaths(tempDir, 'legacy_delete_mode');
    const rawDb = new Database(nonWalPaths.mainFile);
    rawDb.pragma('journal_mode = DELETE');
    rawDb.exec('CREATE TABLE ping (id INTEGER PRIMARY KEY);');
    rawDb.close();

    const nonWalCheck = repo.verifySaveIntegrity('legacy_delete_mode');
    expect(nonWalCheck.mainOk).toBe(true);
    expect(nonWalCheck.journalMode).toBe('delete');

    // 2. Simula desaparecimento do .fmsave mantendo apenas .fmsave.bak íntegro
    repo.saveCareer(makeSampleSave({ saveId: 'orphan_bak_save', currentWeek: 33 }));
    const orphanPaths = resolveSafeSavePaths(tempDir, 'orphan_bak_save');
    fs.rmSync(orphanPaths.mainFile);

    const listed = repo.listSaves();
    const orphanEntry = listed.find((s) => s.saveId === 'orphan_bak_save');
    expect(orphanEntry).toBeDefined();
    expect(orphanEntry?.hasBackup).toBe(true);
    expect(orphanEntry?.integrityOk).toBe(false);
    expect(orphanEntry?.currentWeek).toBe(33);

    // Recupera automaticamente via loadCareer
    const recovered = repo.loadCareer('orphan_bak_save');
    expect(recovered.recoveredFromBackup).toBe(true);
    expect(recovered.metadata.currentWeek).toBe(33);
    expect(fs.existsSync(orphanPaths.mainFile)).toBe(true);

    // 3. Exclusão limpa inclusive arquivos .tmp residuais
    const leftoverTmp = `${orphanPaths.backupFile}.tmp`;
    fs.writeFileSync(leftoverTmp, 'tmp');
    expect(repo.deleteSave('orphan_bak_save')).toBe(true);
    expect(fs.existsSync(leftoverTmp)).toBe(false);
  });
});
