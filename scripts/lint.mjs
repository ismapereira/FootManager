import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** Limite padrão de linhas por função conforme Seção 11.2 do planejamento. */
export const MAX_FUNCTION_LINES = 50;

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'dist-electron', '.git', 'coverage']);
const SQL_METHODS = new Set(['prepare', 'exec', 'pragma']);
const SQL_KEYWORD_REGEX = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|PRAGMA)\b/i;
const FORBIDDEN_DOM_PROPS = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'dangerouslySetInnerHTML']);
const FORBIDDEN_ENGINE_GLOBALS = new Set([
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'process',
  'Buffer',
  'require',
  '__dirname',
  '__filename',
]);
const UNUSED_DIAGNOSTIC_CODES = new Set([6133, 6138, 6192, 6196, 6198, 6199]);

/**
 * Coleta recursivamente arquivos `.ts`, `.tsx` e `.mjs` ignorando diretórios de build/dependências.
 */
function collectSourceFiles(rootDir, relativeDirs) {
  const results = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  };
  for (const rel of relativeDirs) {
    walk(path.join(rootDir, rel));
  }
  return results;
}

/**
 * Formata uma violação de lint com caminho relativo, linha, regra e mensagem legível.
 */
function createIssue(filePath, line, rule, message) {
  return { file: filePath.replace(/\\/g, '/'), line, rule, message };
}

/**
 * Retorna a linha 1-indexed de um nó AST no arquivo analisado.
 */
function getNodeLine(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/**
 * Verifica se o texto da expressão contém concatenação dinâmica de strings (`+` ou template `${}`).
 */
function containsDynamicStringInterpolation(node) {
  if (ts.isTemplateExpression(node)) return true;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return true;
  }
  return false;
}

/**
 * Coleta todas as faixas de comentário reais usando os limites de token da AST TypeScript
 * (imune a falsos positivos em strings, genéricos `<T>` e expressões regulares).
 */
