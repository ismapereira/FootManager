import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import type { PatchBundleData } from '@footmanager/schemas';
import {
  assertSafeZipEntryPath,
  composeWorldFromPatches,
  resolvePatchConflicts,
  sanitizeSvgContent,
  unpackFmpackBuffer,
  validateUnpackedFmpack,
} from '@footmanager/patches';

const VALID_1X1_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const VALID_WEBP_HEADER = Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1');

function createZipBuffer(entries: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    zip.addFile(name, buf);
  }
  return zip.toBuffer();
}

describe('Sistema Seguro de Patches .fmpack (@footmanager/patches)', () => {
  it('bloqueia path traversal (Zip Slip real), extensões executáveis e sanitiza SVG malicioso', () => {
    // Constrói um ZIP malicioso real substituindo o nome no cabeçalho bruto para simular ataque Zip Slip
    const placeholderName = 'safe/evil01.json';
    const maliciousName = '../x/evil01.json'; // mesmo comprimento exato em bytes (16)
    const rawZip = createZipBuffer({
      [placeholderName]: '{}',
    });
    const patchedZip = Buffer.from(rawZip);
    let offset = patchedZip.indexOf(placeholderName);
    expect(offset).toBeGreaterThan(-1);
    while (offset !== -1) {
      patchedZip.write(maliciousName, offset, 'utf-8');
      offset = patchedZip.indexOf(placeholderName, offset + maliciousName.length);
    }
    expect(() => unpackFmpackBuffer(patchedZip)).toThrow(/path traversal/i);

    // Verifica casos adicionais de entrada maliciosa diretamente
    expect(() => assertSafeZipEntryPath('/etc/passwd.json')).toThrow(/path traversal/i);
    expect(() => assertSafeZipEntryPath('C:\\Windows\\evil.json')).toThrow(/path traversal/i);
    expect(() => assertSafeZipEntryPath('badges/a\0b.svg')).toThrow(/inválida/i);

    const jsPayloadZip = createZipBuffer({
      'manifest.json': '{}',
      'inject.js': 'alert(1)',
    });
    expect(() => unpackFmpackBuffer(jsPayloadZip)).toThrow(/Extensão não permitida/i);

    const dirtySvg = `<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
      <svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" viewBox="0 0 64 64">
        <script>fetch('https://evil.test')</script>
        <foreignObject><body>XSS</body></foreignObject>
        <a href="javascript:alert(2)"><circle cx="32" cy="32" r="24" fill="#C8102E" /></a>
      </svg>`;
    const cleanSvg = sanitizeSvgContent(dirtySvg);
    expect(cleanSvg).toContain('<circle');
    expect(cleanSvg).not.toMatch(/<script/i);
    expect(cleanSvg).not.toMatch(/onload/i);
    expect(cleanSvg).not.toMatch(/foreignObject/i);
    expect(cleanSvg).not.toMatch(/javascript:/i);
    expect(cleanSvg).not.toMatch(/<!DOCTYPE/i);
  });

  it('valida um pacote .fmpack de expansão real (EUA / MLS) com escudo SVG sanitizado', () => {
    const zipBuffer = createZipBuffer({
      'manifest.json': JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'community-usa-mls-2026',
        name: 'EUA — MLS & US Open Cup 2026',
        version: '1.0.0',
        author: 'Comunidade',
        type: 'expansion',
        requires: ['core >= 1.0.0'],
        countriesAdded: ['USA'],
        countriesModified: [],
        description: 'Expansão MLS 2026',
      }),
      'country.json': JSON.stringify({
        id: 'USA',
        name: 'Estados Unidos',
        confederation: 'CONCACAF',
        seasonCycle: 'calendar_year',
        currencyCode: 'USD',
        transferWindows: [{ label: 'Primary', startWeek: 5, endWeek: 16 }],
      }),
      'competitions.json': JSON.stringify([
        {
          id: 'usa_mls',
          countryId: 'USA',
          name: 'Major League Soccer',
          tier: 1,
          template: 'conferences_playoffs',
          seasonCycle: 'calendar_year',
          startWeek: 8,
          endWeek: 48,
          params: { conferences: ['EAST', 'WEST'] },
          continentalBinding: {
            confederation: 'CONCACAF',
            slots: [{ target: 'concacaf_champions', qualification: 'champion', count: 1 }],
          },
        },
      ]),
      'badges/usa_inter_miami.svg':
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><script>evil()</script><rect width="32" height="32" fill="#F472B6"/></svg>',
    });

    const unpacked = unpackFmpackBuffer(zipBuffer);
    const validation = validateUnpackedFmpack(unpacked);

    expect(validation.valid).toBe(true);
    expect(validation.bundle?.countries[0]?.id).toBe('USA');
    expect(validation.bundle?.competitions[0]?.template).toBe('conferences_playoffs');
    expect(validation.bundle?.badges['badges/usa_inter_miami.svg']).not.toContain('<script>');
  });

  it('resolve conflitos nas 3 camadas: Load Order (1), Deduplicação Canônica (2) e Bloqueio Estrutural (3)', () => {
    const core: PatchBundleData = {
      manifest: {
        schemaVersion: '1.0.0',
        id: 'core',
        name: 'Core',
        version: '1.0.0',
        author: 'Core',
        type: 'core',
        requires: [],
        countriesAdded: ['BRA'],
        countriesModified: [],
        description: '',
      },
      countries: [],
      competitions: [],
      stadiums: [],
      clubs: [],
      players: [
        {
          id: 'ply_bra_19970620_pedro',
          name: 'Pedro',
          nationality: 'BRA',
          birthDate: '1997-06-20',
          primaryPosition: 'ATA',
          overall: 83,
          potential: 84,
          isStar: true,
          traits: ['FINALIZACAO'],
          energy: 100,
          morale: 4,
          clubId: 'bra_flamengo',
          contractEndSeason: 2027,
          contractEndCycle: 'calendar_year',
          weeklySalary: 250000,
          marketValue: 100000000,
          releaseClause: 300000000,
          injuryWeeks: 0,
          yellowCardsAccumulated: 0,
          suspensionMatches: 0,
        },
      ],
      badges: {},
    };

    // Patch 1: mesmo atleta sob ID diferente porém mesma chave canônica, em outro clube (Camada 2)
    const transferPatch: PatchBundleData = {
      manifest: {
        schemaVersion: '1.0.0',
        id: 'patch-transfer-eu',
        name: 'Transferências Europa',
        version: '1.0.0',
        author: 'User',
        type: 'update',
        requires: ['core >= 1.0.0'],
        countriesAdded: [],
        countriesModified: ['BRA'],
        description: '',
      },
      countries: [],
      competitions: [
        {
          id: 'custom_cup',
          countryId: 'BRA',
          name: 'Copa Custom',
          tier: 0,
          template: 'knockout',
          seasonCycle: 'calendar_year',
          startWeek: 10,
          endWeek: 20,
          optional: false,
          reputation: 70,
          params: {},
        },
      ],
      stadiums: [],
      clubs: [],
      players: [
        {
          id: 'ply_custom_pedro_eu',
          name: '  Pédro  ', // Acento/espaço diferente -> mesma chave canônica!
          nationality: 'BRA',
          birthDate: '1997-06-20',
          primaryPosition: 'ATA',
          overall: 85,
          potential: 85,
          isStar: true,
          traits: ['FINALIZACAO'],
          energy: 100,
          morale: 4,
          clubId: 'esp_real_madrid',
          contractEndSeason: 2029,
          contractEndCycle: 'split_year',
          weeklySalary: 400000,
          marketValue: 130000000,
          releaseClause: 500000000,
          injuryWeeks: 0,
          yellowCardsAccumulated: 0,
          suspensionMatches: 0,
        },
      ],
      badges: {},
    };

    const composed = composeWorldFromPatches(core, [transferPatch]);
    expect(composed.hasBlockingConflicts).toBe(false);
    // Deduplicação da Camada 2: jogador existe apenas 1 vez, exclusivamente no clube de maior prioridade
    expect(composed.players).toHaveLength(1);
    expect(composed.players[0]?.clubId).toBe('esp_real_madrid');
    expect(composed.conflicts.some((c) => c.layer === 2 && c.severity === 'auto_resolved')).toBe(
      true,
    );

    // Patch 2: conflito estrutural na mesma competição + dependência ausente (Camada 3 bloqueante)
    const conflictingPatch: PatchBundleData = {
      ...transferPatch,
      manifest: {
        ...transferPatch.manifest,
        id: 'patch-conflitante',
        requires: ['pacote-inexistente >= 1.0.0'],
      },
      competitions: [
        {
          id: 'custom_cup',
          countryId: 'BRA',
          name: 'Copa Custom Pontos Corridos',
          tier: 0,
          template: 'round_robin', // Incompatível com knockout!
          seasonCycle: 'calendar_year',
          startWeek: 10,
          endWeek: 20,
          optional: false,
          reputation: 70,
          params: {},
        },
      ],
      players: [],
    };

    const blocked = resolvePatchConflicts([
      { priority: 0, bundle: core },
      { priority: 1, bundle: transferPatch },
      { priority: 2, bundle: conflictingPatch },
    ]);
    expect(blocked.hasBlockingConflicts).toBe(true);
    expect(blocked.conflicts.some((c) => c.code === 'MISSING_DEPENDENCY')).toBe(true);
    expect(blocked.conflicts.some((c) => c.code === 'STRUCTURAL_COMPETITION_CONFLICT')).toBe(true);
  });

  it('neutraliza vetores avançados de XSS em SVG preservando elementos geométricos e gradientes locais', () => {
    const xssPayloads = [
      '<svg/onload=alert(1)></svg>',
      '<svg><sc<iframe/>ript>alert(1)</script></svg>',
      '<svg><scr<script></script>ipt>alert(1)</script></svg>',
      '<svg><script >alert(1)</script ></svg>',
      '<svg><a href="&#106;avascript:alert(1)"><text>x</text></a></svg>',
      '<svg><a href=javascript:alert(1)><text>x</text></a></svg>',
      '<svg><set attributeName="onmouseover" to="alert(1)"/></svg>',
      '<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>',
      '<svg><use href="//evil.com/x.svg#a"/></svg>',
      '<svg><image href="https://evil.com/track.png"/></svg>',
      '<svg style="background:url(https://evil.com/x)"><rect width="10" height="10"/></svg>',
    ];

    for (const payload of xssPayloads) {
      const cleaned = sanitizeSvgContent(payload);
      expect(cleaned).not.toMatch(/<script/i);
      expect(cleaned).not.toMatch(/onload|onmouseover/i);
      expect(cleaned).not.toMatch(/javascript:|https?:|\/\/evil/i);
      expect(cleaned).not.toMatch(/<set\b|<animate|<use\b|<image\b|<iframe/i);
    }

    const validGradientSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g1"><stop offset="0%" stop-color="#C8102E"/></linearGradient></defs><circle cx="32" cy="32" r="24" fill="url(#g1)"/></svg>';
    const preserved = sanitizeSvgContent(validGradientSvg);
    expect(preserved).toContain('<linearGradient id="g1">');
    expect(preserved).toContain('fill="url(#g1)"');
  });

  it('bloqueia symlink UNIX, ZIP bomb com cabeçalho falsificado, escudo > 256 KB, PNG falso e entrada duplicada', () => {
    // 1. Symlink UNIX real (externalFileAttributes = 0o120777 << 16 no diretório central do ZIP)
    const symlinkZip = new AdmZip();
    symlinkZip.addFile('badges/link.svg', Buffer.from('/etc/passwd'));
    const symlinkEntry = symlinkZip.getEntries()[0];
    expect(symlinkEntry).toBeDefined();
    if (symlinkEntry) {
      symlinkEntry.header.attr = (0o120777 << 16) >>> 0;
    }
    expect(() => unpackFmpackBuffer(symlinkZip.toBuffer())).toThrow(/Symlink bloqueado/i);

    // 2. ZIP bomb real (stream deflate de 55 MB cujo header.size é falsificado para 16 bytes)
    const giantPayload = Buffer.alloc(55 * 1024 * 1024, 0x20); // comprime para ~55 KB!
    const deflatedGiant = zlib.deflateRawSync(giantPayload);
    expect(deflatedGiant.byteLength).toBeLessThan(200 * 1024);
    const bombZip = new AdmZip();
    bombZip.addFile('huge.json', giantPayload);
    const bombBuf = Buffer.from(bombZip.toBuffer());
    // Falsifica o campo uncompressedSize (55 MB = 0x03700000) em ambos os cabeçalhos para 16 bytes
    const realSizeBytes = Buffer.alloc(4);
    realSizeBytes.writeUInt32LE(giantPayload.byteLength, 0);
    let pos = bombBuf.indexOf(realSizeBytes);
    expect(pos).toBeGreaterThan(-1);
    while (pos !== -1) {
      bombBuf.writeUInt32LE(16, pos);
      pos = bombBuf.indexOf(realSizeBytes, pos + 4);
    }
    expect(() => unpackFmpackBuffer(bombBuf)).toThrow(/50 MB/i);

    // 3. Escudo acima de 256 KB
    const bigBadge = Buffer.concat([VALID_1X1_PNG, Buffer.alloc(260 * 1024, 0)]);
    const bigBadgeZip = createZipBuffer({ 'manifest.json': '{}', 'badges/big.png': bigBadge });
    expect(() => unpackFmpackBuffer(bigBadgeZip)).toThrow(/256 KB/i);

    // 4. PNG falso (poliglota HTML disfarçado de .png) vs PNG/WebP válidos
    const fakePngZip = createZipBuffer({
      'manifest.json': '{}',
      'badges/evil.png': '<html><script>alert(1)</script></html>',
    });
    expect(() => unpackFmpackBuffer(fakePngZip)).toThrow(/PNG inválido/i);

    const validImagesZip = createZipBuffer({
      'manifest.json': '{}',
      'badges/ok.png': VALID_1X1_PNG,
      'badges/ok.webp': VALID_WEBP_HEADER,
    });
    const unpackedImgs = unpackFmpackBuffer(validImagesZip);
    expect(unpackedImgs.badges['badges/ok.png']).toMatch(/^data:image\/png;base64,/);
    expect(unpackedImgs.badges['badges/ok.webp']).toMatch(/^data:image\/webp;base64,/);

    // 5. Entrada duplicada no mesmo pacote: bruta (bloqueada pelo parser) e normalizada `./` (bloqueada pelo seenPaths)
    const dupZip = createZipBuffer({
      'data/a1.json': '{"v":1}',
      'data/a2.json': '{"v":2}',
    });
    const dupBuf = Buffer.from(dupZip);
    let dupPos = dupBuf.indexOf('data/a2.json');
    expect(dupPos).toBeGreaterThan(-1);
    while (dupPos !== -1) {
      dupBuf.write('data/a1.json', dupPos, 'utf-8');
      dupPos = dupBuf.indexOf('data/a2.json', dupPos + 12);
    }
    expect(() => unpackFmpackBuffer(dupBuf)).toThrow(/Duplicate entry|Entrada duplicada/i);

    // Cria ZIP real contendo `data/a1.json` e `data/./a1.json` (nomes brutos distintos que colidem após normalização)
    const aliasZip = createZipBuffer({
      'data/a1.json': '{"v":1}',
      'data/x/a1.json': '{"v":2}',
    });
    const aliasBuf = Buffer.from(aliasZip);
    let aliasPos = aliasBuf.indexOf('data/x/a1.json');
    expect(aliasPos).toBeGreaterThan(-1);
    while (aliasPos !== -1) {
      aliasBuf.write('data/./a1.json', aliasPos, 'utf-8');
      aliasPos = aliasBuf.indexOf('data/x/a1.json', aliasPos + 14);
    }
    expect(() => unpackFmpackBuffer(aliasBuf)).toThrow(/Entrada duplicada bloqueada/i);
  });

  it('alerta elenco vazio em expansão, bloqueia calendário inviável e bloqueia conflito estrutural de país (Camada 3)', () => {
    // Expansão com clube jogável e 0 jogadores deve emitir avisos de elenco mínimo
    const emptySquadZip = createZipBuffer({
      'manifest.json': JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'exp-no-players',
        name: 'Exp Sem Jogadores',
        version: '1.0.0',
        author: 'Comunidade',
        type: 'expansion',
        requires: [],
        countriesAdded: ['USA'],
        countriesModified: [],
        description: '',
      }),
      'clubs.json': JSON.stringify([
        {
          id: 'usa_miami',
          countryId: 'USA',
          name: 'Inter Miami',
          shortName: 'MIA',
          primaryColor: '#F472B6',
          secondaryColor: '#111111',
          stadiumId: 'std_miami',
          reputation: 78,
          governance: 'saf',
          cashBalance: 50000000,
          isPlayable: true,
        },
      ]),
      'competitions.json': JSON.stringify([
        {
          id: 'usa_impossible_league',
          countryId: 'USA',
          name: 'Liga Inviável',
          tier: 1,
          template: 'round_robin',
          seasonCycle: 'calendar_year',
          startWeek: 10,
          endWeek: 14, // apenas 5 semanas para 38 rodadas!
          params: { clubCount: 20, legs: 2 },
        },
      ]),
    });

    const validation = validateUnpackedFmpack(unpackFmpackBuffer(emptySquadZip));
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => /usa_impossible_league/.test(e))).toBe(true);
    expect(validation.warnings.some((w) => /0 jogadores/.test(w))).toBe(true);
    expect(validation.warnings.some((w) => /0 goleiro/.test(w))).toBe(true);

    // Conflito estrutural de país entre dois patches comunitários (Camada 3 bloqueante)
    const makeCountryPatch = (
      id: string,
      confederation: 'CONCACAF' | 'UEFA',
      seasonCycle: 'calendar_year' | 'split_year',
    ): PatchBundleData => ({
      manifest: {
        schemaVersion: '1.0.0',
        id,
        name: id,
        version: '1.0.0',
        author: 'User',
        type: 'expansion',
        requires: [],
        countriesAdded: ['USA'],
        countriesModified: [],
        description: '',
      },
      countries: [
        {
          id: 'USA',
          name: 'Estados Unidos',
          confederation,
          seasonCycle,
          currencyCode: 'USD',
          transferWindows: [{ label: 'W1', startWeek: 1, endWeek: 10 }],
          isPlayable: true,
          fifaRankingPoints: 1650,
        },
      ],
      competitions: [],
      stadiums: [],
      clubs: [],
      players: [],
      badges: {},
    });

    const resolvedCountryConflict = resolvePatchConflicts([
      { priority: 1, bundle: makeCountryPatch('patch-usa-a', 'CONCACAF', 'calendar_year') },
      { priority: 2, bundle: makeCountryPatch('patch-usa-b', 'UEFA', 'split_year') },
    ]);
    expect(resolvedCountryConflict.hasBlockingConflicts).toBe(true);
    expect(
      resolvedCountryConflict.conflicts.some(
        (c) => c.layer === 3 && c.code === 'STRUCTURAL_COUNTRY_CONFLICT',
      ),
    ).toBe(true);
  });

  it('preserva campos opcionais no merge Camada 1 quando patch traz undefined, permitindo sobrescrita explícita por null', () => {
    const baseBundle: PatchBundleData = {
      manifest: {
        schemaVersion: '1.0.0',
        id: 'core',
        name: 'Core',
        version: '1.0.0',
        author: 'Core',
        type: 'core',
        requires: [],
        countriesAdded: ['BRA'],
        countriesModified: [],
        description: '',
      },
      countries: [],
      competitions: [
        {
          id: 'bra_serie_a',
          countryId: 'BRA',
          name: 'Brasileirão Série A',
          shortName: 'BRA A',
          tier: 1,
          template: 'round_robin',
          seasonCycle: 'calendar_year',
          startWeek: 14,
          endWeek: 48,
          optional: false,
          reputation: 84,
          params: { clubCount: 20, legs: 2, relegationCount: 4 },
        },
      ],
      stadiums: [
        {
          id: 'std_maracana',
          name: 'Maracanã',
          city: 'Rio de Janeiro',
          countryId: 'BRA',
          capacity: 78838,
          expansionMaxCapacity: 82000,
          maintenanceCostWeekly: 45000,
        },
      ],
      clubs: [
        {
          id: 'bra_flamengo',
          countryId: 'BRA',
          stateCode: 'RJ',
          name: 'CR Flamengo',
          shortName: 'FLA',
          primaryColor: '#C8102E',
          secondaryColor: '#111111',
          badgePath: 'badges/bra_flamengo.svg',
          stadiumId: 'std_maracana',
          reputation: 88,
          governance: 'associative',
          investorTier: 0,
          cashBalance: 120000000,
          youthAcademyLevel: 5,
          isPlayable: true,
        },
      ],
      players: [
        {
          id: 'ply_bra_19960103_leo_ortiz',
          name: 'Léo Ortiz',
          nationality: 'BRA',
          birthDate: '1996-01-03',
          primaryPosition: 'ZAG',
          secondaryPosition: 'VOL',
          overall: 81,
          potential: 82,
          isStar: false,
          traits: ['PASSE', 'DESARME'],
          energy: 100,
          morale: 4,
          clubId: 'bra_flamengo',
          loanFromClubId: 'bra_bragantino',
          loanBuyOptionValue: 20000000,
          contractEndSeason: 2028,
          contractEndCycle: 'calendar_year',
          weeklySalary: 140000,
          marketValue: 45000000,
          releaseClause: 150000000,
          injuryWeeks: 0,
          yellowCardsAccumulated: 0,
          suspensionMatches: 0,
        },
      ],
      badges: {},
    };

    const updatePatch: PatchBundleData = {
      manifest: {
        schemaVersion: '1.0.0',
        id: 'patch-ratings-2026',
        name: 'Atualização de Forças',
        version: '1.0.0',
        author: 'Comunidade',
        type: 'update',
        requires: ['core >= 1.0.0'],
        countriesAdded: [],
        countriesModified: ['BRA'],
        description: '',
      },
      countries: [],
      competitions: [
        {
          id: 'bra_serie_a',
          countryId: 'BRA',
          name: 'Série A Betano 2026',
          shortName: undefined,
          tier: 1,
          template: 'round_robin',
          seasonCycle: 'calendar_year',
          startWeek: 14,
          endWeek: 48,
          optional: false,
          reputation: 86,
          params: { clubCount: 20, legs: undefined },
        },
      ],
      stadiums: [
        {
          id: 'std_maracana',
          name: 'Estádio do Maracanã',
          city: 'Rio de Janeiro',
          countryId: 'BRA',
          capacity: 78838,
          expansionMaxCapacity: undefined,
          maintenanceCostWeekly: 45000,
        },
      ],
      clubs: [
        {
          id: 'bra_flamengo',
          countryId: 'BRA',
          stateCode: undefined,
          name: 'Clube de Regatas do Flamengo',
          shortName: 'FLA',
          primaryColor: '#C8102E',
          secondaryColor: '#111111',
          badgePath: undefined,
          stadiumId: 'std_maracana',
          reputation: 90,
          governance: 'associative',
          investorTier: 0,
          cashBalance: 130000000,
          youthAcademyLevel: 5,
          isPlayable: true,
        },
      ],
      players: [
        {
          id: 'ply_bra_19960103_leo_ortiz',
          name: 'Léo Ortiz',
          nationality: 'BRA',
          birthDate: '1996-01-03',
          primaryPosition: 'ZAG',
          secondaryPosition: undefined,
          overall: 83,
          potential: 84,
          isStar: true,
          traits: ['PASSE', 'DESARME'],
          energy: 100,
          morale: 5,
          clubId: null, // null explícito deve liberar o atleta para agente livre!
          loanFromClubId: null, // null explícito deve encerrar o vínculo de empréstimo!
          loanBuyOptionValue: undefined, // undefined deve preservar valor anterior
          contractEndSeason: 2028,
          contractEndCycle: 'calendar_year',
          weeklySalary: 160000,
          marketValue: 55000000,
          releaseClause: 180000000,
          injuryWeeks: 0,
          yellowCardsAccumulated: 0,
          suspensionMatches: 0,
        },
      ],
      badges: {},
    };

    const composed = composeWorldFromPatches(baseBundle, [updatePatch]);
    expect(composed.hasBlockingConflicts).toBe(false);

    // Clube preserva stateCode e badgePath enquanto atualiza nome e reputação
    const mergedClub = composed.clubs[0];
    expect(mergedClub?.name).toBe('Clube de Regatas do Flamengo');
    expect(mergedClub?.reputation).toBe(90);
    expect(mergedClub?.stateCode).toBe('RJ');
    expect(mergedClub?.badgePath).toBe('badges/bra_flamengo.svg');

    // Estádio e competição preservam campos opcionais e params existentes
    expect(composed.stadiums[0]?.expansionMaxCapacity).toBe(82000);
    expect(composed.competitions[0]?.shortName).toBe('BRA A');
    expect(composed.competitions[0]?.params['legs']).toBe(2);
    expect(composed.competitions[0]?.params['relegationCount']).toBe(4);

    // Jogador preserva secondaryPosition e loanBuyOptionValue (undefined no patch),
    // mas acata `null` explícito em clubId e loanFromClubId
    const mergedPlayer = composed.players[0];
    expect(mergedPlayer?.overall).toBe(83);
    expect(mergedPlayer?.secondaryPosition).toBe('VOL');
    expect(mergedPlayer?.loanBuyOptionValue).toBe(20000000);
    expect(mergedPlayer?.clubId).toBeNull();
    expect(mergedPlayer?.loanFromClubId).toBeNull();
  });

  it('remove duplicado órfão na Camada 2 quando atualização por ID existente colide com chave canônica de outro jogador', () => {
    const makePlayer = (
      id: string,
      name: string,
      birthDate: string,
      clubId: string | null,
      overall = 80,
    ) => ({
      id,
      name,
      nationality: 'BRA',
      birthDate,
      primaryPosition: 'ATA' as const,
      overall,
      potential: 84,
      isStar: false,
      traits: ['FINALIZACAO' as const],
      energy: 100,
      morale: 4 as const,
      clubId,
      contractEndSeason: 2028,
      contractEndCycle: 'calendar_year' as const,
      weeklySalary: 100000,
      marketValue: 30000000,
      releaseClause: 90000000,
      injuryWeeks: 0,
      yellowCardsAccumulated: 0,
      suspensionMatches: 0,
    });

    const coreBundle: PatchBundleData = {
      manifest: {
        schemaVersion: '1.0.0',
        id: 'core',
        name: 'Core',
        version: '1.0.0',
        author: 'Core',
        type: 'core',
        requires: [],
        countriesAdded: ['BRA'],
        countriesModified: [],
        description: '',
      },
      countries: [],
      competitions: [],
      stadiums: [],
      clubs: [],
      players: [
        makePlayer('ply_a', 'João Silva', '1998-01-10', 'bra_flamengo', 78),
        makePlayer('ply_b', 'Pedro Costa', '1999-05-20', 'bra_palmeiras', 82),
      ],
      badges: {},
    };

    // Patch atualiza o ID `ply_a` alterando nome/data para coincidir com a chave canônica de `ply_b`
    const collidingPatch: PatchBundleData = {
      manifest: {
        schemaVersion: '1.0.0',
        id: 'patch-rename-collision',
        name: 'Correção de Identidade',
        version: '1.0.0',
        author: 'Comunidade',
        type: 'update',
        requires: ['core >= 1.0.0'],
        countriesAdded: [],
        countriesModified: ['BRA'],
        description: '',
      },
      countries: [],
      competitions: [],
      stadiums: [],
      clubs: [],
      players: [makePlayer('ply_a', '  Pédro Cósta ', '1999-05-20', 'esp_real_madrid', 85)],
      badges: {},
    };

    const resolved = composeWorldFromPatches(coreBundle, [collidingPatch]);
    expect(resolved.hasBlockingConflicts).toBe(false);
    // Deve restar exatamente 1 atleta — `ply_b` não pode ficar órfão no resultado!
    expect(resolved.players).toHaveLength(1);
    expect(resolved.players[0]?.id).toBe('ply_a');
    expect(resolved.players[0]?.clubId).toBe('esp_real_madrid');
    expect(resolved.players[0]?.overall).toBe(85);
    expect(
      resolved.conflicts.some(
        (c) => c.layer === 2 && c.severity === 'auto_resolved' && c.entityId === 'ply_a',
      ),
    ).toBe(true);

    // Também testa colisão no mesmo clube de `ply_b` (garantindo remoção do órfão mesmo sem mudança de clube)
    const sameClubCollisionPatch: PatchBundleData = {
      ...collidingPatch,
      players: [makePlayer('ply_a', 'Pedro Costa', '1999-05-20', 'bra_palmeiras', 84)],
    };
    const resolvedSameClub = composeWorldFromPatches(coreBundle, [sameClubCollisionPatch]);
    expect(resolvedSameClub.players).toHaveLength(1);
    expect(resolvedSameClub.players[0]?.id).toBe('ply_a');
    expect(resolvedSameClub.players[0]?.clubId).toBe('bra_palmeiras');
  });
});
