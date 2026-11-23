# Regras de Competições e Calendário Global (52 Semanas)

> **Última Atualização:** Fase 0 — Fundação (22/11/2026)

## 1. Catálogo Oficial de Países Jogáveis (`DEC-003`)

Todos os 10 países iniciais já possuem descritores validados em `data/core/countries/<iso>/country.json`:

| ISO | País | Confederação | Ciclo | Moeda | Janelas de Transferência (Semanas) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `BRA` | Brasil | CONMEBOL | `calendar_year` | `BRL` | S1–S10, S28–S32 |
| `ENG` | Inglaterra | UEFA | `split_year` | `GBP` | S1–S4, S27–S35 |
| `ESP` | Espanha | UEFA | `split_year` | `EUR` | S1–S4, S27–S35 |
| `ITA` | Itália | UEFA | `split_year` | `EUR` | S1–S4, S27–S35 |
| `DEU` | Alemanha | UEFA | `split_year` | `EUR` | S1–S4, S27–S35 |
| `FRA` | França | UEFA | `split_year` | `EUR` | S1–S4, S27–S35 |
| `POR` | Portugal | UEFA | `split_year` | `EUR` | S1–S4, S27–S35 |
| `ARG` | Argentina | CONMEBOL | `calendar_year` | `USD` | S1–S8, S26–S33 |
| `SAU` | Arábia Saudita | AFC | `split_year` | `SAR` | S1–S4, S27–S35 |
| `JPN` | Japão | AFC | `calendar_year` | `JPY` | S1–S12, S27–S33 |

## 2. Templates Declarativos Suportados (`CompetitionTemplateSchema`)

1. `round_robin` — Pontos corridos (1 ou 2 turnos, playoffs opcionais).
2. `knockout` — Mata-mata configurável (jogo único ou ida e volta, entrada escalonada).
3. `groups_knockout` — Grupos + mata-mata (Libertadores, Sul-Americana, Copa do Mundo 48, Mundial 32).
4. `swiss_league` — Fase de Liga única (Champions, Europa, Conference, AFC Elite).
5. `conferences_playoffs` — Conferências + playoffs eliminatórios (pronto para patches como MLS).
6. `brazil_state_standard` — Modelo padrão unificado de Estaduais do Brasil (~10 datas, opcional no save — `DEC-004`).
7. `brazil_serie_c` — Turno único (19 datas) + quadrangulares de acesso.
8. `brazil_serie_d` — 8 grupos regionalizados de 8 + mata-mata a partir de 16-avos.

## 3. Marcos do Calendário Global de 52 Semanas (`packages/engine/src/calendar/weekCalendar.ts`)

- **Datas FIFA fixas:** Semanas `12`, `23`, `36`, `41` e `46`.
- **Virada do Ciclo Dividido (`split_year`):** Semana `26` (expiração de contratos europeus/sauditas, promoções/rebaixamentos e premiações).
- **Virada do Ciclo Ano Civil (`calendar_year`):** Semana `51` (expiração de contratos sul-americanos/japoneses, promoções/rebaixamentos e premiações).
- **Anos Quadrienais:**
  - Copa do Mundo (48 seleções): `2026, 2030, 2034...`
  - Mundial de Clubes (32 clubes): `2029, 2033, 2037...`
- **Envelhecimento Natural:** a idade do atleta avança exatamente na sua semana de aniversário (`getBirthdayWeek`), evitando saltos artificiais na virada do ano.
