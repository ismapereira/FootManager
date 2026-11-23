import type { AdvanceWeekResult } from '@footmanager/schemas';
import { advanceCalendarWeek } from './calendar/weekCalendar.js';
import { createRng } from './rng/mulberry32.js';

/**
 * Estado mínimo de mundo processado pelo orquestrador de avanço semanal na Fase 0.
 * Nas Fases 1–3 este contrato receberá partidas, mercado, finanças e progressão completas.
 */
export interface WorldTickInput {
  currentYear: number;
  currentWeek: number;
  seed: number;
}

/**
 * Orquestrador puro de avanço de 1 semana no calendário global (Seção 4.3).
 * Executa sem I/O e retorna o próximo estado determinístico mais telemetria de latência.
 */
export function advanceWorldWeek(input: WorldTickInput): AdvanceWeekResult {
  const startedAt = performance.now();
  const rng = createRng(input.seed);
  const nextCalendar = advanceCalendarWeek(input.currentYear, input.currentWeek);

  // Consome 1 passo determinístico do PRNG para encadear a seed da próxima semana
  const nextSeed = rng.nextSeed();
  const durationMs = Number((performance.now() - startedAt).toFixed(3));

  return {
    previousYear: input.currentYear,
    previousWeek: input.currentWeek,
    currentYear: nextCalendar.year,
    currentWeek: nextCalendar.week,
    isFifaDate: nextCalendar.isFifaDate,
    isSplitYearRollover: nextCalendar.isSplitYearRollover,
    isCalendarYearRollover: nextCalendar.isCalendarYearRollover,
    nextSeed,
    durationMs,
  };
}
