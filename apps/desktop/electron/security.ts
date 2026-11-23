import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Gera cabeçalho HTTP Content-Security-Policy endurecido para o processo principal do Electron (Seção 11.1).
 * Em produção bloqueia scripts remotos, scripts inline e `eval`.
 */
export function buildCspHeader(isDev: boolean): string {
  if (isDev) {
    return "default-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173; script-src 'self' 'unsafe-inline' http://127.0.0.1:5173; style-src 'self' 'unsafe-inline' http://127.0.0.1:5173; img-src 'self' data: http://127.0.0.1:5173; font-src 'self'; connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none';";
  }

  return "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none';";
}

export interface NavigationPolicyOptions {
  isDev: boolean;
  devServerUrl?: string;
  distHtmlPath: string;
  platform?: NodeJS.Platform;
}

/**
 * Valida estritamente se uma URL de navegação (`will-navigate`) pertence à origem exata do app.
 * Impede bypasses por prefixo (ex.: `http://127.0.0.1:5173.evil.com` ou `file:///C:/Windows/win.ini`).
 */
export function isAllowedNavigationUrl(
  targetUrl: string,
  options: NavigationPolicyOptions,
): boolean {
  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return false;
  }

  if (options.isDev && options.devServerUrl) {
    try {
      const parsedDev = new URL(options.devServerUrl);
      return parsedTarget.origin === parsedDev.origin;
    } catch {
      return false;
    }
  }

  if (parsedTarget.protocol !== 'file:') {
    return false;
  }

  try {
    const targetFilePath = path.resolve(fileURLToPath(parsedTarget));
    const expectedFilePath = path.resolve(options.distHtmlPath);
    const platform = options.platform ?? process.platform;
    if (platform === 'win32') {
      return targetFilePath.toLowerCase() === expectedFilePath.toLowerCase();
    }
    return targetFilePath === expectedFilePath;
  } catch {
    return false;
  }
}
