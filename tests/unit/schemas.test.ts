import { describe, expect, it } from 'vitest';
import {
  ClubSchema,
  CompetitionSchema,
  CountrySchema,
  CreateSaveRequestSchema,
  PlayerSchema,
  SafeAssetPathSchema,
  SaveIdSchema,
  StadiumSchema,
} from '@footmanager/schemas';

describe('Contratos Zod (@footmanager/schemas)', () => {
  it('valida país, estádio, clube e jogador completos corretamente', () => {
    const country = CountrySchema.parse({
      id: 'BRA',
      name: 'Brasil',
      confederation: 'CONMEBOL',
      seasonCycle: 'calendar_year',
      currencyCode: 'BRL',
      transferWindows: [{ label: 'Janela 1', startWeek: 1, endWeek: 10 }],
    });
    expect(country.id).toBe('BRA');

    const stadium = StadiumSchema.parse({
      id: 'std_bra_maracana',
      name: 'Maracanã',
      city: 'Rio de Janeiro',
      countryId: 'BRA',
      capacity: 78838,
      expansionMaxCapacity: 82000,
    });
    expect(stadium.capacity).toBe(78838);

    const club = ClubSchema.parse({
      id: 'bra_flamengo',
      countryId: 'BRA',
      stateCode: 'RJ',
      name: 'CR Flamengo',
      shortName: 'fla',
      primaryColor: '#C8102E',
      secondaryColor: '#111111',
      stadiumId: 'std_bra_maracana',
      reputation: 87,
      governance: 'associative',
      cashBalance: 100_000_000,
    });
    expect(club.shortName).toBe('FLA');

    const player = PlayerSchema.parse({
      id: 'ply_bra_19970620_pedro',
      name: 'Pedro',
      nationality: 'BRA',
      birthDate: '1997-06-20',
      primaryPosition: 'ATA',
      overall: 83,
      potential: 84,
      isStar: true,
      traits: ['FINALIZACAO', 'CABECEIO'],
      clubId: 'bra_flamengo',
      contractEndSeason: 2027,
      contractEndCycle: 'calendar_year',
      weeklySalary: 250000,
      marketValue: 90000000,
      releaseClause: 250000000,
    });
    expect(player.traits).toHaveLength(2);
  });

  it('rejeita cor hexadecimal inválida, traits acima do limite e data impossível', () => {
    expect(
      ClubSchema.safeParse({
        id: 'bra_teste',
        countryId: 'BRA',
        name: 'Teste FC',
        shortName: 'TST',
        primaryColor: 'red',
        secondaryColor: '#FFF',
        stadiumId: 'std_teste',
        reputation: 50,
        governance: 'associative',
        cashBalance: 0,
      }).success,
    ).toBe(false);

    expect(
      PlayerSchema.safeParse({
        id: 'ply_bra_19990230_fake',
        name: 'Fake Player',
        nationality: 'BRA',
        birthDate: '1999-02-30',
        primaryPosition: 'ATA',
        overall: 75,
        potential: 80,
        traits: ['FINALIZACAO', 'DRIBLE', 'VELOCIDADE'],
        clubId: null,
        contractEndSeason: 2027,
        contractEndCycle: 'calendar_year',
        weeklySalary: 1000,
        marketValue: 10000,
        releaseClause: 50000,
      }).success,
    ).toBe(false);
  });

  it('aceita split_year cruzando virada de ano e rejeita calendar_year invertido', () => {
    const premierLeague = CompetitionSchema.safeParse({
      id: 'eng_premier_league',
      countryId: 'ENG',
      name: 'Premier League',
      tier: 1,
      template: 'round_robin',
      seasonCycle: 'split_year',
      startWeek: 32,
      endWeek: 21,
    });
    expect(premierLeague.success).toBe(true);

    const invalidCalendar = CompetitionSchema.safeParse({
      id: 'bra_invalida',
      countryId: 'BRA',
      name: 'Liga Invertida',
      tier: 1,
      template: 'round_robin',
      seasonCycle: 'calendar_year',
      startWeek: 40,
      endWeek: 10,
    });
    expect(invalidCalendar.success).toBe(false);
  });

  it('bloqueia path traversal em saveId, payload IPC e caminhos de escudo', () => {
    expect(SaveIdSchema.safeParse('../evil').success).toBe(false);
    expect(SaveIdSchema.safeParse('pasta/save1').success).toBe(false);
    expect(SaveIdSchema.safeParse('ab').success).toBe(false);
    expect(SaveIdSchema.safeParse('carreira_fla_2026').success).toBe(true);

    expect(SafeAssetPathSchema.safeParse('../badges/club.svg').success).toBe(false);
    expect(SafeAssetPathSchema.safeParse('/etc/passwd.png').success).toBe(false);
    expect(SafeAssetPathSchema.safeParse('badges/payload.js').success).toBe(false);
    expect(SafeAssetPathSchema.safeParse('badges/bra_flamengo.svg').success).toBe(true);

    expect(
      CreateSaveRequestSchema.safeParse({
        saveId: '../../hack',
        saveName: 'Save',
        managerName: 'Técnico',
      }).success,
    ).toBe(false);

    expect(
      CreateSaveRequestSchema.safeParse({
        saveId: 'save_valido',
        saveName: 'Save',
        managerName: 'Técnico',
        clubId: 'INVALID CLUB!',
      }).success,
    ).toBe(false);

    expect(
      PlayerSchema.safeParse({
        id: 'ply_bra_19970620_inf',
        name: 'Infinito',
        nationality: 'BRA',
        birthDate: '1997-06-20',
        primaryPosition: 'ATA',
        overall: 80,
        potential: 80,
        clubId: null,
        contractEndSeason: 2027,
        contractEndCycle: 'calendar_year',
        weeklySalary: Number.POSITIVE_INFINITY,
        marketValue: 1000,
        releaseClause: 2000,
      }).success,
    ).toBe(false);
  });
});
