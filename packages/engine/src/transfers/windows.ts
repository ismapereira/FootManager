import type { TransferWindow } from '@footmanager/schemas';

/**
 * Verifica se a janela de transferências de um país está aberta na semana informada (Seção 6.4).
 * Fora da janela, apenas agentes livres e pré-contratos permanecem permitidos.
 */
export function isTransferWindowOpen(
  week: number,
  windows: readonly TransferWindow[],
): boolean {
  return windows.some((window) => week >= window.startWeek && week <= window.endWeek);
}
