import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildCanonicalPlayerId,
  calculateInitialPlayerProfile,
  normalizePosition,
  validateCoreDataDirectory,
} from '@footmanager/importer';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');

describe('Pipeline de Importação e Auditoria (@footmanager/importer)', () => {
  it('gera IDs canônicos normalizados e converte posições externas', () => {
    expect(buildCanonicalPlayerId('BRA', '1997-06-20', 'João Pedro Álvares')).toBe(
      'ply_bra_19970620_joao_pedro_alvares',
    );
    expect(normalizePosition('Goalkeeper')).toBe('GOL');
    expect(normalizePosition('CB')).toBe('ZAG');
    expect(normalizePosition('CDM')).toBe('VOL');
    expect(normalizePosition('CAM')).toBe('MEI');
    expect(normalizePosition('ST')).toBe('ATA');
    expect(() => normalizePosition('posicao_inexistente')).toThrow();
    expect(() => buildCanonicalPlayerId('BR', '1997-06-20', 'João')).toThrow(/ISO-3/i);
    expect(() => buildCanonicalPlayerId('BRA', '9999-99-99', 'João')).toThrow(/Data de nascimento/i);
    expect(() => buildCanonicalPlayerId('BRA', '2025-02-29', 'João')).toThrow(/Data de nascimento/i);
  });

  it('calcula força inicial dentro dos limites 1..99 em valores extremos', () => {
    const elite = calculateInitialPlayerProfile({
      leagueReputation: 95,
      marketValueEur: 180_000_000,
      age: 24,
      position: 'ATA',
    });
    expect(elite.overall).toBeLessThanOrEqual(99);
    expect(elite.potential).toBeLessThanOrEqual(99);
    expect(elite.isStar).toBe(true);
    expect(elite.traits.length).toBeLessThanOrEqual(2);

    const lowerLeague = calculateInitialPlayerProfile({
      leagueReputation: 30,
      marketValueEur: 0,
      age: 18,
      position: 'GOL',
    });
    expect(lowerLeague.overall).toBeGreaterThanOrEqual(40);
    expect(lowerLeague.potential).toBeGreaterThan(lowerLeague.overall);
  });

  it('valida toda a pasta modular data/core/ (10 países + sementes Brasil) com zero erros', () => {
    const coreDir = path.join(repoRoot, 'data', 'core');
    const report = validateCoreDataDirectory(coreDir);

    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.countriesCount).toBe(10);
    expect(report.competitionsCount).toBeGreaterThanOrEqual(7);
    expect(report.clubsCount).toBeGreaterThanOrEqual(4);
    expect(report.stadiumsCount).toBeGreaterThanOrEqual(4);
  });

  it('detecta jogador duplicado canonicamente em 2 clubes e JSON malformado sem lançar exceção', () => {
    const tmpCore = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-core-audit-'));
    try {
      const braDir = path.join(tmpCore, 'countries', 'bra');
      fs.mkdirSync(braDir, { recursive: true });
      fs.writeFileSync(
        path.join(tmpCore, 'manifest.json'),
        JSON.stringify({
          schemaVersion: '1.0.0',
          id: 'core',
          name: 'Core Teste',
          version: '1.0.0',
          author: 'Test',
          type: 'core',
          requires: [],
          countriesAdded: ['BRA'],
          countriesModified: [],
          description: '',
        }),
      );
      fs.writeFileSync(
        path.join(braDir, 'country.json'),
        JSON.stringify({
          id: 'BRA',
          name: 'Brasil',
          confederation: 'CONMEBOL',
          seasonCycle: 'calendar_year',
          currencyCode: 'BRL',
          transferWindows: [{ label: 'J1', startWeek: 1, endWeek: 10 }],
        }),
      );
      fs.writeFileSync(
        path.join(braDir, 'stadiums.json'),
        JSON.stringify([
          { id: 'std_1', name: 'Estádio 1', city: 'Rio', countryId: 'BRA', capacity: 50000 },
        ]),
      );
      fs.writeFileSync(
        path.join(braDir, 'clubs.json'),
        JSON.stringify([
          {
            id: 'bra_a',
            countryId: 'BRA',
            name: 'Clube A',
            shortName: 'CLA',
            primaryColor: '#111111',
            secondaryColor: '#FFFFFF',
            stadiumId: 'std_1',
            reputation: 70,
            governance: 'associative',
            cashBalance: 1000,
          },
          {
            id: 'bra_b',
            countryId: 'BRA',
            name: 'Clube B',
            shortName: 'CLB',
            primaryColor: '#222222',
            secondaryColor: '#FFFFFF',
            stadiumId: 'std_1',
            reputation: 70,
            governance: 'associative',
            cashBalance: 1000,
          },
        ]),
      );
      fs.writeFileSync(
        path.join(braDir, 'players.json'),
        JSON.stringify([
          {
            id: 'ply_bra_19970620_pedro_a',
            name: 'Pedro',
            nationality: 'BRA',
            birthDate: '1997-06-20',
            primaryPosition: 'ATA',
            overall: 80,
            potential: 82,
            clubId: 'bra_a',
            contractEndSeason: 2027,
            contractEndCycle: 'calendar_year',
            weeklySalary: 10000,
            marketValue: 100000,
            releaseClause: 200000,
          },
          {
            id: 'ply_bra_19970620_pedro_b',
            name: 'Pédro',
            nationality: 'BRA',
            birthDate: '1997-06-20',
            primaryPosition: 'ATA',
            overall: 80,
            potential: 82,
            clubId: 'bra_b',
            contractEndSeason: 2027,
            contractEndCycle: 'calendar_year',
            weeklySalary: 10000,
            marketValue: 100000,
            releaseClause: 200000,
          },
        ]),
      );
      fs.writeFileSync(path.join(braDir, 'competitions.json'), '{ json quebrado');

      const report = validateCoreDataDirectory(tmpCore);
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => /duplicado canonicamente/i.test(e))).toBe(true);
      expect(report.errors.some((e) => /parsear JSON/i.test(e))).toBe(true);
    } finally {
      fs.rmSync(tmpCore, { recursive: true, force: true });
    }
  });
});
