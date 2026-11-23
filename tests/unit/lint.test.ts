import { describe, expect, it } from 'vitest';
import { lintSourceText } from '../../scripts/lint.mjs';

describe('Auditoria Estática de Qualidade e Segurança (scripts/lint.mjs)', () => {
  it('aceita módulo TypeScript limpo, modular, puro e comentado em pt-BR', () => {
    const cleanEngineFile = `
      /**
       * Soma simples pura para teste do linter.
       */
      export function addPoints(a: number, b: number): number {
        return a + b;
      }
    `;
    const issues = lintSourceText(cleanEngineFile, 'packages/engine/src/sample.ts');
    expect(issues).toEqual([]);
  });

  it('detecta violações de segurança: dangerouslySetInnerHTML, eval, innerHTML, shell: true e interpolação SQL', () => {
    const unsafeUi = `
      // Componente inseguro de teste
      export function Bad({ html }: { html: string }) {
        eval('1+1');
        document.body.innerHTML = html;
        return <div dangerouslySetInnerHTML={{ __html: html }} />;
      }
    `;
    const uiIssues = lintSourceText(unsafeUi, 'apps/desktop/src/Bad.tsx');
    expect(uiIssues.some((i) => i.rule === 'security/no-dangerously-set-html')).toBe(true);
    expect(uiIssues.some((i) => i.rule === 'security/no-eval')).toBe(true);
    expect(uiIssues.some((i) => i.rule === 'security/no-dom-xss')).toBe(true);

    const unsafeShell = `
      // Spawn inseguro
      import { spawn } from 'node:child_process';
      export function run() {
        return spawn('cmd', [], { shell: true });
      }
    `;
    const shellIssues = lintSourceText(unsafeShell, 'apps/desktop/scripts/bad.mjs');
    expect(shellIssues.some((i) => i.rule === 'security/no-shell-true')).toBe(true);

    const unsafeSql = `
      // Consulta com SQL Injection
      export function find(db: { prepare: (q: string) => unknown }, id: string) {
        return db.prepare(\`SELECT * FROM players WHERE id = \${id}\`);
      }
    `;
    const sqlIssues = lintSourceText(unsafeSql, 'packages/storage/src/bad.ts');
    expect(sqlIssues.some((i) => i.rule === 'security/no-sql-interpolation')).toBe(true);
  });

  it('detecta impureza em packages/engine, ausência de comentários e funções acima de 50 linhas', () => {
    const impureEngine = `
      import fs from 'node:fs';
      export function read(p: string) {
        return fs.readFileSync(p) && window.location.href;
      }
    `;
    const purityIssues = lintSourceText(impureEngine, 'packages/engine/src/impure.ts');
    expect(purityIssues.some((i) => i.rule === 'hygiene/missing-comment')).toBe(true);
    expect(purityIssues.some((i) => i.rule === 'purity/engine-import')).toBe(true);
    expect(purityIssues.some((i) => i.rule === 'purity/engine-global')).toBe(true);

    // Variável local chamada `window` não deve gerar falso positivo em packages/engine
    const shadowedWindow = `
      // Parâmetro local representando janela de transferências
      export function checkWindow(windows: number[]): boolean {
        return windows.some((window) => window > 0);
      }
    `;
    expect(lintSourceText(shadowedWindow, 'packages/engine/src/ok.ts')).toEqual([]);

    const longBody = Array.from({ length: 52 }, (_, idx) => `  const v${idx} = ${idx};`).join('\n');
    const longFn = `// Função longa\nexport function tooLong(): number {\n${longBody}\n  return v0;\n}\n`;
    const modIssues = lintSourceText(longFn, 'packages/engine/src/long.ts');
    expect(modIssues.some((i) => i.rule === 'modularity/max-lines')).toBe(true);

    // Com justificativa explícita na linha anterior, deve ser aceita
    const justifiedFn = `// lint-justify-length: tabela declarativa\nexport function justified(): number {\n${longBody}\n  return v0;\n}\n`;
    expect(
      lintSourceText(justifiedFn, 'packages/engine/src/long.ts').some(
        (i) => i.rule === 'modularity/max-lines',
      ),
    ).toBe(false);
  });
});
