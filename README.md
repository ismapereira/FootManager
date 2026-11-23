# FootManager

Jogo desktop 100% offline de gerenciamento de futebol moderno, inspirado na agilidade e ritmo viciante do *Brasfoot* clássico, construído com arquitetura orientada a dados, visual minimalista com tema dinâmico do clube treinado e sistema de patches declarativos `.fmpack`.

> **Fase Atual:** Fase 0 — Fundação (concluída e verificada com testes automatizados).

## Stack Técnica (`DEC-001` a `DEC-012`)

- **Linguagem:** TypeScript 5.9 (`strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`)
- **Desktop Shell:** Electron endurecido (`contextIsolation`, `sandbox`, `nodeIntegration: false`, CSP) + `electron-builder` (NSIS `.exe`)
- **Interface:** React 19 + Vite + Tailwind CSS v4 + Zustand + `i18next` (`pt-BR`) + `lucide-react`
- **Validação:** Zod em 100% das fronteiras externas (IPC, `.fmpack`, `data/core`, saves)
- **Persistência:** SQLite (`better-sqlite3` em WAL mode) com *prepared statements*, transações atômicas, `PRAGMA quick_check` e rotação automática de backup `.fmsave.bak`
- **Qualidade & Testes:** Auditoria estática AST (`npm run lint`) + Vitest (testes unitários e de integração)

## Estrutura do Monorepo

```text
FootManager/
├── docs/                 # Documentação viva do projeto
├── scripts/              # Ferramentas de qualidade e lint AST (scripts/lint.mjs)
├── packages/
│   ├── schemas/          # Contratos Zod & tipos TS (@footmanager/schemas)
│   ├── engine/           # Motor puro de simulação sem Electron/React (@footmanager/engine)
│   ├── patches/          # Leitor seguro ZIP, sanitizador SVG, resolução de conflitos (.fmpack)
│   └── storage/          # SQLite WAL, migrações, saves atômicos e histórico (@footmanager/storage)
├── apps/
│   └── desktop/          # App Electron + React + Tailwind + Worker Thread (@footmanager/desktop)
├── data/core/            # Base modular oficial (mesmo formato de Pack)
├── tools/importer/       # CLI de normalização, cálculo de força e auditoria da base
└── tests/                # Suítes unitárias, integração e estresse (Vitest)
```

## Scripts Principais

```bash
# Instalar dependências do monorepo
npm install

# Auditar higiene de código, regras de segurança, pureza do engine, modularidade e TS unused
npm run lint

# Verificar tipagem estrita em todos os workspaces
npm run typecheck

# Compilar pacotes, frontend React e bundles Electron (main/preload/worker)
npm run build

# Executar todos os testes automatizados (unitários + integração)
npm test

# Auditar integridade da base modular em data/core/
npm run validate:data

# Executar o app desktop completo em desenvolvimento (Vite + Electron)
npm run dev

# Executar apenas a pré-visualização web no navegador (Vite)
npm run dev:web
```

## Documentação Viva

- [Arquitetura Técnica](docs/ARQUITETURA.md)
- [Regras de Competições e Calendário Global](docs/REGRAS_COMPETICOES.md)
- [Motor de Simulação, Táticas e Longevidade](docs/MOTOR_SIMULACAO.md)
- [Especificação do Formato `.fmpack` e Conflitos](docs/FORMATO_FMPACK.md)
- [Changelog](docs/CHANGELOG.md)
- [Planejamento Original](PLANEJAMENTO_JOGO_MANAGER.md)
