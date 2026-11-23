import { IsoDateSchema, type Position } from '@footmanager/schemas';

/**
 * Normaliza texto removendo acentos, caracteres de controle e símbolos para gerar slugs canônicos.
 */
export function normalizeSlug(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Gera ID determinístico de atleta no formato padrão `ply_<iso>_<yyyymmdd>_<slug>` (Seção 9).
 */
export function buildCanonicalPlayerId(
  nationalityIso3: string,
  birthDateIso: string,
  fullName: string,
): string {
  const trimmedIso = nationalityIso3.trim();
  if (!/^[A-Za-z]{3}$/.test(trimmedIso)) {
    throw new Error(
      `Código de nacionalidade ISO-3 inválido para geração de ID: "${nationalityIso3}"`,
    );
  }
  const iso = trimmedIso.toLowerCase();

  const parsedDate = IsoDateSchema.safeParse(birthDateIso.trim());
  if (!parsedDate.success) {
    throw new Error(`Data de nascimento inválida para geração de ID: "${birthDateIso}"`);
  }
  const compactDate = parsedDate.data.replace(/-/g, '');

  const slug = normalizeSlug(fullName).slice(0, 48).replace(/_+$/g, '');
  if (!slug) {
    throw new Error(`Nome de jogador inválido para geração de ID: "${fullName}"`);
  }
  return `ply_${iso}_${compactDate}_${slug}`;
}

/**
 * Mapeia abreviações comuns de bases externas (inglês/português/espanhol) para as 6 posições padrão.
 */
const POSITION_MAP: Record<string, Position> = {
  // Goleiro
  gol: 'GOL',
  gk: 'GOL',
  goalkeeper: 'GOL',
  portero: 'GOL',
  goleiro: 'GOL',
  // Zagueiro
  zag: 'ZAG',
  cb: 'ZAG',
  dc: 'ZAG',
  zagueiro: 'ZAG',
  defender: 'ZAG',
  'centre-back': 'ZAG',
  // Lateral
  lat: 'LAT',
  lb: 'LAT',
  rb: 'LAT',
  lwb: 'LAT',
  rwb: 'LAT',
  lateral: 'LAT',
  'left-back': 'LAT',
  'right-back': 'LAT',
  // Volante
  vol: 'VOL',
  cdm: 'VOL',
  dm: 'VOL',
  volante: 'VOL',
  'defensive midfield': 'VOL',
  // Meia
  mei: 'MEI',
  cm: 'MEI',
  cam: 'MEI',
  lm: 'MEI',
  rm: 'MEI',
  meia: 'MEI',
  midfielder: 'MEI',
  'central midfield': 'MEI',
  'attacking midfield': 'MEI',
  // Atacante
  ata: 'ATA',
  st: 'ATA',
  cf: 'ATA',
  lw: 'ATA',
  rw: 'ATA',
  ss: 'ATA',
  atacante: 'ATA',
  forward: 'ATA',
  'centre-forward': 'ATA',
};

/**
 * Converte uma descrição externa de posição em uma das 6 posições válidas do FootManager.
 */
export function normalizePosition(rawPosition: string): Position {
  const key = rawPosition.trim().toLowerCase();
  const mapped = POSITION_MAP[key];
  if (!mapped) {
    throw new Error(`Posição externa não reconhecida: "${rawPosition}"`);
  }
  return mapped;
}
