/**
 * Gerador de números pseudoaleatórios determinístico (PRNG Mulberry32).
 * Permite reproduzir exatamente qualquer partida, rodada ou bug usando a mesma seed (Seção 3.1).
 */
export interface DeterministicRng {
  /** Retorna número de ponto flutuante no intervalo [0, 1). */
  nextFloat(): number;
  /** Retorna inteiro uniforme no intervalo fechado [min, max]. */
  nextInt(min: number, max: number): number;
  /** Retorna true com probabilidade `probability` (0..1). */
  chance(probability: number): boolean;
  /** Escolhe um elemento aleatório de uma lista não vazia. */
  pick<T>(items: readonly T[]): T;
  /** Retorna cópia embaralhada via Fisher-Yates sem mutar o array original. */
  shuffle<T>(items: readonly T[]): T[];
  /** Retorna próxima seed positiva segura (1..2147483647) para persistência em save. */
  nextSeed(): number;
}

/**
 * Normaliza a seed para inteiro de 32 bits positivo e não nulo.
 */
function normalizeSeed(seed: number): number {
  const truncated = Math.trunc(seed) >>> 0;
  return truncated === 0 ? 1 : truncated;
}

/**
 * Embaralha uma cópia do array via algoritmo Fisher-Yates usando o sorteador de inteiros informado.
 */
function fisherYatesShuffle<T>(
  items: readonly T[],
  nextInt: (min: number, max: number) => number,
): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = nextInt(0, i);
    const current = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = current;
  }
  return copy;
}

/**
 * Sorteia um único elemento de uma coleção não vazia.
 */
function pickRandomItem<T>(
  items: readonly T[],
  nextInt: (min: number, max: number) => number,
): T {
  if (items.length === 0) {
    throw new RangeError('Não é possível sortear item de uma lista vazia');
  }
  return items[nextInt(0, items.length - 1)] as T;
}

/**
 * Cria instância isolada e determinística do PRNG Mulberry32.
 */
export function createRng(initialSeed: number): DeterministicRng {
  let state = normalizeSeed(initialSeed);

  const nextFloat = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (min: number, max: number): number => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new RangeError(`Intervalo inválido para nextInt: [${min}, ${max}]`);
    }
    const low = Math.ceil(min);
    const high = Math.floor(max);
    if (high < low) {
      throw new RangeError(`Nenhum inteiro disponível no intervalo [${min}, ${max}]`);
    }
    return low + Math.floor(nextFloat() * (high - low + 1));
  };

  const chance = (probability: number): boolean => {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return nextFloat() < probability;
  };

  return {
    nextFloat,
    nextInt,
    chance,
    pick: <T>(items: readonly T[]) => pickRandomItem(items, nextInt),
    shuffle: <T>(items: readonly T[]) => fisherYatesShuffle(items, nextInt),
    nextSeed: () => nextInt(1, 2147483647),
  };
}
