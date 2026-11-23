/**
 * Motor do calendário global unificado de 52 semanas (Seção 5.7).
 * Coordena simultaneamente ligas de ciclo Ano Civil e Ciclo Dividido sem conflitos.
 */

export const WEEKS_PER_YEAR = 52;

/** Semanas fixas de Datas FIFA anuais (Março, Junho, Setembro, Outubro, Novembro). */
export const FIFA_DATE_WEEKS = [12, 23, 36, 41, 46] as const;

/** Semana oficial de virada de temporada das ligas de Ciclo Dividido (ex.: 30 de junho). */
export const SPLIT_YEAR_ROLLOVER_WEEK = 26;

/** Semana oficial de virada de temporada das ligas de Ciclo Ano Civil (ex.: 31 de dezembro). */
export const CALENDAR_YEAR_ROLLOVER_WEEK = 51;

/**
 * Resultado calculado para uma semana do calendário global.
 */
export interface CalendarWeekInfo {
  year: number;
  week: number;
  isFifaDate: boolean;
  isSplitYearRollover: boolean;
  isCalendarYearRollover: boolean;
  isWorldCupYear: boolean;
  isClubWorldCupYear: boolean;
}

/**
 * Verifica se o ano corresponde ao ciclo quadrienal da Copa do Mundo de 48 seleções (2026, 2030...).
 */
export function isWorldCupYear(year: number): boolean {
  return year >= 2026 && (year - 2026) % 4 === 0;
}

/**
 * Verifica se o ano corresponde ao ciclo quadrienal do Mundial de Clubes de 32 equipes (2029, 2033...).
 */
export function isClubWorldCupYear(year: number): boolean {
  return year >= 2029 && (year - 2029) % 4 === 0;
}

/**
 * Retorna os metadados de eventos globais ativos em uma semana específica.
 */
export function inspectCalendarWeek(year: number, week: number): CalendarWeekInfo {
  if (!Number.isInteger(week) || week < 1 || week > WEEKS_PER_YEAR) {
    throw new RangeError(`Semana inválida no calendário global: ${week} (esperado 1..52)`);
  }

  return {
    year,
    week,
    isFifaDate: (FIFA_DATE_WEEKS as readonly number[]).includes(week),
    isSplitYearRollover: week === SPLIT_YEAR_ROLLOVER_WEEK,
    isCalendarYearRollover: week === CALENDAR_YEAR_ROLLOVER_WEEK,
    isWorldCupYear: isWorldCupYear(year),
    isClubWorldCupYear: isClubWorldCupYear(year),
  };
}

/**
 * Avança exatamente 1 semana no calendário de 52 semanas.
 */
export function advanceCalendarWeek(year: number, week: number): CalendarWeekInfo {
  if (!Number.isInteger(week) || week < 1 || week > WEEKS_PER_YEAR) {
    throw new RangeError(`Semana inválida para avanço: ${week} (esperado 1..52)`);
  }
  const nextYear = week === WEEKS_PER_YEAR ? year + 1 : year;
  const nextWeek = week === WEEKS_PER_YEAR ? 1 : week + 1;
  return inspectCalendarWeek(nextYear, nextWeek);
}

/**
 * Valida e decompõe uma data ISO `YYYY-MM-DD` verificando existência real no calendário gregoriano.
 */
function parseIsoBirthDate(birthDateIso: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDateIso.trim());
  if (!match) {
    throw new RangeError(`Data de nascimento inválida: ${birthDateIso}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const checkDate = new Date(Date.UTC(year, month - 1, day));
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    throw new RangeError(`Data de nascimento inexistente no calendário: ${birthDateIso}`);
  }

  return { year, month, day };
}

/**
 * Calcula em qual semana do ano (1..52) um atleta faz aniversário,
 * garantindo envelhecimento natural sem saltos artificiais na virada do ano (Seção 5.7).
 */
export function getBirthdayWeek(birthDateIso: string): number {
  const { month, day } = parseIsoBirthDate(birthDateIso);

  // Usa ano não bissexto de referência para mapear dia do ano (1..365) em semana (1..52)
  const refStart = Date.UTC(2025, 0, 1);
  const clampedDay = month === 2 && day === 29 ? 28 : day;
  const refDate = Date.UTC(2025, month - 1, clampedDay);
  const dayOfYear = Math.floor((refDate - refStart) / 86_400_000) + 1;
  return Math.min(WEEKS_PER_YEAR, Math.max(1, Math.ceil(dayOfYear / 7)));
}

/**
 * Calcula a idade exata do atleta considerando ano e semana atual do calendário do save.
 */
export function calculateAgeAtWeek(
  birthDateIso: string,
  currentYear: number,
  currentWeek: number,
): number {
  if (!Number.isInteger(currentYear)) {
    throw new RangeError(`Ano inválido no cálculo de idade: ${currentYear}`);
  }
  if (!Number.isInteger(currentWeek) || currentWeek < 1 || currentWeek > WEEKS_PER_YEAR) {
    throw new RangeError(`Semana inválida no cálculo de idade: ${currentWeek} (esperado 1..52)`);
  }
  const { year: birthYear } = parseIsoBirthDate(birthDateIso);
  const birthdayWeek = getBirthdayWeek(birthDateIso);
  const hasCelebratedThisYear = currentWeek >= birthdayWeek;
  return Math.max(0, currentYear - birthYear - (hasCelebratedThisYear ? 0 : 1));
}
