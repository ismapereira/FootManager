import { describe, expect, it } from 'vitest';
import {
  advanceCalendarWeek,
  advanceWorldWeek,
  applyBoardConfidenceDelta,
  calculateAgeAtWeek,
  calculateEffectiveStrength,
  calculateHomeAdvantageFactor,
  calculateRetirementProbability,
  calculateSeasonOverallDelta,
  calculateSectorStrengths,
  canMakeSubstitution,
  createRng,
  getBirthdayWeek,
  getCareerAgeStage,
  getTacticalModifiers,
  isClubWorldCupYear,
  isTransferWindowOpen,
  isWorldCupYear,
  sortStandings,
} from '@footmanager/engine';

describe('Motor Puro (@footmanager/engine)', () => {
  describe('PRNG determinístico Mulberry32', () => {
    it('produz sequência idêntica para a mesma seed e respeita limites', () => {
      const rngA = createRng(424242);
      const rngB = createRng(424242);

      const seqA = Array.from({ length: 10 }, () => rngA.nextInt(1, 100));
      const seqB = Array.from({ length: 10 }, () => rngB.nextInt(1, 100));

      expect(seqA).toEqual(seqB);
      for (const value of seqA) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(100);
      }

      // Seed 0 deve normalizar sem travar
      const zeroSeedRng = createRng(0);
      expect(zeroSeedRng.nextFloat()).toBeGreaterThanOrEqual(0);
      expect(zeroSeedRng.nextFloat()).toBeLessThan(1);
      expect(() => zeroSeedRng.pick([])).toThrow(RangeError);
      // Intervalo decimal sem nenhum inteiro contido deve falhar explicitamente
      expect(() => zeroSeedRng.nextInt(1.2, 1.8)).toThrow(RangeError);
    });
  });

  describe('Força efetiva, setores, táticas e substituições (Seção 6.2)', () => {
    it('aplica corretamente energia, moral, posição e bônus estrela (+2.5)', () => {
      const basePlayer = {
        overall: 80,
        energy: 100,
        morale: 3 as const,
        primaryPosition: 'ATA' as const,
        secondaryPosition: 'MEI' as const,
        isStar: false,
        traits: ['FINALIZACAO'],
      };

      const primary = calculateEffectiveStrength({ player: basePlayer, assignedSlot: 'ATA' });
      const secondary = calculateEffectiveStrength({ player: basePlayer, assignedSlot: 'MEI' });
      const improvised = calculateEffectiveStrength({ player: basePlayer, assignedSlot: 'ZAG' });
      const inGoal = calculateEffectiveStrength({ player: basePlayer, assignedSlot: 'GOL' });
      const starTired = calculateEffectiveStrength({
        player: { ...basePlayer, isStar: true, energy: 25, morale: 5 },
        assignedSlot: 'ATA',
      });

      expect(primary).toBe(80);
      expect(secondary).toBe(77.6);
      expect(improvised).toBe(60);
      expect(inGoal).toBe(36);
      // 80 * 0.72 * 1.06 * 1.0 + 2.5 = 63.556 -> 63.56
      expect(starTired).toBe(63.56);
    });

    it('calcula setores, contra-ataque bônus (+6%) e fator casa (1.03..1.07)', () => {
      const sectors = calculateSectorStrengths([
        {
          assignedSlot: 'GOL',
          player: {
            overall: 80,
            energy: 100,
            morale: 3,
            primaryPosition: 'GOL',
            isStar: false,
            traits: ['REFLEXO'],
          },
        },
        {
          assignedSlot: 'ATA',
          player: {
            overall: 85,
            energy: 100,
            morale: 3,
            primaryPosition: 'ATA',
            isStar: true,
            traits: ['FINALIZACAO'],
          },
        },
      ]);

      expect(sectors.gk).toBe(81.5);
      expect(sectors.att).toBe(88.9);

      const counterVsAttacking = getTacticalModifiers('counter_attack', 'attacking');
      const counterVsDefensive = getTacticalModifiers('counter_attack', 'defensive');
      expect(counterVsAttacking.attMultiplier).toBe(1.06);
      expect(counterVsDefensive.attMultiplier).toBe(1.0);

      expect(calculateHomeAdvantageFactor(0)).toBe(1.03);
      expect(calculateHomeAdvantageFactor(1)).toBe(1.07);
    });

    it('respeita estritamente 5 substituições em 3 paradas + intervalo livre + 1 na prorrogação', () => {
      const threeWindowsUsed = {
        substitutionsUsed: 3,
        windowsUsedRegularTime: 3,
        extraTimeSubUsed: false,
        maxSubstitutions: 5,
        maxRegularWindows: 3,
      };

      // Nova parada no tempo normal deve ser bloqueada
      expect(
        canMakeSubstitution(threeWindowsUsed, { isHalftime: false, isExtraTime: false }).allowed,
      ).toBe(false);

      // No intervalo não consome parada
      expect(
        canMakeSubstitution(threeWindowsUsed, { isHalftime: true, isExtraTime: false }).allowed,
      ).toBe(true);

      // Com 5 usadas, só pode na prorrogação (6ª)
      const fiveUsed = { ...threeWindowsUsed, substitutionsUsed: 5 };
      expect(
        canMakeSubstitution(fiveUsed, { isHalftime: true, isExtraTime: false }).allowed,
      ).toBe(false);
      expect(
        canMakeSubstitution(fiveUsed, { isHalftime: false, isExtraTime: true }).allowed,
      ).toBe(true);

      // Com 6 usadas, bloqueado mesmo na prorrogação
      const sixUsed = { ...threeWindowsUsed, substitutionsUsed: 6 };
      expect(
        canMakeSubstitution(sixUsed, { isHalftime: false, isExtraTime: true }).allowed,
      ).toBe(false);

      // Com extraTimeSubUsed = true e 5 usadas, não permite ultrapassar o teto
      const extraAlreadyUsed = { ...fiveUsed, extraTimeSubUsed: true };
      expect(
        canMakeSubstitution(extraAlreadyUsed, { isHalftime: false, isExtraTime: true }).allowed,
      ).toBe(false);
    });
  });

  describe('Curva de longevidade DEC-008', () => {
    it('mantém auge até 32 (linha) e 35 (goleiro) com declínio apenas em 33+ e 36+', () => {
      expect(getCareerAgeStage(23, 'ATA')).toBe('development');
      expect(getCareerAgeStage(24, 'ATA')).toBe('peak');
      expect(getCareerAgeStage(32, 'ATA')).toBe('peak');
      expect(getCareerAgeStage(33, 'ATA')).toBe('decline');

      expect(getCareerAgeStage(24, 'GOL')).toBe('development');
      expect(getCareerAgeStage(25, 'GOL')).toBe('peak');
      expect(getCareerAgeStage(35, 'GOL')).toBe('peak');
      expect(getCareerAgeStage(36, 'GOL')).toBe('decline');

      // Jogador de 31 anos com nota normal não cai de força
      const peakDelta = calculateSeasonOverallDelta({
        age: 31,
        position: 'MEI',
        overall: 82,
        potential: 82,
        isStar: false,
        traits: [],
        minutesRatio: 0.85,
        academyLevel: 4,
        averageRating: 6.8,
      });
      expect(peakDelta).toBe(0);

      // Veterano de 37 anos comum vs com RESISTENCIA (atenuação de 35%)
      const normalVeteranDrop = calculateSeasonOverallDelta({
        age: 37,
        position: 'ZAG',
        overall: 80,
        potential: 80,
        isStar: false,
        traits: [],
        minutesRatio: 0.7,
        academyLevel: 4,
        averageRating: 6.7,
      });
      const resilientVeteranDrop = calculateSeasonOverallDelta({
        age: 37,
        position: 'ZAG',
        overall: 80,
        potential: 80,
        isStar: false,
        traits: ['RESISTENCIA'],
        minutesRatio: 0.7,
        academyLevel: 4,
        averageRating: 6.7,
      });
      expect(normalVeteranDrop).toBe(-3);
      expect(resilientVeteranDrop).toBe(-2);

      expect(calculateRetirementProbability(34, 'ATA')).toBe(0);
      expect(calculateRetirementProbability(35, 'ATA')).toBeGreaterThan(0);
      expect(calculateRetirementProbability(37, 'GOL')).toBe(0);
      expect(calculateRetirementProbability(38, 'GOL')).toBeGreaterThan(0);

      // Fronteiras de auge: nunca excede min(99, potential) nem cai abaixo de 1
      const cappedPeak = calculateSeasonOverallDelta({
        age: 27,
        position: 'ATA',
        overall: 98,
        potential: 99,
        isStar: true,
        traits: [],
        minutesRatio: 1,
        academyLevel: 5,
        averageRating: 8.2,
      });
      expect(cappedPeak).toBe(1);

      const floorPeak = calculateSeasonOverallDelta({
        age: 27,
        position: 'ATA',
        overall: 1,
        potential: 50,
        isStar: false,
        traits: [],
        minutesRatio: 0.5,
        academyLevel: 2,
        averageRating: 5.0,
      });
      expect(floorPeak).toBe(0);
    });
  });

  describe('Calendário de 52 semanas, governança SAF e desempate', () => {
    it('avança semanas, detecta viradas assíncronas, Datas FIFA e idade exata por aniversário', () => {
      const week52Next = advanceCalendarWeek(2026, 52);
      expect(week52Next.year).toBe(2027);
      expect(week52Next.week).toBe(1);

      const week26 = advanceCalendarWeek(2026, 25);
      expect(week26.isSplitYearRollover).toBe(true);
      expect(week26.isCalendarYearRollover).toBe(false);

      const week51 = advanceCalendarWeek(2026, 50);
      expect(week51.isCalendarYearRollover).toBe(true);

      const week12 = advanceCalendarWeek(2026, 11);
      expect(week12.isFifaDate).toBe(true);

      expect(isWorldCupYear(2026)).toBe(true);
      expect(isWorldCupYear(2029)).toBe(false);
      expect(isClubWorldCupYear(2029)).toBe(true);

      const bdayWeek = getBirthdayWeek('1997-06-20');
      expect(calculateAgeAtWeek('1997-06-20', 2026, bdayWeek - 1)).toBe(28);
      expect(calculateAgeAtWeek('1997-06-20', 2026, bdayWeek)).toBe(29);
      // Ano bissexto (29/fev) tratado com segurança e datas/semanas inválidas rejeitadas
      expect(getBirthdayWeek('2000-02-29')).toBeGreaterThanOrEqual(8);
      expect(() => getBirthdayWeek('abc-02-31')).toThrow(RangeError);
      expect(() => getBirthdayWeek('2025-02-29')).toThrow(RangeError);
      expect(() => calculateAgeAtWeek('2000-05-10', 2026, 99)).toThrow(RangeError);
      expect(() => calculateAgeAtWeek('2000-05-10', 2026, 0)).toThrow(RangeError);
    });

    it('aplica pressão 40% maior em SAF, valida janelas e ordena tabela deterministicamente', () => {
      expect(applyBoardConfidenceDelta(70, -10, 'associative')).toBe(60);
      expect(applyBoardConfidenceDelta(70, -10, 'saf', 2)).toBe(56);

      const windows = [{ label: 'Verão', startWeek: 27, endWeek: 35 }];
      expect(isTransferWindowOpen(30, windows)).toBe(true);
      expect(isTransferWindowOpen(20, windows)).toBe(false);

      const sorted = sortStandings([
        { clubId: 'b', played: 10, wins: 6, draws: 2, losses: 2, goalsFor: 15, goalsAgainst: 10, points: 20 },
        { clubId: 'a', played: 10, wins: 6, draws: 2, losses: 2, goalsFor: 18, goalsAgainst: 10, points: 20 },
      ]);
      expect(sorted[0]?.clubId).toBe('a');

      const tick = advanceWorldWeek({ currentYear: 2026, currentWeek: 1, seed: 12345 });
      expect(tick.currentWeek).toBe(2);
      expect(tick.durationMs).toBeLessThan(100);
    });
  });
});
