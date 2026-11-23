import type { PlayerTrait, Position } from '@footmanager/schemas';

export interface RatingInput {
  leagueReputation: number; // 1..100
  marketValueEur: number; // >= 0
  age: number; // 15..45
  position: Position;
}

export interface CalculatedPlayerProfile {
  overall: number;
  potential: number;
  isStar: boolean;
  traits: PlayerTrait[];
  weeklySalaryEur: number;
}

const DEFAULT_TRAITS_BY_POSITION: Record<Position, readonly PlayerTrait[]> = {
  GOL: ['REFLEXO', 'SAIDA_GOL', 'PENALTIS'],
  ZAG: ['MARCACAO', 'DESARME', 'CABECEIO'],
  LAT: ['VELOCIDADE', 'RESISTENCIA', 'PASSE'],
  VOL: ['DESARME', 'PASSE', 'RESISTENCIA'],
  MEI: ['ARMACAO', 'PASSE', 'BOLA_PARADA'],
  ATA: ['FINALIZACAO', 'DRIBLE', 'VELOCIDADE'],
};

/**
 * Calcula força inicial (1..99), potencial, status estrela e salário semanal base (Seção 9)
 * combinando reputação da liga, valor de mercado em escala logarítmica e curva etária DEC-008.
 */
export function calculateInitialPlayerProfile(input: RatingInput): CalculatedPlayerProfile {
  const safeLeagueRep = Math.max(1, Math.min(100, input.leagueReputation));
  const safeValue = Math.max(0, input.marketValueEur);

  // Contribuição logarítmica do valor de mercado (evita distorções entre €500k e €180M)
  const valueScore = safeValue > 0 ? Math.log10(safeValue / 100_000 + 1) * 14.5 : 0;
  const leagueBase = 42 + safeLeagueRep * 0.24;

  // Ajuste leve para atletas muito jovens (valor de mercado embute potencial futuro)
  const youthDiscount = input.age <= 20 ? (21 - input.age) * 1.3 : 0;
  const rawOverall = Math.round(leagueBase + valueScore - youthDiscount);
  const overall = Math.max(40, Math.min(96, rawOverall));

  // Potencial respeita teto <= 99 e curva de desenvolvimento até 23 anos
  const youthHeadroom = input.age <= 23 ? Math.max(2, Math.round((24 - input.age) * 1.6)) : 1;
  const potential = Math.max(overall, Math.min(99, overall + youthHeadroom));

  // Estrela (★) reservada ao topo qualitativo da liga (força elevada relativa à reputação)
  const starThreshold = Math.max(76, Math.round(62 + safeLeagueRep * 0.22));
  const isStar = overall >= starThreshold;

  const positionTraits = DEFAULT_TRAITS_BY_POSITION[input.position];
  const traits: PlayerTrait[] = isStar
    ? [positionTraits[0] as PlayerTrait, positionTraits[1] as PlayerTrait]
    : overall >= 72
      ? [positionTraits[0] as PlayerTrait]
      : [];

  // Salário semanal proporcional ao valor de mercado e reputação
  const weeklySalaryEur = Math.max(
    1500,
    Math.round((safeValue * 0.0022 + overall * 180) / 100) * 100,
  );

  return {
    overall,
    potential,
    isStar,
    traits,
    weeklySalaryEur,
  };
}
