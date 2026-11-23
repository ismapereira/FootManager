/**
 * Motor de tema dinâmico baseado na cor primária do clube treinado (Seção 10.1).
 * Garante contraste legível conforme diretrizes WCAG 2.2 em Modo Escuro e Modo Claro.
 */

export type ThemeMode = 'dark' | 'light';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface ClubThemeTokens {
  primary: string;
  primaryForeground: '#FFFFFF' | '#09090B';
  secondary: string;
  accentText: string;
  accentSoft: string;
  contrastRatioOnPrimary: number;
}

const DEFAULT_PRIMARY_HEX = '#10B981';
const DEFAULT_SECONDARY_HEX = '#0F172A';
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Superfícies de referência do tema (`--bg-surface` e `--bg-elevated`) onde `--club-accent-text`
 * e `--club-accent-soft` são renderizados (tabelas em hover, badges e cartões).
 */
export const THEME_REFERENCE_SURFACES: Readonly<Record<ThemeMode, readonly [string, string]>> = {
  dark: ['#121217', '#1B1B22'],
  light: ['#FFFFFF', '#F1F5F9'],
};

/**
 * Converte cor hexadecimal `#RRGGBB` validada para componentes RGB (0..255).
 */
export function parseHexColor(hex: string, fallback = DEFAULT_PRIMARY_HEX): RgbColor {
  const safeHex = HEX_COLOR_REGEX.test(hex) ? hex : fallback;
  return {
    r: parseInt(safeHex.slice(1, 3), 16),
    g: parseInt(safeHex.slice(3, 5), 16),
    b: parseInt(safeHex.slice(5, 7), 16),
  };
}

/**
 * Normaliza uma string de cor hexadecimal ou aplica fallback seguro.
 */
export function normalizeHexColor(hex: string, fallback = DEFAULT_PRIMARY_HEX): string {
  return HEX_COLOR_REGEX.test(hex) ? hex.toUpperCase() : fallback;
}

/**
 * Converte componentes RGB em string hexadecimal `#RRGGBB`.
 */
function rgbToHex({ r, g, b }: RgbColor): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Calcula luminância relativa sRGB segundo fórmula oficial WCAG 2.2.
 */
export function calculateRelativeLuminance(rgb: RgbColor): number {
  const toLinear = (channel: number): number => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

/**
 * Calcula razão de contraste WCAG entre duas cores hexadecimais (1.0 a 21.0).
 */
export function calculateContrastRatio(hexA: string, hexB: string): number {
  const lumA = calculateRelativeLuminance(parseHexColor(hexA));
  const lumB = calculateRelativeLuminance(parseHexColor(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/**
 * Mistura duas cores RGB segundo fator `amount` (0..1).
 */
function mixRgb(source: RgbColor, target: RgbColor, amount: number): RgbColor {
  return {
    r: source.r + (target.r - source.r) * amount,
    g: source.g + (target.g - source.g) * amount,
    b: source.b + (target.b - source.b) * amount,
  };
}

/**
 * Compõe uma cor RGBA semi-transparente sobre uma superfície opaca para calcular contraste real WCAG.
 */
export function compositeOverSurface(
  foregroundHex: string,
  backgroundHex: string,
  alpha: number,
): string {
  const fg = parseHexColor(foregroundHex);
  const bg = parseHexColor(backgroundHex);
  const a = Math.max(0, Math.min(1, alpha));
  return rgbToHex({
    r: bg.r * (1 - a) + fg.r * a,
    g: bg.g * (1 - a) + fg.g * a,
    b: bg.b * (1 - a) + fg.b * a,
  });
}

/**
 * Monta todos os fundos opacos efetivos sobre os quais `--club-accent-text` pode aparecer:
 * `--bg-surface`, `--bg-elevated` e suas composições com `--club-accent-soft`.
 */
function buildAccentValidationBackgrounds(
  primaryHex: string,
  mode: ThemeMode,
  softAlpha: number,
): string[] {
  const backgrounds: string[] = [];
  for (const surfaceHex of THEME_REFERENCE_SURFACES[mode]) {
    backgrounds.push(surfaceHex);
    backgrounds.push(compositeOverSurface(primaryHex, surfaceHex, softAlpha));
  }
  return backgrounds;
}

/**
 * Garante que a cor de destaque usada para texto/ícones atinja pelo menos contraste 4.5:1
 * sobre `--bg-surface`, `--bg-elevated` e suas respectivas composições `--club-accent-soft`.
 */
function ensureAccessibleAccentText(
  primaryHex: string,
  mode: ThemeMode,
  softAlpha: number,
): string {
  const backgrounds = buildAccentValidationBackgrounds(primaryHex, mode, softAlpha);
  const targetRgb: RgbColor = mode === 'dark' ? { r: 244, g: 244, b: 245 } : { r: 15, g: 23, b: 42 };
  const baseRgb = parseHexColor(primaryHex);

  const steps = 25;
  for (let step = 0; step <= steps; step += 1) {
    const candidateHex = step === 0 ? primaryHex : rgbToHex(mixRgb(baseRgb, targetRgb, step / steps));
    const passesAllSurfaces = backgrounds.every(
      (backgroundHex) => calculateContrastRatio(candidateHex, backgroundHex) >= 4.5,
    );
    if (passesAllSurfaces) {
      return candidateHex;
    }
  }

  return mode === 'dark' ? '#F4F4F5' : '#0F172A';
}

/**
 * Resolve todos os tokens CSS dinâmicos de um clube respeitando acessibilidade WCAG.
 */
export function resolveClubThemeTokens(
  rawPrimaryHex: string,
  rawSecondaryHex: string,
  mode: ThemeMode,
): ClubThemeTokens {
  const primary = normalizeHexColor(rawPrimaryHex, DEFAULT_PRIMARY_HEX);
  const secondary = normalizeHexColor(rawSecondaryHex, DEFAULT_SECONDARY_HEX);

  const contrastWhite = calculateContrastRatio(primary, '#FFFFFF');
  const contrastBlack = calculateContrastRatio(primary, '#09090B');

  const primaryForeground: '#FFFFFF' | '#09090B' =
    contrastWhite >= contrastBlack ? '#FFFFFF' : '#09090B';
  const contrastRatioOnPrimary = Math.max(contrastWhite, contrastBlack);

  const primaryRgb = parseHexColor(primary);
  const softAlpha = mode === 'dark' ? 0.18 : 0.11;
  const accentSoft = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, ${softAlpha})`;

  return {
    primary,
    primaryForeground,
    secondary,
    accentText: ensureAccessibleAccentText(primary, mode, softAlpha),
    accentSoft,
    contrastRatioOnPrimary,
  };
}

/**
 * Aplica os tokens do clube e o modo claro/escuro diretamente no elemento raiz do documento.
 */
export function applyClubThemeToDocument(tokens: ClubThemeTokens, mode: ThemeMode): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.style.setProperty('--club-primary', tokens.primary);
  root.style.setProperty('--club-primary-fg', tokens.primaryForeground);
  root.style.setProperty('--club-secondary', tokens.secondary);
  root.style.setProperty('--club-accent-text', tokens.accentText);
  root.style.setProperty('--club-accent-soft', tokens.accentSoft);
}
