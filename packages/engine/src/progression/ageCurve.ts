import type { Position } from '@footmanager/schemas';

/**
 * Fases da curva de longevidade oficial conforme DEC-008 e Seção 6.1:
 * - Linha: evolução (16-23), auge longevo (24-32), declínio gradual (33+)
 * - Goleiro: evolução (16-24), auge longevo (25-35), declínio gradual (36+)
 */
export type CareerAgeStage = 'development' | 'peak' | 'decline';

/**
 * Identifica a fase etária do atleta respeitando a longevidade estendida de goleiros.
 */
export function getCareerAgeStage(age: number, position: Position): CareerAgeStage {
  if (position === 'GOL') {
    if (age <= 24) return 'development';
    if (age <= 35) return 'peak';
    return 'decline';
  }

  if (age <= 23) return 'development';
  if (age <= 32) return 'peak';
  return 'decline';
}

/**
 * Parâmetros para projeção de variação anual de força (overall) na virada de temporada.
 */
export interface ProgressionContext {
  age: number;
  position: Position;
  overall: number;
  potential: number;
  isStar: boolean;
  traits: readonly string[];
  /** Proporção de minutos jogados na temporada (0..1). */
  minutesRatio: number;
  /** Nível da estrutura/base do clube (1..5). */
  academyLevel: number;
  /** Nota média da temporada (5.0..9.0). */
  averageRating: number;
}

/**
 * Calcula a variação determinística de overall ao final de uma temporada (Seção 6.1).
 * Aplica atenuação de 35% no declínio para atletas com RESISTENCIA ou status Estrela (★).
 */
export function calculateSeasonOverallDelta(ctx: ProgressionContext): number {
  const stage = getCareerAgeStage(ctx.age, ctx.position);
  const clampedMinutes = Math.max(0, Math.min(1, ctx.minutesRatio));
  const ceiling = Math.min(99, ctx.potential);
  const headroom = Math.max(0, ceiling - ctx.overall);

  if (stage === 'development') {
    if (headroom === 0) return 0;

    // Jovem com minutos e boa estrutura evolui entre +1 e +4 por temporada
    const rawGrowth =
      1 +
      clampedMinutes * 1.8 +
      (ctx.academyLevel - 1) * 0.25 +
      Math.max(0, ctx.averageRating - 6.5) * 0.4;
    const boundedGrowth = Math.min(4, Math.max(1, Math.round(rawGrowth)));
    return Math.min(headroom, boundedGrowth);
  }

  if (stage === 'peak') {
    // Auge longevo: estabilidade total com pequenas oscilações (-1 a +2) respeitando [1, min(99, potential)]
    if (ctx.averageRating >= 7.6 && headroom > 0) return Math.min(2, headroom);
    if (ctx.averageRating >= 7.1 && headroom > 0) return 1;
    if (ctx.averageRating < 5.8) return ctx.overall > 1 ? -1 : 0;
    return 0;
  }

  // Declínio gradual: 33+ (linha) ou 36+ (goleiro)
  const declineStartAge = ctx.position === 'GOL' ? 36 : 33;
  const yearsInDecline = Math.max(0, ctx.age - declineStartAge);
  let baseDrop = Math.min(3, 1 + Math.floor(yearsInDecline / 2));

  // Atenuação de 35% no declínio para atletas resistentes ou estrelas (Seção 6.1)
  const hasMitigation = ctx.isStar || ctx.traits.includes('RESISTENCIA');
  if (hasMitigation) {
    baseDrop = Math.max(1, Math.round(baseDrop * 0.65));
  }

  return -Math.min(baseDrop, Math.max(0, ctx.overall - 1));
}

/**
 * Calcula probabilidade anual de aposentadoria (0..1).
 * Jogadores de linha começam aos 35 anos; goleiros aos 38 anos (Seção 6.1).
 */
export function calculateRetirementProbability(age: number, position: Position): number {
  const startAge = position === 'GOL' ? 38 : 35;
  if (age < startAge) return 0;

  const yearsPastThreshold = age - startAge;
  return Number(Math.min(0.95, 0.12 + yearsPastThreshold * 0.16).toFixed(2));
}
