/**
 * Utilitários de sanitização contra XSS, scripts embutidos em SVGs e normalização de texto (Seções 7.3 e 11.1).
 * Usa tokenizador XML/SVG baseado em allowlist estrita de tags e atributos — imune a bypasses de regex.
 */

const MAX_SVG_INPUT_BYTES = 512 * 1024;

/**
 * Mapa de tags SVG estáticas permitidas (chave em minúsculas -> nome canônico SVG).
 * Exclui intencionalmente script, foreignObject, iframe, object, embed, style, a, use, image, set, animate*.
 */
const ALLOWED_SVG_TAGS: Readonly<Record<string, string>> = {
  svg: 'svg',
  g: 'g',
  path: 'path',
  circle: 'circle',
  ellipse: 'ellipse',
  rect: 'rect',
  polygon: 'polygon',
  polyline: 'polyline',
  line: 'line',
  defs: 'defs',
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  stop: 'stop',
  clippath: 'clipPath',
  mask: 'mask',
  title: 'title',
  desc: 'desc',
  text: 'text',
  tspan: 'tspan',
};

/** Tags cujo conteúdo interno deve ser descartado por completo. */
const DROP_CONTENT_TAGS = new Set([
  'script',
  'style',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'handler',
  'audio',
  'video',
  'noscript',
]);

/** Tags que podem conter texto visível/descritivo escapado. */
const TEXT_CONTAINER_TAGS = new Set(['text', 'tspan', 'title', 'desc']);

/**
 * Mapa de atributos SVG geométricos e de apresentação permitidos (chave em minúsculas -> nome canônico).
 * Nunca inclui eventos `on*`, `style`, `href`, `xlink:href` ou `src`.
 */
const ALLOWED_SVG_ATTRIBUTES: Readonly<Record<string, string>> = {
  xmlns: 'xmlns',
  viewbox: 'viewBox',
  width: 'width',
  height: 'height',
  preserveaspectratio: 'preserveAspectRatio',
  id: 'id',
  x: 'x',
  y: 'y',
  x1: 'x1',
  y1: 'y1',
  x2: 'x2',
  y2: 'y2',
  cx: 'cx',
  cy: 'cy',
  r: 'r',
  rx: 'rx',
  ry: 'ry',
  fx: 'fx',
  fy: 'fy',
  dx: 'dx',
  dy: 'dy',
  d: 'd',
  points: 'points',
  transform: 'transform',
  fill: 'fill',
  'fill-opacity': 'fill-opacity',
  'fill-rule': 'fill-rule',
  stroke: 'stroke',
  'stroke-width': 'stroke-width',
  'stroke-opacity': 'stroke-opacity',
  'stroke-linecap': 'stroke-linecap',
  'stroke-linejoin': 'stroke-linejoin',
  'stroke-dasharray': 'stroke-dasharray',
  'stroke-miterlimit': 'stroke-miterlimit',
  opacity: 'opacity',
  offset: 'offset',
  'stop-color': 'stop-color',
  'stop-opacity': 'stop-opacity',
  gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform',
  'clip-path': 'clip-path',
  'clip-rule': 'clip-rule',
  mask: 'mask',
  'font-size': 'font-size',
  'font-weight': 'font-weight',
  'font-family': 'font-family',
  'text-anchor': 'text-anchor',
  'dominant-baseline': 'dominant-baseline',
};

