import { describe, expect, it } from 'vitest';
import {
  THEME_REFERENCE_SURFACES,
  calculateContrastRatio,
  compositeOverSurface,
  resolveClubThemeTokens,
} from '../../apps/desktop/src/app/theme.js';

describe('Tema Dinâmico do Clube com Contraste WCAG', () => {
  it('calcula contraste exato 21:1 entre branco e preto', () => {
    expect(calculateContrastRatio('#FFFFFF', '#000000')).toBe(21);
    expect(calculateContrastRatio('#C8102E', '#C8102E')).toBe(1);
  });

  it('garante contraste acessível (>= 4.5:1) sobre --bg-surface, --bg-elevated e suas composições accentSoft', () => {
    const sampleColors = [
      '#C8102E', // Flamengo (vermelho)
      '#006437', // Palmeiras (verde escuro)
      '#18181B', // Atlético-MG (preto)
      '#FACC15', // Amarelo claro (exige texto escuro)
      '#757575', // Cinza limítrofe (falhava sobre accentSoft no modo claro)
      '#6E6E78', // Cinza médio limítrofe sobre --bg-elevated escuro (#1B1B22)
      '#5A6577', // Azul acinzentado limítrofe sobre --bg-elevated claro (#F1F5F9)
      '#8B5CF6', // Roxo médio em hover/badge elevado
      '#FFFFFF', // Branco puro
      '#000000', // Preto puro
      'cor-invalida', // Fallback seguro
    ];

    for (const primary of sampleColors) {
      for (const mode of ['dark', 'light'] as const) {
        const tokens = resolveClubThemeTokens(primary, '#FFFFFF', mode);
        expect(tokens.contrastRatioOnPrimary).toBeGreaterThanOrEqual(4.5);

        const [surface, elevated] = THEME_REFERENCE_SURFACES[mode];
        const softAlpha = mode === 'dark' ? 0.18 : 0.11;
        const softOnSurface = compositeOverSurface(tokens.primary, surface, softAlpha);
        const softOnElevated = compositeOverSurface(tokens.primary, elevated, softAlpha);

        expect(calculateContrastRatio(tokens.accentText, surface)).toBeGreaterThanOrEqual(4.5);
        expect(calculateContrastRatio(tokens.accentText, softOnSurface)).toBeGreaterThanOrEqual(4.5);
        expect(calculateContrastRatio(tokens.accentText, elevated)).toBeGreaterThanOrEqual(4.5);
        expect(calculateContrastRatio(tokens.accentText, softOnElevated)).toBeGreaterThanOrEqual(4.5);
      }
    }

    // Amarelo claro deve selecionar texto escuro (#09090B)
    const yellowTokens = resolveClubThemeTokens('#FACC15', '#1E3A8A', 'dark');
    expect(yellowTokens.primaryForeground).toBe('#09090B');
  });
});
