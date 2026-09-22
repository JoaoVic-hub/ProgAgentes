# ADR — Decisões de Arquitetura (snake-duel)

## Índice

1. [ADR-001: Arquitetura em Camadas Isoladas](#adr-001-arquitetura-em-camadas-isoladas)
2. [ADR-002: Lógica 100% Pura (Sem Side-Effects)](#adr-002-lógica-100-pura-sem-side-effects)
3. [ADR-003: Determinismo Total via PRNG Seedado](#adr-003-determinismo-total-via-prng-seedado)
4. [ADR-004: Loop com Acumulador + Timestep Fixo Dinâmico](#adr-004-loop-com-acumulador--timestep-fixo-dinâmico)
5. [ADR-005: Embate Frontal como Mecânica Central](#adr-005-embate-frontal-como-mecânica-central)
6. [ADR-006: Escombros Não-Bloqueantes](#adr-006-escombros-não-bloqueantes)
7. [ADR-007: Estado Imutável & Transições Explícitas](#adr-007-estado-imutável--transições-explícitas)
8. [ADR-008: TypeScript Strict + Vitest](#adr-008-typescript-strict--vitest)
9. [ADR-009: Canvas 2D Direto (Sem Engine/Framework)](#adr-009-canvas-2d-direto-sem-engineframework)

---

## ADR-001: Arquitetura em Camadas Isoladas

**Status:** Aceito  
**Data:** 2025-09-17

### Contexto
O jogo precisa separar claramente: regras de negócio, renderização e captura de input. Isso permite testar a lógica sem DOM, trocar o renderer (ex.: WebGL) sem tocar nas regras, e testar inputs isoladamente.

### Decisão
Três pastas de primeira linha sob `src/`:
- `logic/` — **regras puras** (engine, types, RNG). Zero imports de `render/` ou `input/`. Zero APIs de navegador.
- `render/` — **desenho Canvas 2D**. Recebe `GameState` + `RenderConfig`, desenha. Não muta estado.
- `input/` — **teclado → `PlayerInput[]`**. Não valida regras (ex.: reversão 180°); só normaliza teclas.

`main.ts` é o **único** arquivo que importa as três camadas e as conecta (bootstrap + loop).

### Consequências
- ✅ Testes unitários rodam em Node (sem JSDOM/happy-dom)
- ✅ Troca de renderer viável (ex.: React/PIXI) sem tocar `logic/`
- ✅ Separação clara de responsabilidades
- ⚠️ `main.ts` torna-se "God file" leve; mantido pequeno (~80 linhas)

---

## ADR-002: Lógica 100% Pura (Sem Side-Effects)

**Status:** Aceito  
**Data:** 2025-09-17

### Contexto
Determinismo (ADR-003) e testabilidade exigem que `step(state, inputs) → newState` seja uma função pura.

### Decisão
- Toda função em `logic/` recebe argumentos e retorna novo objeto/valor.
- **Nenhuma** mutação de argumentos.
- **Nenhuma** chamada a `Math.random()`, `Date.now()`, `localStorage`, `console`, DOM, Canvas, `requestAnimationFrame`.
- Estado é **serializável** (plain objects + números + arrays).

### Consequências
- ✅ Replay/determinismo trivial: basta gravar `(seed, inputs[])`
- ✅ Testes são `expect(step(s, i)).toEqual(expected)`
- ✅ Futuro: time-travel debugging, multiplayer lockstep, replay fantasma
- ⚠️ Verbosidade: spread operators frequentes (`{ ...state, snakes: [...] }`)

---

## ADR-003: Determinismo Total via PRNG Seedado

**Status:** Aceito  
**Data:** 2025-09-17

### Contexto
`Math.random()` não é seedável nem reproduzível cross-engine. O jogo precisa sortear posição da comida de forma determinística.

### Decisão
- PRNG **Mulberry32** (`rng.ts`): estado = `uint32`, avança com aritmética 32-bit.
- `GameState.rngState` carrega o estado atual do PRNG.
- `spawnFood` recebe `rngState`, retorna `[newRngState, pos]`.
- Seed inicial em `main.ts`: `Date.now() & 0xffffffff` (apenas ponto de partida).

### Consequências
- ✅ Mesmo seed → mesma sequência de comidas → partida reproduzível
- ✅ Estado completo do jogo cabe em JSON (útil para save/replay)
- ✅ Zero dependência de `Math.random()`
- ⚠️ Mulberry32 não é criptograficamente seguro (irrelevante para jogo)

---

## ADR-004: Loop com Acumulador + Timestep Fixo Dinâmico

**Status:** Aceito  
**Data:** 2025-09-17

### Contexto
Velocidade do jogo muda a cada comida (180→90 ms/tick). `requestAnimationFrame` entrega FPS variável. Precisamos avançar a simulação em **ticks discretos** consistentes.

### Decisão
Loop em `main.ts`:
```ts
accumulatorMs += deltaMs;
const tickMs = phase === 'countdown' ? 1000 : computeTickMs(state);
while (accumulatorMs >= tickMs && ticksThisFrame < 5) {
  state = step(state, keyboard.consumeInputs());
  accumulatorMs -= tickMs;
}
```
- Countdown usa 1000 ms fixo (independente de `computeTickMs`).
- `maxCatchUpTicks = 5` evita spiral-of-death se aba em background.

### Consequências
- ✅ Simulação avança em passos discretos idênticos independentemente de FPS
- ✅ Velocidade progressiva funciona corretamente
- ✅ Proteção contra lag spikes
- ⚠️ Inputs são consumidos **uma vez por tick** (último input vence no frame)

---

## ADR-005: Embate Frontal como Mecânica Central

**Status:** Aceito  
**Data:** 2025-09-17

### Contexto
Snake clássico: colisão cabeça-corpo = morte. Queremos duelo: **habilidade de manobrar para forçar/evitar embate frontal**.

### Decisão
Regras de embate frontal (`isHeadOnClash`, `resolveHeadOn`):
1. **Prioridade absoluta**: verificado **antes** de qualquer outra colisão no tick.
2. **Duas condições**: cabeças vão para a mesma célula **OU** trocam de posição (cruzam).
3. **Resolução**: ambas perdem a cabeça → vira obstáculo `head_clash`; próximo segmento vira cabeça.
4. **Vencedor**: cobra com **mais segmentos restantes** vence. Igual → empate (0 pontos).
5. **Múltiplos embates**: cobras de 3 segmentos → 3 embates sucessivos até zerar.

### Consequências
- ✅ Cria "duelo de atrito" único (não eliminação instantânea)
- ✅ Cobra maior tem vantagem tática (pode "gastar" segmentos)
- ✅ Empate natural quando tamanhos iguais
- ⚠️ Complexidade de边界 cases (1-segmento, comida no ponto de choque) — cobertos por testes

---

## ADR-006: Escombros Não-Bloqueantes

**Status:** Aceito  
**Data:** 2025-09-17

### Contexto
Durante testes manuais, descobriu-se que se escombros de `head_clash` bloqueassem movimento, a cobra **inevitavelmente** colidiria com o **próprio** escombro no tick seguinte (a nova cabeça fica exatamente uma célula atrás do escombro, na direção de movimento). Isso matava ambas as cobras no primeiro embate, impedindo o atrito segmento-a-segmento.

### Decisão
`obstaclesContain(obstacles, pos) → false` **sempre**. Escombros (`head_clash` e `elimination`) são **apenas visuais/históricos**; nunca bloqueiam movimento.

### Consequências
- ✅ Duelo de atrito funciona: múltiplos embates por rodada
- ✅ Simplifica `checkCollisions` (não precisa iterar obstáculos)
- ⚠️ Escombros de eliminação (`elimination`) também não bloqueiam (consistência), embora rodada já termine no instante

---

## ADR-007: Estado Imutável & Transições Explícitas

**Status:** Aceito  
**Data:** 2025-09-17

### Contexto
`GameState` transita entre fases: `countdown` → `play` → `round_end` → (`play` | `match_end`).

### Decisão
- `GameState.phase` é **fonte da verdade** (não flags booleanas dispersas).
- Transições só ocorrem dentro de `step()` (play/countdown) ou no loop principal (round_end → próximo, via timer).
- `round_end` e `match_end` são **estados terminais de simulação**; `step()` não os avança automaticamente.
- `startNextRound()` cria novo estado de rodada preservando `roundScores`, `currentRound`, `rngState`.

### Consequências
- ✅ Máquina de estados explícita, fácil de depurar
- ✅ Loop principal só cuida de timing (`roundEndDelayMs`), não de regras
- ✅ Testes podem assertar `state.phase` em qualquer momento

---

## ADR-008: TypeScript Strict + Vitest

**Status:** Aceito  
**Data:** 2025-09-17

### Contexto
Projeto pequeno, mas correto. TypeScript strict catcha bugs cedo; Vitest roda em Node (rápido, sem browser).

### Decisão
`tsconfig.json`:
```json
{ "strict": true, "noUnusedLocals": true, "noImplicitReturns": true, "isolatedModules": true }
```
Testes: `vitest run` (single-thread, determinístico). Cobertura: 100% de `logic/` (domínio crítico).

### Consequências
- ✅ Erros de tipo = erros de build
- ✅ Testes rápidos (< 500 ms), paralelos, sem flakiness
- ✅ CI simples: `npm run build && npm run test`

---

## ADR-009: Canvas 2D Direto (Sem Engine/Framework)

**Status:** Aceito  
**Data:** 2025-09-17

### Contexto
Jogo 2D gradeado, 24×16 células, 60 FPS. Overhead de Phaser/Three/React seria desnecessário.

### Decisão
- `renderer.ts` usa `CanvasRenderingContext2D` nativo.
- Primitivas: `drawBlock`, `drawHead`, `drawDebris`, `drawFood`, `drawGrid`, `drawHUD`, `drawScreenOverlay`.
- DPR handling: `Math.min(devicePixelRatio, 2)` + `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.
- Fontes via Google Fonts (`<link preconnect>` + `font-family` no CSS).

### Consequências
- ✅ Bundle ~15 kB gzipped (só código + Vite runtime)
- ✅ Controle total de pixels, sem abstrações vazadas
- ✅ Fácil port para OffscreenCanvas / WebWorker no futuro
- ⚠️ Boilerplate de desenho manual (mitigado por primitivas reutilizáveis)

---

## Como Registrar Novos ADRs

1. Crie `docs/adr/NNN-titulo-kebab.md` (próximo número sequencial)
2. Use o template acima: **Status, Data, Contexto, Decisão, Consequências**
3. Referencie no `CHANGELOG.md` ou PR description