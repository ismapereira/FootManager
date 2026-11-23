# Especificação do Formato `.fmpack` e Resolução de Conflitos

> **Última Atualização:** Fase 0 — Fundação (22/11/2026)

## 1. Natureza Declarativa (`DEC-009`)

Um arquivo `.fmpack` é um arquivo `.zip` padronizado contendo **exclusivamente JSON declarativo e imagens de escudos** — **zero código executável**. A própria base oficial em `data/core/` adota exatamente o mesmo schema.

### Arquivos Reconhecidos
- `manifest.json` *(obrigatório na raiz)*
- `country.json` / `countries.json` (ou `countries/<iso>/country.json`)
- `competitions.json`
- `stadiums.json`
- `clubs.json`
- `players.json`
- `badges/*.png`, `badges/*.webp`, `badges/*.svg`

## 2. Barreira de Segurança (`packages/patches/src/unpacker.ts` & `sanitizer.ts`)

Antes de qualquer parse de dados, o desempacotador aplica:
1. **Anti Path-Traversal:** rejeita `..`, caminhos absolutos (`/`), letras de unidade (`C:`), bytes nulos, entradas duplicadas e symlinks UNIX; valida contenção via `path.resolve`.
2. **Whitelist de Extensões e Magic Bytes:** aceita exclusivamente `.json`, `.png`, `.webp` e `.svg`, verificando a assinatura mágica binária de PNG (`89 50 4E 47 ...`) e WebP (`RIFF....WEBP`) para bloquear poliglotas falsificados.
3. **Limites Anti ZIP Bomb:** máximo `50 MB` compactado, `50 MB` descompactado real (aplicado via `zlib.inflateRawSync` com `maxOutputLength` antes de alocar memória, imune a cabeçalhos falsificados), `5.000` entradas e `256 KB` por escudo.
4. **Sanitização Estrita de SVG (Allowlist):** tokenizador XML/SVG reconstrói apenas tags geométricas estáticas permitidas e atributos seguros, decodificando entidades HTML para bloquear ofuscações (`&#106;avascript:`, `<svg/onload=...>`, `<sc<iframe/>ript>`, `<set>`, `<use href="//...">`, `DOCTYPE/ENTITY` e URLs externas).
5. **Validação de Calendário e Elenco (`validator.ts`):** valida consistência da janela semanal das competições nas 52 semanas e alerta elencos abaixo de 16 atletas / 2 goleiros em expansões (mesmo com 0 atletas).

## 3. Resolução de Conflitos em 3 Camadas (`DEC-010` — `conflictResolver.ts`)

| Camada | Severidade | Cenário | Ação do Motor |
| :---: | :--- | :--- | :--- |
| **1** | `warning` (Amarelo) | Sobrescrita de país compatível, clube, estádio, competição compatível ou atributos de jogador. | **Merge parcial por campo** preservando propriedades opcionais da base quando o patch traz `undefined` (mantendo sobrescrita explícita por `null`), vencendo o patch com maior prioridade no Load Order. |
| **2** | `auto_resolved` | Mesmo jogador (mesmo `id` ou mesma chave normalizada `nacionalidade + nascimento + nome`) listado em clubes diferentes — ou colisão canônica causada por atualização de `id` existente. | Mantém o atleta **apenas no patch de maior prioridade**, removendo registros duplicados/órfãos e chaves canônicas obsoletas automaticamente com registro em log. |
| **3** | `blocking` (Vermelho) | Dependência `requires` ausente/incompatível ou dois patches comunitários definindo o mesmo país (`confederation`/`seasonCycle`) ou competição (`template`/`seasonCycle`) com regras incompatíveis. | Sinaliza `hasBlockingConflicts = true` e bloqueia a criação da carreira até o usuário ajustar o Load Order ou desativar o patch conflitante. |