function inspectRealComments(sf, sourceText, relPath, issues) {
  const seenPos = new Set();
  const inspectRange = (range) => {
    if (seenPos.has(range.pos)) return;
    seenPos.add(range.pos);
    const commentText = sourceText.slice(range.pos, range.end);
    if (/@ts-(ignore|nocheck)\b/.test(commentText)) {
      const line = sf.getLineAndCharacterOfPosition(range.pos).line + 1;
      issues.push(
        createIssue(relPath, line, 'hygiene/no-ts-suppression', 'Diretiva de supressão TS proibida.'),
      );
    }
  };

  const visit = (node) => {
    for (const r of ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? []) inspectRange(r);
    for (const r of ts.getTrailingCommentRanges(sourceText, node.getEnd()) ?? []) inspectRange(r);
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (/\.tsx?$/.test(relPath) && seenPos.size === 0) {
    issues.push(
      createIssue(relPath, 1, 'hygiene/missing-comment', 'Arquivo sem comentário explicativo em pt-BR.'),
    );
  }
}

/**
 * Verifica higiene de código: ausência de `debugger`, `any` explícito, supressões TS e comentários pt-BR.
 */
function checkCodeHygiene(sf, sourceText, relPath, issues) {
  inspectRealComments(sf, sourceText, relPath, issues);

  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.DebuggerStatement) {
      issues.push(createIssue(relPath, getNodeLine(sf, node), 'hygiene/no-debugger', 'Instrução debugger proibida.'));
    }
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      issues.push(createIssue(relPath, getNodeLine(sf, node), 'hygiene/no-explicit-any', 'Uso de `any` explícito proibido.'));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/**
 * Verifica regras de segurança em chamadas (`eval`, `Function`, `document.write`, SQL dinâmico e `exec`).
 */
function checkCallSecurity(sf, node, relPath, issues) {
  const expr = node.expression;
  const line = getNodeLine(sf, node);

  if (ts.isIdentifier(expr) && (expr.text === 'eval' || expr.text === 'Function')) {
    issues.push(createIssue(relPath, line, 'security/no-eval', `Chamada dinâmica proibida: ${expr.text}().`));
  }

  if (ts.isPropertyAccessExpression(expr)) {
    const methodName = expr.name.text;
    const objText = expr.expression.getText(sf);

    if (objText === 'document' && methodName === 'write') {
      issues.push(createIssue(relPath, line, 'security/no-document-write', 'document.write() proibido.'));
    }
    if (methodName === 'insertAdjacentHTML') {
      issues.push(createIssue(relPath, line, 'security/no-dom-xss', 'insertAdjacentHTML() proibido.'));
    }
    if (SQL_METHODS.has(methodName) && node.arguments[0] && containsDynamicStringInterpolation(node.arguments[0])) {
      issues.push(
        createIssue(relPath, line, 'security/no-sql-interpolation', `Interpolação SQL proibida em .${methodName}().`),
      );
    }
  }
}

/**
 * Verifica propriedades de objetos perigosas (`shell: true`, flags inseguras do Electron).
 */
function checkPropertySecurity(sf, node, relPath, issues) {
  const propName = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : '';
  const line = getNodeLine(sf, node);
  const initKind = node.initializer.kind;

  if (propName === 'shell' && initKind === ts.SyntaxKind.TrueKeyword) {
    issues.push(createIssue(relPath, line, 'security/no-shell-true', 'Uso de `shell: true` proibido (Seção 11.1).'));
  }

  if (relPath.startsWith('apps/desktop/electron/')) {
    const insecureElectronFlags =
      (propName === 'nodeIntegration' && initKind === ts.SyntaxKind.TrueKeyword) ||
      (propName === 'contextIsolation' && initKind === ts.SyntaxKind.FalseKeyword) ||
      (propName === 'sandbox' && initKind === ts.SyntaxKind.FalseKeyword) ||
      (propName === 'webSecurity' && initKind === ts.SyntaxKind.FalseKeyword) ||
      (propName === 'allowRunningInsecureContent' && initKind === ts.SyntaxKind.TrueKeyword);
    if (insecureElectronFlags) {
      issues.push(
        createIssue(relPath, line, 'security/electron-hardening', `Configuração Electron insegura: ${propName}.`),
      );
    }
  }
}

/**
 * Verifica vetores XSS, `eval`, `new Function`, `shell: true`, `child_process.exec` e interpolação SQL via AST.
 */
function checkSecurityRules(sf, relPath, issues) {
  const isStorageFile = relPath.startsWith('packages/storage/');

  const visit = (node) => {
    const line = getNodeLine(sf, node);

    if (ts.isJsxAttribute(node) && node.name.getText(sf) === 'dangerouslySetInnerHTML') {
      issues.push(createIssue(relPath, line, 'security/no-dangerously-set-html', 'dangerouslySetInnerHTML proibido.'));
    }
    if (ts.isPropertyAccessExpression(node) && FORBIDDEN_DOM_PROPS.has(node.name.text)) {
      issues.push(createIssue(relPath, line, 'security/no-dom-xss', `Acesso inseguro a .${node.name.text} proibido.`));
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') {
      issues.push(createIssue(relPath, line, 'security/no-eval', 'Uso de `new Function()` proibido.'));
    }
    if (ts.isCallExpression(node)) {
      checkCallSecurity(sf, node, relPath, issues);
    }
    if (ts.isPropertyAssignment(node)) {
      checkPropertySecurity(sf, node, relPath, issues);
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const mod = node.moduleSpecifier.text;
      if ((mod === 'child_process' || mod === 'node:child_process') && node.importClause?.namedBindings) {
        const text = node.importClause.namedBindings.getText(sf);
        if (/\b(exec|execSync)\b/.test(text)) {
          issues.push(createIssue(relPath, line, 'security/no-child-exec', 'Prefira spawn/execFile sem shell ao invés de exec/execSync.'));
        }
      }
    }
    if (isStorageFile && containsDynamicStringInterpolation(node) && SQL_KEYWORD_REGEX.test(node.getText(sf))) {
      issues.push(createIssue(relPath, line, 'security/no-sql-interpolation', 'Interpolação de string SQL detectada em packages/storage.'));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/**
 * Verifica se um especificador de importação é permitido dentro do motor puro `packages/engine/src/`.
 */
function isAllowedEngineImport(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier === '@footmanager/schemas';
}

/**
 * Verifica se um nome de identificador está vinculado localmente (parâmetro ou variável em escopo ancestral).
 */
function isBoundInAncestorScope(identifier) {
  const targetName = identifier.text;
  let current = identifier.parent;

  while (current) {
    if (ts.isFunctionLike(current) && current.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === targetName)) {
      return true;
    }
    if (ts.isBlock(current) || ts.isSourceFile(current)) {
      for (const stmt of current.statements) {
        if (ts.isVariableStatement(stmt)) {
          const found = stmt.declarationList.declarations.some(
            (decl) => ts.isIdentifier(decl.name) && decl.name.text === targetName,
          );
          if (found) return true;
        }
      }
    }
    if ((ts.isForOfStatement(current) || ts.isForInStatement(current)) && ts.isVariableDeclarationList(current.initializer)) {
      const found = current.initializer.declarations.some(
        (decl) => ts.isIdentifier(decl.name) && decl.name.text === targetName,
      );
      if (found) return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Verifica se um identificador livre é um uso real de global (não propriedade, declaração, tipo ou variável local).
 */
function isFreeGlobalReference(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isPropertySignature(parent) && parent.name === node) return false;
  if (ts.isParameter(parent) && parent.name === node) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isTypeReferenceNode(parent)) return false;
  return !isBoundInAncestorScope(node);
}

/**
 * Garante pureza absoluta de `packages/engine/src/` (sem React, Electron, DOM, SQLite ou APIs Node).
 */
function checkEnginePurity(sf, relPath, issues) {
  if (!relPath.startsWith('packages/engine/src/')) return;

  const visit = (node) => {
    const line = getNodeLine(sf, node);
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (!isAllowedEngineImport(spec)) {
        issues.push(createIssue(relPath, line, 'purity/engine-import', `Importação impura em packages/engine: "${spec}".`));
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      const spec = arg && ts.isStringLiteral(arg) ? arg.text : '<dinâmico>';
      if (!isAllowedEngineImport(spec)) {
        issues.push(createIssue(relPath, line, 'purity/engine-import', `Import dinâmico impuro em packages/engine: "${spec}".`));
      }
    }
    if (ts.isIdentifier(node) && FORBIDDEN_ENGINE_GLOBALS.has(node.text) && isFreeGlobalReference(node)) {
      issues.push(createIssue(relPath, line, 'purity/engine-global', `Global impuro "${node.text}" proibido em packages/engine.`));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/**
 * Extrai nome legível de uma função/método/arrow para mensagens de diagnóstico de modularidade.
 */
function resolveFunctionName(sf, node) {
  if (node.name) return node.name.getText(sf);
  if (ts.isVariableDeclaration(node.parent) && node.parent.name) return node.parent.name.getText(sf);
  if (ts.isPropertyAssignment(node.parent) && node.parent.name) return node.parent.name.getText(sf);
  return '(anônima)';
}

/**
 * Verifica modularidade: nenhuma função acima de `MAX_FUNCTION_LINES` sem justificativa explícita (Seção 11.2).
 */
function checkModularity(sf, sourceText, relPath, issues) {
  const lines = sourceText.split(/\r?\n/);

  const visit = (node) => {
    const isFn =
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node);

    if (isFn) {
      const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      const length = endLine - startLine + 1;

      if (length > MAX_FUNCTION_LINES) {
        const prevLine = lines[startLine - 2] ?? '';
        const hasJustification = /lint-justify-length:\s*\S+/.test(prevLine);
        if (!hasJustification) {
          const fnName = resolveFunctionName(sf, node);
          issues.push(
            createIssue(
              relPath,
              startLine,
              'modularity/max-lines',
              `Função "${fnName}" possui ${length} linhas (limite: ${MAX_FUNCTION_LINES}; Seção 11.2).`,
            ),
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/**
 * Analisa um único arquivo em memória — exportada para permitir testes unitários diretos das regras do linter.
 */
export function lintSourceText(sourceText, relPath, options = { checkSecurity: true }) {
  const normalizedRel = relPath.replace(/\\/g, '/');
  const scriptKind = normalizedRel.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : normalizedRel.endsWith('.mjs')
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(normalizedRel, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const issues = [];

  checkCodeHygiene(sf, sourceText, normalizedRel, issues);
  if (options.checkSecurity !== false) {
    checkSecurityRules(sf, normalizedRel, issues);
  }
  checkEnginePurity(sf, normalizedRel, issues);
  checkModularity(sf, sourceText, normalizedRel, issues);

  return issues;
}

/**
 * Confirma que `tsconfig.base.json` mantém `strict`, `noUnusedLocals` e `noUnusedParameters` ativados.
 */
function checkTsConfigFlags(rootDir, issues) {
  const basePath = path.join(rootDir, 'tsconfig.base.json');
  const parsed = ts.readConfigFile(basePath, ts.sys.readFile);
  if (parsed.error) {
    issues.push(createIssue('tsconfig.base.json', 1, 'ts/config', 'Não foi possível ler tsconfig.base.json.'));
    return;
  }
  const compilerOptions = parsed.config?.compilerOptions ?? {};
  for (const flag of ['strict', 'noUnusedLocals', 'noUnusedParameters']) {
    if (compilerOptions[flag] !== true) {
      issues.push(
        createIssue('tsconfig.base.json', 1, 'ts/config', `Flag obrigatória "${flag}: true" ausente em tsconfig.base.json.`),
      );
    }
  }
}

/**
 * Cria um CompilerHost com cache compartilhado de SourceFiles (`.d.ts` e fontes) para acelerar a análise.
 */
function createCachedHost(options, sourceFileCache) {
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNew) => {
    const key = path.resolve(fileName);
    if (!shouldCreateNew && sourceFileCache.has(key)) {
      return sourceFileCache.get(key);
    }
    const sf = originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNew);
    if (sf) sourceFileCache.set(key, sf);
    return sf;
  };
  return host;
}

/**
 * Executa verificação em memória de variáveis/parâmetros não utilizados via compilador TypeScript.
 */
function checkUnusedSymbolsInProject(rootDir, tsconfigRelPath, sourceFileCache, issues) {
  const configPath = path.join(rootDir, tsconfigRelPath);
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) return;

  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, path.dirname(configPath));
  const workspacePaths = {
    '@footmanager/schemas': [path.join(rootDir, 'packages/schemas/src/index.ts')],
    '@footmanager/engine': [path.join(rootDir, 'packages/engine/src/index.ts')],
    '@footmanager/patches': [path.join(rootDir, 'packages/patches/src/index.ts')],
    '@footmanager/storage': [path.join(rootDir, 'packages/storage/src/index.ts')],
    '@footmanager/importer': [path.join(rootDir, 'tools/importer/src/index.ts')],
  };
  const compilerOptions = {
    ...parsed.options,
    noEmit: true,
    composite: false,
    noUnusedLocals: true,
    noUnusedParameters: true,
    paths: { ...(parsed.options.paths ?? {}), ...workspacePaths },
  };

  const host = createCachedHost(compilerOptions, sourceFileCache);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: compilerOptions, host });

  for (const diag of ts.getPreEmitDiagnostics(program)) {
    if (!UNUSED_DIAGNOSTIC_CODES.has(diag.code) || !diag.file) continue;
    const rel = path.relative(rootDir, diag.file.fileName).replace(/\\/g, '/');
    const line = diag.file.getLineAndCharacterOfPosition(diag.start ?? 0).line + 1;
    const msg = ts.flattenDiagnosticMessageText(diag.messageText, ' ');
    issues.push(createIssue(rel, line, `ts/TS${diag.code}`, msg));
  }
}

/**
 * Executa a auditoria completa de lint no monorepo retornando estatísticas e eventuais violações.
 */
export function runLintAudit(rootDir) {
  const issues = [];
  checkTsConfigFlags(rootDir, issues);

  const sourceFileCache = new Map();
  const projectConfigs = [
    'packages/schemas/tsconfig.json',
    'packages/engine/tsconfig.json',
    'packages/patches/tsconfig.json',
    'packages/storage/tsconfig.json',
    'tools/importer/tsconfig.json',
    'apps/desktop/tsconfig.json',
    'apps/desktop/tsconfig.electron.json',
  ];
  for (const cfg of projectConfigs) {
    checkUnusedSymbolsInProject(rootDir, cfg, sourceFileCache, issues);
  }

  const productionFiles = collectSourceFiles(rootDir, ['packages', 'apps', 'tools']);
  for (const fullPath of productionFiles) {
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    const content = fs.readFileSync(fullPath, 'utf-8');
    issues.push(...lintSourceText(content, relPath, { checkSecurity: true }));
  }

  const scriptFiles = collectSourceFiles(rootDir, ['scripts']);
  for (const fullPath of scriptFiles) {
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    const content = fs.readFileSync(fullPath, 'utf-8');
    issues.push(...lintSourceText(content, relPath, { checkSecurity: false }));
  }

  return {
    checkedFiles: productionFiles.length + scriptFiles.length,
    issues,
  };
}

// Execução direta via CLI (`npm run lint`)
const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = runLintAudit(repoRoot);

  console.log(`=== Auditoria de Lint & Qualidade FootManager (${result.checkedFiles} arquivos) ===`);
  if (result.issues.length === 0) {
    console.log('Nenhuma violação encontrada (higiene, segurança, pureza, modularidade e TS unused OK).');
  } else {
    for (const issue of result.issues) {
      console.error(`[${issue.rule}] ${issue.file}:${issue.line} — ${issue.message}`);
    }
    console.error(`Total de violações: ${result.issues.length}`);
    process.exitCode = 1;
  }
}
