# Motor de Simulação, Táticas e Longevidade (`packages/engine`)

> **Última Atualização:** Fase 0 — Fundação (22/11/2026)

## 1. PRNG Determinístico (`src/rng/mulberry32.ts`)

Todas as decisões estocásticas do motor consomem uma instância de `createRng(seed)` (algoritmo Mulberry32). A mesma `seed` inicial garante reprodução exata de qualquer partida, rodada ou teste de regressão.

## 2. Força Efetiva e Setores (`src/match/sectorCalculator.ts`)

### Força Efetiva por Titular
```text
eff = overall × fatorEnergia(energy) × fatorMoral(morale) × fatorPosicao(pos, slot) + bonusEstrela
```
- **Energia:** `1.00` (`>= 80%`) com interpolação linear até `0.72` (`<= 30%`).
- **Moral (`1..5`):** `0.94`, `0.97`, `1.00`, `1.03`, `1.06`.
- **Posição:** `1.00` (primária), `0.97` (secundária), `0.75` (improvisado na linha), `0.45` (goleiro na linha ou jogador de linha no gol).
- **Estrela (`★`):** `+2.5` pontos fixos.

### Setores e Fator Casa
- `GK`, `DEF`, `MID` e `ATT` calculados por média ponderada das vagas e bônus de `traits` compatíveis.
- **Fator Casa:** `1.03` a `1.07` proporcional à taxa de ocupação do estádio (`0..1`).

## 3. Táticas e Substituições (`src/tactics/formations.ts` e `sectorCalculator.ts`)

- **Estilos:** `balanced`, `attacking` (`ATT +8%`, `DEF -6%`, energia `+10%`), `defensive` (`DEF +8%`, `ATT -6%`, energia `-5%`), `counter_attack` (`ATT +6%` extra contra `attacking`/`high_press`) e `high_press` (`MID +7%`, `ATT +4%`, energia `+25%`).
- **Marcação:** `light` (`DEF -3%`, faltas `0.7x`), `normal` (`1.0x`), `heavy` (`DEF +5%`, faltas `1.4x`).
- **Regra 2026 de Substituições:** até **5 substituições** em no máximo **3 paradas** no tempo regulamentar; substituições no intervalo não consomem parada; prorrogação libera **+1 substituição** adicional (até 6).

## 4. Curva de Longevidade (`DEC-008` — `src/progression/ageCurve.ts`)

| Faixa | Linha | Goleiro (`GOL`) | Comportamento |
| :--- | :--- | :--- | :--- |
| **Evolução** | 16–23 anos | 16–24 anos | Ganho de `+1` a `+4`/temporada (respeitando teto `potential <= 99`). |
| **Auge Longevo** | 24–32 anos | 25–35 anos | Estabilidade total com oscilação leve (`-1` a `+2`) conforme nota média. |
| **Declínio Gradual** | 33+ anos | 36+ anos | Queda suave (`-1` a `-3`/ano), atenuada em **35%** se `RESISTENCIA` ou `isStar = true`. |
| **Aposentadoria** | A partir de 35 | A partir de 38 | Probabilidade crescente anual limitada a `95%`. |

## 5. Governança SAF vs. Associativo (`src/finance/governance.ts` e `src/career/boardConfidence.ts`)

- **Associativo:** autonomia de caixa, multiplicador de pressão `1.0x`.
- **SAF:** aportes sazonais proporcionais ao `investorTier` (`1..3`), porém quedas de confiança por metas falhadas sofrem multiplicador `1.4x` (+40% mais severo).
