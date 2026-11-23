import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import { sanitizeSvgContent } from './sanitizer.js';

/** Limites rígidos de segurança para pacotes .fmpack (Seção 7.3). */
export const FMPACK_SECURITY_LIMITS = {
  maxArchiveBytes: 50 * 1024 * 1024, // 50 MB
  maxTotalUncompressedBytes: 50 * 1024 * 1024, // 50 MB (proteção anti ZIP bomb)
  maxBadgeBytes: 256 * 1024, // 256 KB por escudo
  maxEntries: 5000,
  allowedExtensions: new Set(['.json', '.png', '.webp', '.svg']),
} as const;

const ZIP_METHOD_STORED = 0;
const ZIP_METHOD_DEFLATED = 8;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Representação em memória dos arquivos seguros extraídos de um arquivo `.fmpack`.
 */
export interface UnpackedFmpack {
  jsonFiles: Record<string, unknown>;
  badges: Record<string, string>;
  totalUncompressedBytes: number;
  entryCount: number;
}

/**
 * Valida se o caminho relativo de uma entrada ZIP é 100% seguro contra path traversal.
 * Normaliza prefixos redundantes `./` preservando bloqueio estrito de `..` e caminhos absolutos.
 */
export function assertSafeZipEntryPath(entryName: string): string {
  if (!entryName || entryName.includes('\0')) {
    throw new Error('Entrada ZIP inválida ou contendo caractere nulo.');
  }

  const normalizedSlash = entryName.replace(/\\/g, '/');
  if (
    normalizedSlash.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalizedSlash) ||
    normalizedSlash.split('/').includes('..')
  ) {
    throw new Error(`Tentativa de path traversal bloqueada no pacote: "${entryName}"`);
  }

  // Confirmação final via path.resolve em diretório virtual sandboxed
  const virtualRoot = path.resolve('/fmpack-sandbox-root');
  const resolved = path.resolve(virtualRoot, normalizedSlash);
  if (resolved !== virtualRoot && !resolved.startsWith(`${virtualRoot}${path.sep}`)) {
    throw new Error(`Entrada ZIP escapou do diretório sandboxed: "${entryName}"`);
  }

  // Remove prefixos `./` redundantes sem alterar hierarquia de pastas
  const cleaned = path.posix.normalize(normalizedSlash).replace(/^\.\//, '');
  if (!cleaned || cleaned === '.' || cleaned.startsWith('..') || cleaned.startsWith('/')) {
    throw new Error(`Entrada ZIP inválida após normalização: "${entryName}"`);
  }

  return cleaned;
}

/**
 * Detecta se a entrada do ZIP é um symlink UNIX (bloqueado por segurança).
 */
function isUnixSymlink(externalAttr: number): boolean {
  const unixMode = (externalAttr >>> 16) & 0o170000;
  return unixMode === 0o120000;
}

/**
 * Valida assinatura mágica binária de imagens PNG e WebP para bloquear arquivos falsificados/poliglotas.
 */
function assertValidImageMagicBytes(buffer: Buffer, ext: '.png' | '.webp', entryPath: string): void {
  if (ext === '.png') {
    if (buffer.byteLength < PNG_MAGIC.byteLength || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new Error(`Escudo PNG inválido ou falsificado (assinatura binária incorreta): "${entryPath}"`);
    }
    return;
  }

  const isWebp =
    buffer.byteLength >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!isWebp) {
    throw new Error(`Escudo WebP inválido ou falsificado (assinatura binária incorreta): "${entryPath}"`);
  }
}

/**
 * Descompacta uma entrada ZIP aplicando teto rígido de bytes (`maxOutputLength`) ANTES de alocar RAM,
 * neutralizando ZIP bombs mesmo quando o campo `header.size` do ZIP foi falsificado.
 */
function decompressEntryBounded(
  entry: AdmZip.IZipEntry,
  maxAllowedBytes: number,
  limitErrorMessage: string,
): Buffer {
  if (entry.header.encrypted) {
    throw new Error(`Entrada criptografada não é permitida em pacotes .fmpack: "${entry.entryName}"`);
  }

  const compressed = entry.getCompressedData();
  const method = entry.header.method;

  if (method === ZIP_METHOD_STORED) {
    if (compressed.byteLength > maxAllowedBytes) {
      throw new Error(limitErrorMessage);
    }
    return compressed;
  }

  if (method === ZIP_METHOD_DEFLATED) {
    try {
      return zlib.inflateRawSync(compressed, { maxOutputLength: maxAllowedBytes });
    } catch (error) {
      const errCode = (error as NodeJS.ErrnoException | undefined)?.code;
      if (errCode === 'ERR_BUFFER_TOO_LARGE') {
        throw new Error(limitErrorMessage);
      }
      throw new Error(`Falha ao descompactar entrada ZIP "${entry.entryName}".`);
    }
  }

  throw new Error(
    `Método de compressão ZIP não suportado (${method}) na entrada "${entry.entryName}".`,
  );
}

interface UnpackAccumulator {
  jsonFiles: Record<string, unknown>;
  badges: Record<string, string>;
  seenPaths: Set<string>;
  totalUncompressedBytes: number;
}

/**
 * Valida caminho, duplicidade, symlink e extensão de uma entrada ZIP de arquivo.
 */