const SAFE_ID_REGEX = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SAFE_LOCAL_URL_REGEX = /^url\(\s*#[A-Za-z][A-Za-z0-9_-]{0,63}\s*\)$/i;
const DANGEROUS_VALUE_REGEX = /(?:javascript|vbscript|data|https?|file)\s*:|\/\/|expression\s*\(/i;

/**
 * Remove caracteres de controle invisíveis e espaços redundantes de textos exibidos na UI.
 */
export function sanitizeDisplayText(input: string): string {
  return input
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Gera slug ASCII minúsculo seguro para IDs e chaves canônicas de deduplicação.
 */
export function normalizeCanonicalSlug(input: string): string {
  return sanitizeDisplayText(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Constrói a chave canônica de deduplicação de jogador da Camada 2 (nome + nascimento + nacionalidade).
 */
export function buildPlayerCanonicalKey(
  name: string,
  birthDate: string,
  nationality: string,
): string {
  const normalizedName = normalizeCanonicalSlug(name);
  const normalizedCountry = nationality.trim().toUpperCase();
  return `${normalizedCountry}:${birthDate.trim()}:${normalizedName}`;
}

/**
 * Decodifica entidades HTML/XML básicas para detectar ofuscações (ex.: `&#106;avascript:`).
 */
function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);?/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/**
 * Escapa texto/valor de atributo XML para serialização segura.
 */
function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Valida o valor decodificado de um atributo permitido na allowlist SVG.
 */
function sanitizeAttributeValue(lowerName: string, rawValue: string): string | null {
  const decoded = decodeXmlEntities(rawValue).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!decoded) return null;

  if (lowerName === 'xmlns') {
    return decoded === 'http://www.w3.org/2000/svg' ? decoded : null;
  }

  if (lowerName === 'id') {
    return SAFE_ID_REGEX.test(decoded) ? decoded : null;
  }

  if (DANGEROUS_VALUE_REGEX.test(decoded)) {
    return null;
  }

  if (/url\s*\(/i.test(decoded)) {
    if (
      (lowerName === 'fill' ||
        lowerName === 'stroke' ||
        lowerName === 'clip-path' ||
        lowerName === 'mask') &&
      SAFE_LOCAL_URL_REGEX.test(decoded)
    ) {
      return decoded;
    }
    return null;
  }

  return decoded;
}

/**
 * Avança o índice pulando espaços em branco e barras soltas (neutraliza `<svg/onload=1>`).
 */
function skipAttrSeparators(segment: string, start: number): number {
  let idx = start;
  while (idx < segment.length && /[\s/]/.test(segment[idx] ?? '')) {
    idx += 1;
  }
  return idx;
}

/**
 * Lê o valor de um atributo SVG após o sinal `=`, com ou sem aspas.
 */
function readAttributeValue(
  segment: string,
  start: number,
): { value: string; nextIndex: number } {
  let idx = start;
  const len = segment.length;
  while (idx < len && /\s/.test(segment[idx] ?? '')) {
    idx += 1;
  }

  const quote = segment[idx];
  if (quote === '"' || quote === "'") {
    idx += 1;
    const valStart = idx;
    while (idx < len && segment[idx] !== quote) {
      idx += 1;
    }
    const value = segment.slice(valStart, idx);
    if (idx < len && segment[idx] === quote) idx += 1;
    return { value, nextIndex: idx };
  }

  const valStart = idx;
  while (idx < len && !/[\s>]/.test(segment[idx] ?? '')) {
    idx += 1;
  }
  return { value: segment.slice(valStart, idx), nextIndex: idx };
}

/**
 * Lê o próximo par `nome=valor` dentro do segmento de atributos de uma tag SVG.
 */
function readNextAttribute(
  segment: string,
  start: number,
): { name: string; value: string; nextIndex: number } | null {
  const len = segment.length;
  let idx = skipAttrSeparators(segment, start);
  if (idx >= len) return null;

  const nameStart = idx;
  while (idx < len && !/[\s=/>"']/.test(segment[idx] ?? '')) {
    idx += 1;
  }
  const name = segment.slice(nameStart, idx);
  if (!name) {
    return { name: '', value: '', nextIndex: idx + 1 };
  }

  while (idx < len && /\s/.test(segment[idx] ?? '')) {
    idx += 1;
  }

  if (segment[idx] !== '=') {
    return { name, value: '', nextIndex: idx };
  }

  const parsedValue = readAttributeValue(segment, idx + 1);
  return { name, value: parsedValue.value, nextIndex: parsedValue.nextIndex };
}

/**
 * Extrai atributos seguros de dentro de uma tag de abertura SVG,
 * tratando corretamente separadores por espaço ou `/` (ex.: `<svg/onload=...>`).
 */
function parseSafeAttributes(rawAttrSegment: string): string {
  const outputAttrs: string[] = [];
  const seen = new Set<string>();
  let idx = 0;

  while (idx < rawAttrSegment.length) {
    const token = readNextAttribute(rawAttrSegment, idx);
    if (!token) break;
    idx = token.nextIndex;
    if (!token.name) continue;

    const lowerName = token.name.toLowerCase();
    const canonicalName = ALLOWED_SVG_ATTRIBUTES[lowerName];
    if (!canonicalName || seen.has(canonicalName)) continue;

    const safeValue = sanitizeAttributeValue(lowerName, token.value);
    if (safeValue !== null) {
      seen.add(canonicalName);
      outputAttrs.push(`${canonicalName}="${escapeXmlAttribute(safeValue)}"`);
    }
  }

  return outputAttrs.length > 0 ? ` ${outputAttrs.join(' ')}` : '';
}

/**
 * Localiza o fechamento `>` de uma tag respeitando aspas em valores de atributo.
 */
function findTagEnd(source: string, startIndex: number): number {
  let quote: '"' | "'" | null = null;
  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

/**
 * Pula declarações XML especiais (`<!-- -->`, `<? ?>`, `<![CDATA[ ]]>`, `<!DOCTYPE ... [...]>`).
 */
function skipSpecialDeclaration(source: string, index: number): number {
  if (source.startsWith('<!--', index)) {
    const end = source.indexOf('-->', index + 4);
    return end === -1 ? source.length : end + 3;
  }
  if (source.startsWith('<![CDATA[', index)) {
    const end = source.indexOf(']]>', index + 9);
    return end === -1 ? source.length : end + 3;
  }
  if (source.startsWith('<?', index)) {
    const end = source.indexOf('?>', index + 2);
    return end === -1 ? source.length : end + 2;
  }

  // `<!DOCTYPE ... [ <!ENTITY ...> ]>` ou `<!ENTITY ...>`
  let bracketDepth = 0;
  let quote: '"' | "'" | null = null;
  for (let i = index + 2; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '[') {
      bracketDepth += 1;
    } else if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (ch === '>' && bracketDepth === 0) {
      return i + 1;
    }
  }
  return source.length;
}

interface SvgSanitizerState {
  output: string[];
  openAllowedStack: string[];
  dropContentStack: string[];
  hasRootSvg: boolean;
}

/**
 * Emite trecho de texto escapado apenas quando o pai atual é uma tag textual permitida.
 */
function appendSanitizedTextChunk(state: SvgSanitizerState, textChunk: string): void {
  if (!textChunk || state.dropContentStack.length > 0 || state.openAllowedStack.length === 0) {
    return;
  }
  const currentParent = state.openAllowedStack[state.openAllowedStack.length - 1];
  if (!currentParent || !TEXT_CONTAINER_TAGS.has(currentParent.toLowerCase())) {
    return;
  }
  const cleanedText = sanitizeDisplayText(decodeXmlEntities(textChunk));
  if (cleanedText) {
    state.output.push(escapeXmlText(cleanedText));
  }
}

/**
 * Processa uma tag de fechamento `</tag>` atualizando pilhas de descarte ou elementos abertos.
 */
function processClosingTag(state: SvgSanitizerState, rawSvg: string, index: number): number {
  const closeEnd = rawSvg.indexOf('>', index + 2);
  if (closeEnd === -1) return rawSvg.length;

  const rawCloseName = rawSvg.slice(index + 2, closeEnd).trim().toLowerCase();
  const nextIndex = closeEnd + 1;

  if (state.dropContentStack.length > 0) {
    if (state.dropContentStack[state.dropContentStack.length - 1] === rawCloseName) {
      state.dropContentStack.pop();
    }
    return nextIndex;
  }

  const canonical = ALLOWED_SVG_TAGS[rawCloseName];
  if (canonical && state.openAllowedStack.length > 0) {
    const matchIdx = state.openAllowedStack.lastIndexOf(canonical);
    if (matchIdx !== -1) {
      while (state.openAllowedStack.length > matchIdx) {
        state.output.push(`</${state.openAllowedStack.pop() as string}>`);
      }
    }
  }
  return nextIndex;
}

/**
 * Emite uma tag de abertura ou auto-fechada validada pela allowlist estrita de SVG.
 */
function emitAllowedOpeningTag(
  state: SvgSanitizerState,
  canonicalTag: string,
  attrSegment: string,
  isSelfClosing: boolean,
): void {
  // Exige que o primeiro elemento permitido emitido seja `<svg>`
  if (!state.hasRootSvg) {
    if (canonicalTag !== 'svg') return;
    state.hasRootSvg = true;
  }

  const safeAttrs = parseSafeAttributes(attrSegment);
  if (isSelfClosing) {
    state.output.push(
      canonicalTag === 'svg' ? `<svg${safeAttrs}></svg>` : `<${canonicalTag}${safeAttrs} />`,
    );
    return;
  }

  state.output.push(`<${canonicalTag}${safeAttrs}>`);
  state.openAllowedStack.push(canonicalTag);
}

/**
 * Processa uma tag de abertura `<tag ...>` ou auto-fechada `<tag .../>`, descartando conteúdo perigoso.
 */
function processOpeningTag(state: SvgSanitizerState, rawSvg: string, index: number): number {
  const tagNameMatch = /^<([A-Za-z][A-Za-z0-9:_-]*)/.exec(rawSvg.slice(index));
  if (!tagNameMatch) {
    // `<` avulso ou sintaxe malformada (ex.: `<sc<iframe/>ript>`): descarta caractere isolado
    return index + 1;
  }

  const rawTagName = tagNameMatch[1] as string;
  const lowerTagName = rawTagName.toLowerCase();
  const afterNameIdx = index + 1 + rawTagName.length;
  const tagEnd = findTagEnd(rawSvg, afterNameIdx);
  if (tagEnd === -1) return rawSvg.length;

  const rawInner = rawSvg.slice(afterNameIdx, tagEnd);
  const trimmedInner = rawInner.trimEnd();
  const isSelfClosing = trimmedInner.endsWith('/');
  const attrSegment = isSelfClosing ? trimmedInner.slice(0, -1) : rawInner;
  const nextIndex = tagEnd + 1;

  if (state.dropContentStack.length > 0 || DROP_CONTENT_TAGS.has(lowerTagName)) {
    if (!isSelfClosing && DROP_CONTENT_TAGS.has(lowerTagName)) {
      state.dropContentStack.push(lowerTagName);
    }
    return nextIndex;
  }

  const canonicalTag = ALLOWED_SVG_TAGS[lowerTagName];
  if (canonicalTag) {
    emitAllowedOpeningTag(state, canonicalTag, attrSegment, isSelfClosing);
  }
  return nextIndex;
}

/**
 * Sanitiza rigorosamente um arquivo SVG de escudo contra vetores de XSS, XXE e exfiltração externa.
 * Reconstrói o SVG exclusivamente a partir de uma allowlist fechada de tags e atributos estáticos.
 */
export function sanitizeSvgContent(rawSvg: string): string {
  if (Buffer.byteLength(rawSvg, 'utf-8') > MAX_SVG_INPUT_BYTES) {
    throw new Error('Conteúdo SVG excede o limite de segurança permitido.');
  }

  const state: SvgSanitizerState = {
    output: [],
    openAllowedStack: [],
    dropContentStack: [],
    hasRootSvg: false,
  };

  let idx = 0;
  while (idx < rawSvg.length) {
    const nextLt = rawSvg.indexOf('<', idx);
    appendSanitizedTextChunk(state, nextLt === -1 ? rawSvg.slice(idx) : rawSvg.slice(idx, nextLt));
    if (nextLt === -1) break;

    const nextChar = rawSvg[nextLt + 1] ?? '';
    if (nextChar === '!' || nextChar === '?') {
      idx = skipSpecialDeclaration(rawSvg, nextLt);
    } else if (nextChar === '/') {
      idx = processClosingTag(state, rawSvg, nextLt);
    } else {
      idx = processOpeningTag(state, rawSvg, nextLt);
    }
  }

  // Fecha qualquer tag permitida que tenha ficado aberta
  while (state.openAllowedStack.length > 0) {
    state.output.push(`</${state.openAllowedStack.pop() as string}>`);
  }

  const sanitized = state.output.join('').trim();
  if (!state.hasRootSvg || !/^<svg\b/.test(sanitized) || !/<\/svg>$/.test(sanitized)) {
    throw new Error('Conteúdo SVG inválido ou sem elemento raiz <svg> após sanitização.');
  }

  return sanitized;
}
