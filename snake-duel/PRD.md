# PRD — Duelo da Cobrinha (snake-duel)

## 1. Visão Geral

**Nome do Produto:** Duelo da Cobrinha  
**Versão:** 0.1.0  
**Tipo:** Jogo multiplayer local 2 jogadores (versus), navegador  
**Stack:** TypeScript + Vite + Canvas 2D (sem frameworks de UI)  
**Público-alvo:** Dois jogadores no mesmo dispositivo, sessões curtas (1–3 min)

---

## 2. Objetivo do Produto

Entregar um **duelo de cobras** competitivo, determinístico e visualmente limpo, onde a habilidade de manobra e timing de embates frontais decide o vencedor. Melhor de três rodadas.

---

## 3. Funcionalidades (Features)

### 3.1 Core Gameplay

| ID | Feature | Descrição |
|---:|---------|-----------|
| FR-01 | **Duas cobras simultâneas** | Cada jogador controla uma cobra no mesmo tabuleiro 24×16. |
| FR-02 | **Movimento em grade** | Passo discreto por tick; direção muda apenas em 90° (reversão de 180° bloqueada). |
| FR-03 | **Comida & crescimento** | Uma comida por vez; comer cresce a cobra em 1 segmento e acelera o jogo. |
| FR-04 | **Velocidade progressiva** | Início 180 ms/tick → –8 ms por comida → piso 90 ms. |
| FR-05 | **Embate frontal (head-on clash)** | Se cabeças se cruzam ou vão à mesma célula: ambas perdem a cabeça → vira obstáculo visual; segmento seguinte vira nova cabeça. Quem ficar sem segmentos perde a rodada. |
| FR-06 | **Atrito segmento-a-segmento** | Em cobras de tamanho igual, múltiplos embates sucedem-se até ambas zerarem → empate da rodada. Cobra maior vence a menor. |
| FR-07 | **Colisões letais** | Parede, corpo próprio, corpo do oponente → eliminação imediata da cobra (escombros tipo `elimination`). |
| FR-08 | **Escombros não letais** | Escombros de embate frontal (`head_clash`) **não bloqueiam** movimento (evita auto-colisão geométrica no tick seguinte). |
| FR-09 | **Melhor de três** | Placar persistente entre rodadas; primeiro a 2 vitórias vence a partida. Empate não pontua. |
| FR-10 | **Countdown 3–2–1** | 1 s por número antes de cada rodada; velocidade de jogo não se aplica. |
| FR-11 | **Reinício de partida** | Tecla Espaço na tela de fim de partida reinicia tudo (nova seed). |

### 3.2 Controles

| Jogador | Cima | Baixo | Esquerda | Direita |
|--------:|:----:|:-----:|:--------:|:-------:|
| 1 | `W` | `S` | `A` | `D` |
| 2 | `↑` | `↓` | `←` | `→` |
| Ambos | **Espaço** → jogar de novo (apenas em `match_end`) |

### 3.3 Visual & UX

| ID | Requisito |
|---:|-----------|
| FR-20 | Canvas responsivo com `devicePixelRatio` (cap 2×) mantendo aspect-ratio 3:2. |
| FR-21 | Paleta dark neon: fundo `#0D0A1F`, P1 `#FFC233`, P2 `#2BE5C8`, comida `#FF3355`. |
| FR-22 | Fontes: **Bungee** (display/números) + **Archivo** (UI/hints) via Google Fonts. |
| FR-23 | HUD: tamanho das cobras (cantos), pips de rodada (centro), barra de velocidade (base). |
| FR-24 | Overlays: countdown gigante, "Jogador X vence a rodada", "Jogador X vence a partida". |
| FR-25 | Acessibilidade: `aria-label` no canvas, hint de teclas visível. |

---

## 4. Requisitos Não-Funcionais

| ID | Categoria | Requisito |
|---:|-----------|-----------|
| NFR-01 | **Determinismo** | Mesma seed + mesmos inputs → mesmo estado em todos os ticks (Constitution Principle III). PRNG Mulberry32 seedado; estado serializável. |
| NFR-02 | **Arquitetura em camadas** | `logic/` (regras puras) ⟂ `render/` (desenho) ⟂ `input/` (teclado). Camadas não se importam mutuamente; só `main.ts` as conhece. |
| NFR-03 | **Testabilidade** | 100% da lógica coberta por testes Vitest (`engine.test.ts`); zero dependência de DOM/Canvas nos testes. |
| NFR-04 | **Performance** | 60 FPS estável; loop com acumulador + timestep fixo dinâmico; proteção contra spiral-of-death (max 5 ticks/frame). |
| NFR-05 | **Build/Dev** | `npm run dev` (HMR), `npm run build` (typecheck + minify), `npm run test` (Vitest run). |
| NFR-06 | **TypeScript strict** | `strict: true`, `noUnusedLocals`, `noImplicitReturns`, `isolatedModules`. |

---

## 5. Fora do Escopo (v0.1)

- Multiplayer remoto / rede
- IA / bot single-player
- Persistência de high-score (localStorage)
- Configuração de tabuleiro/tamanho via UI
- Sons / música
- Mobile/touch controls

---

## 6. Critérios de Aceite (Definition of Done)

- [ ] Todas as features FR-01 a FR-11 implementadas e testadas
- [ ] Testes unitários passam (`npm run test`)
- [ ] Build de produção sem erros (`npm run build`)
- [ ] Jogo roda em Chrome/Firefox/Safari desktop sem console errors
- [ ] Determinismo verificado: mesma seed reproduz partida idêntica
- [ ] Acessibilidade básica (teclas, aria-label) funcional

---

## 7. Métricas de Sucesso (Pós-Lançamento)

- Tempo médio de partida: 60–180 s
- Taxa de empate de rodada < 15%
- Zero bugs de "cobra atravessa parede" ou "cresce sem comer" em 100 partidas
- Build size < 100 kB gzipped