function validateZipFileEntry(
  entry: AdmZip.IZipEntry,
  seenPaths: Set<string>,
): { safePath: string; ext: string } {
  if (isUnixSymlink(entry.header.attr)) {
    throw new Error(`Symlink bloqueado por segurança no pacote: "${entry.entryName}"`);
  }

  const safePath = assertSafeZipEntryPath(entry.entryName);
  if (seenPaths.has(safePath)) {
    throw new Error(`Entrada duplicada bloqueada no pacote .fmpack: "${safePath}"`);
  }
  seenPaths.add(safePath);

  const ext = path.extname(safePath).toLowerCase();
  if (!FMPACK_SECURITY_LIMITS.allowedExtensions.has(ext)) {
    throw new Error(
      `Extensão não permitida no pacote .fmpack: "${safePath}" (${ext || 'sem extensão'})`,
    );
  }

  return { safePath, ext };
}

/**
 * Calcula o teto máximo em bytes permitido para a entrada atual e a mensagem de erro correspondente.
 */
function computeEntryByteLimit(
  ext: string,
  safePath: string,
  totalUncompressedBytes: number,
): { entryByteLimit: number; limitMessage: string } {
  const remainingPackBytes =
    FMPACK_SECURITY_LIMITS.maxTotalUncompressedBytes - totalUncompressedBytes;
  const isBadge = ext !== '.json';
  const entryByteLimit = isBadge
    ? Math.min(remainingPackBytes, FMPACK_SECURITY_LIMITS.maxBadgeBytes)
    : remainingPackBytes;
  const limitMessage =
    isBadge && entryByteLimit === FMPACK_SECURITY_LIMITS.maxBadgeBytes
      ? `Escudo "${safePath}" excede o tamanho máximo de 256 KB.`
      : 'Conteúdo descompactado do pacote excede o limite de 50 MB.';

  return { entryByteLimit, limitMessage };
}

/**
 * Interpreta e armazena o conteúdo descompactado (JSON validável ou escudo sanitizado).
 */
function storeEntryPayload(
  acc: UnpackAccumulator,
  safePath: string,
  ext: string,
  content: Buffer,
): void {
  if (ext === '.json') {
    try {
      acc.jsonFiles[safePath] = JSON.parse(content.toString('utf-8')) as unknown;
    } catch {
      throw new Error(`JSON malformado dentro do pacote .fmpack: "${safePath}"`);
    }
    return;
  }

  if (content.byteLength > FMPACK_SECURITY_LIMITS.maxBadgeBytes) {
    throw new Error(`Escudo "${safePath}" excede o tamanho máximo de 256 KB.`);
  }

  if (ext === '.svg') {
    acc.badges[safePath] = sanitizeSvgContent(content.toString('utf-8'));
    return;
  }

  const binaryExt = ext as '.png' | '.webp';
  assertValidImageMagicBytes(content, binaryExt, safePath);
  acc.badges[safePath] =
    `data:image/${binaryExt === '.png' ? 'png' : 'webp'};base64,${content.toString('base64')}`;
}

/**
 * Processa uma única entrada ZIP aplicando todas as barreiras de segurança antes de acumular.
 */
function processZipEntry(entry: AdmZip.IZipEntry, acc: UnpackAccumulator): void {
  const rawName = entry.rawEntryName.toString('utf-8');
  assertSafeZipEntryPath(rawName);

  if (entry.isDirectory) {
    assertSafeZipEntryPath(entry.entryName);
    return;
  }

  const { safePath, ext } = validateZipFileEntry(entry, acc.seenPaths);
  const { entryByteLimit, limitMessage } = computeEntryByteLimit(
    ext,
    safePath,
    acc.totalUncompressedBytes,
  );

  // Verificação prévia do tamanho declarado + descompactação estritamente limitada em RAM
  if (entry.header.size > entryByteLimit) {
    throw new Error(limitMessage);
  }

  const content = decompressEntryBounded(entry, entryByteLimit, limitMessage);
  acc.totalUncompressedBytes += content.byteLength;
  if (acc.totalUncompressedBytes > FMPACK_SECURITY_LIMITS.maxTotalUncompressedBytes) {
    throw new Error('Conteúdo descompactado do pacote excede o limite de 50 MB.');
  }

  storeEntryPayload(acc, safePath, ext, content);
}

/**
 * Lê e valida um buffer ou arquivo `.fmpack` sem jamais extrair arquivos não confiáveis para o disco.
 */
export function unpackFmpackBuffer(zipBuffer: Buffer): UnpackedFmpack {
  if (zipBuffer.byteLength === 0) {
    throw new Error('Arquivo .fmpack está vazio.');
  }
  if (zipBuffer.byteLength > FMPACK_SECURITY_LIMITS.maxArchiveBytes) {
    throw new Error('Arquivo .fmpack excede o limite máximo permitido de 50 MB.');
  }

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  if (entries.length > FMPACK_SECURITY_LIMITS.maxEntries) {
    throw new Error(
      `Pacote .fmpack excede o limite de ${FMPACK_SECURITY_LIMITS.maxEntries} arquivos.`,
    );
  }

  const acc: UnpackAccumulator = {
    jsonFiles: {},
    badges: {},
    seenPaths: new Set(),
    totalUncompressedBytes: 0,
  };

  for (const entry of entries) {
    processZipEntry(entry, acc);
  }

  return {
    jsonFiles: acc.jsonFiles,
    badges: acc.badges,
    totalUncompressedBytes: acc.totalUncompressedBytes,
    entryCount: entries.length,
  };
}

/**
 * Lê um arquivo `.fmpack` a partir do disco aplicando os limites de tamanho antes da carga em RAM.
 */
export function unpackFmpackFile(filePath: string): UnpackedFmpack {
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new Error('O caminho informado não é um arquivo válido.');
  }
  if (stats.size > FMPACK_SECURITY_LIMITS.maxArchiveBytes) {
    throw new Error('Arquivo .fmpack excede o limite máximo permitido de 50 MB.');
  }
  const buffer = fs.readFileSync(filePath);
  return unpackFmpackBuffer(buffer);
}
