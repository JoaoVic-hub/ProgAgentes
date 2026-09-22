# Guidelines — Padrões e Convenções (snake-duel)

## 1. Princípios Fundamentais (Constitution)

| Princípio | Regra Prática |
|-----------|---------------|
| **I. Separação de Camadas** | `logic/` não importa `render/` nem `input/`. `render/` não importa `logic/engine` (só `types`). `main.ts` é o único "cola". |
| **II. Pureza da Lógica** | Funções em `logic/` = puro: entrada → saída. Zero side-effects, zero APIs de navegador. |
| **III. Determinismo** | Mesma seed + mesmos inputs = mesmo estado. PRNG seedado (`rng.ts`), estado serializável. |
| **IV. Testes como Spec** | Comportamento crítico (colisão, embate, vitória, crescimento) **sempre** tem teste em `engine.test.ts`. |

---

## 2. TypeScript

### 2.1 Configuração Obrigatória
```json
// tsconfig.json — já configurado
"strict": true,
"noUnusedLocals": true,
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true,
"isolatedModules": true
```

### 2.2 Estilo de Tipos
- **Interfaces** para objetos de domínio (`GameState`, `Snake`, `RenderConfig`).
- **Type aliases** para uniões, tuplas, primitivos (`Vec2`, `PlayerId`, `CollisionType`).
- **`const` assertions** para literais imutáveis (`DEFAULT_GAME_CONFIG`, `DEFAULT_RENDER_CONFIG`).
- **Evitar `any`** — usar `unknown` + narrow ou genéricos.
- **`readonly`** em arrays/tuplas que não mutam (`snakes: readonly [Snake, Snake]` — opcional, mas encorajado).

### 2.3 Imports
```ts
// Tipos: import type
import type { GameState, Vec2 } from './types';

// Valores: import normal
import { createGame, step } from './engine';
```

### 2.4 Nomes
| Categoria | Convenção | Exemplo |
|-----------|-----------|---------|
| Interfaces/Types | PascalCase | `GameState`, `Vec2` |
| Funções/Variáveis | camelCase | `computeTickMs`, `foodsEaten` |
| Constantes globais | UPPER_SNAKE_CASE | `DEFAULT_GAME_CONFIG` |
| Enums/Union members | PascalCase | `'countdown' \| 'play'` (string literal) |
| Arquivos | kebab-case | `engine.ts`, `engine.test.ts` |

---

## 3. Arquitetura de Código

### 3.1 Estrutura de Pastas
```
src/
├── logic/          # Regras puras (testáveis em Node)
│   ├── types.ts    # Contratos de dados (compartilhados)
│   ├── engine.ts   # Regras + step() + helpers exportados
│   ├── rng.ts      # PRNG determinístico
│   └── engine.test.ts
├── render/         # Desenho Canvas (precisa DOM)
│   └── renderer.ts
├── input/          # Captura de teclado
│   └── keyboard.ts
└── main.ts         # Bootstrap + loop (único que conhece as 3)
```

### 3.2 Padrão de Módulo (logic/)
```ts
// 1. Imports (tipos primeiro)
import type { GameState, Snake, Vec2 } from './types';
import { nextInt } from './rng';

// 2. Helpers puros (privados, não exportados)
function vecEq(a: Vec2, b: Vec2): boolean { ... }

// 3. Funções de domínio exportadas (uma por responsabilidade)
export function checkCollisions(...) { ... }
export function resolveHeadOn(...) { ... }

// 4. Função principal exportada
export function step(state: GameState, inputs: PlayerInput[]): GameState { ... }

// 5. Re-exports de conveniência no final
export { DEFAULT_GAME_CONFIG } from './types';
export { nextRandom, nextInt } from './rng';
```

### 3.3 Imutabilidade
- **Nunca** mutar parâmetros: `state.snakes[0].cells.push(...)` ❌
- **Sempre** retornar novo objeto: `return { ...state, snakes: newSnakes }` ✅
- Arrays: `slice()`, `map()`, spread `[...arr, newItem]` em vez de `push/splice`.

---

## 4. Testes (Vitest)

### 4.1 Organização
```ts
describe('Nome do Domínio (domínio crítico)', () => {
  it('descrição comportamental em português', () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### 4.2 Padrões
- **Determinismo**: usar seed fixa (`createGame(cfg, 42)`).
- **Isolamento**: cada `it` cria seu próprio estado; sem `beforeEach` mutando estado compartilhado.
- **Cobertura alvo**: 100% de `logic/` (linhas + branches).
- **Nomes de testes**: "o que acontece" + "condição" (ex.: `cobra MAIOR vence embate frontal contra menor`).

### 4.3 Helpers de Teste
- `while (s.phase === 'countdown') s = step(s, [])` — avança countdown.
- `guard` loops com limite (ex.: `guard < 50`) para evitar loop infinito em testes.

---

## 5. Renderização (Canvas 2D)

### 5.1 Princípios
- **Função pura de frame**: `drawFrame(ctx, state, config, cols, rows)` — sem estado interno.
- **Primitivas reutilizáveis**: `drawBlock`, `drawHead`, `drawDebris`, `drawFood`, `drawGrid`.
- **Composição em camadas** (ordem = z-index):
  1. Background
  2. Grid
  3. Obstacles (escombros)
  4. Food
  5. Snakes (corpo → cabeça)
  6. HUD
  7. Screen Overlay (countdown/round_end/match_end)

### 5.2 DPR & Responsividade
```ts
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = w * dpr;
canvas.height = h * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
```
- Cap em 2× evita memory pressure em telas 3×/4×.
- `canvas.style.aspectRatio` mantém proporção no CSS.

### 5.3 Cores & Fontes
- Centralizadas em `DEFAULT_RENDER_CONFIG` (types.ts).
- **Não** hardcodar cores/tamanhos no renderer.
- Fontes: `config.fonts.display` (Bungee) para números/títulos; `config.fonts.ui` (Archivo) para hints.

---

## 6. Input (Teclado)

### 6.1 Responsabilidade
- `keyboard.ts` **só** traduz `KeyboardEvent.code` → `PlayerInput[]`.
- **Não** valida reversão de 180° (feito no `engine.ts`).
- **Não** conhece `GameState` ou regras.

### 6.2 API do Controller
```ts
interface KeyboardController {
  consumeInputs(): PlayerInput[];      // drena fila, retorna inputs do frame
  consumeRestartPressed(): boolean;    // true uma vez por pressionamento de Espaço
  dispose(): void;                     // remove listener
}
```
- Um input por jogador por frame (o mais recente vence).

---

## 7. Loop Principal (main.ts)

### 7.1 Estrutura
```ts
let state = createGame(config, seed);
let accumulatorMs = 0;
let lastFrameTime = 0;
let roundEndAt: number | null = null;

function loop(now) {
  const delta = now - lastFrameTime;
  lastFrameTime = now;

  if (state.phase === 'match_end') { handleRestart(); }
  else if (state.phase === 'round_end') { handleRoundEndTimer(); }
  else {                               // countdown | play
    accumulatorMs += delta;
    const tickMs = state.phase === 'countdown' ? 1000 : computeTickMs(state);
    while (accumulatorMs >= tickMs && ticksThisFrame < 5) {
      state = step(state, keyboard.consumeInputs());
      accumulatorMs -= tickMs;
    }
  }

  renderer.render(state);
  requestAnimationFrame(loop);
}
```

### 7.2 Regras do Loop
- **Countdown** usa 1000 ms fixo (independe de velocidade de jogo).
- **Proteção spiral-of-death**: `maxCatchUpTicks = 5`.
- **Transição round_end → próximo**: timer no loop principal (`roundEndDelayMs = 2600`), não no `step()`.

---

## 8. Git & Commits

### 8.1 Mensagens
```
<tipo>(<escopo>): <descrição imperativa curta>

[corpo opcional: motivação, consequências]

[rodapé: Closes #123]
```
**Tipos**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.

### 8.2 Branches
- `main` = protegida, só via PR.
- `feat/`, `fix/`, `refactor/` prefixos.

### 8.3 Pre-commit (recomendado)
```bash
# .husky/pre-commit
npm run build && npm run test
```

---

## 9. Checklist de PR

- [ ] `npm run build` passa (typecheck + vite build)
- [ ] `npm run test` passa (100% logic coverage)
- [ ] Novas regras em `logic/` têm testes correspondentes
- [ ] Nenhum `console.log` / `debugger` commitado
- [ ] Imports organizados (tipos → valores; relative → absolute)
- [ ] Nomes seguem convenções (Seção 2.4)
- [ ] Camadas respeitadas (Seção 1, Princípio I)
- [ ] Estado imutável mantido (Seção 3.3)

---

## 10. Extensibilidade (Guia Rápido)

| O que adicionar | Onde | Cuidados |
|-----------------|------|----------|
| Nova regra de colisão | `logic/engine.ts` + `engine.test.ts` | Exportar helper puro; testar edge cases |
| Novo tipo de obstáculo | `types.ts` (ObstacleType) + `engine.ts` + `renderer.ts` | Manter `obstaclesContain` retornando `false` |
| Novo input (gamepad) | `input/gamepad.ts` + `main.ts` | Mesma API `KeyboardController` |
| Novo renderer (WebGL) | `render/webgl.ts` + `main.ts` | Mesma assinatura `createRenderer` |
| Config via UI | `main.ts` + novo módulo `config/ui.ts` | Não mutar `DEFAULT_*_CONFIG`; criar objeto mesclado |

---

## 11. Dicas de Depuração

```ts
// Log de estado determinístico (só em dev)
if (import.meta.env.DEV) {
  console.log('tick', state.tick, 'phase', state.phase, 'p1', state.snakes[0].cells.length, 'p2', state.snakes[1].cells.length);
}

// Replay de seed conhecida
// No console do browser:
// state = createGame(DEFAULT_GAME_CONFIG, 42);
// ... jogar ...
// Copiar seed do console para reproduzir bug
```

---

## 12. Referências Rápidas

- **Config padrão**: `src/logic/types.ts` (linhas 91–122)
- **Step principal**: `src/logic/engine.ts` (linha 282)
- **Loop**: `src/main.ts` (linha 38)
- **Render frame**: `src/render/renderer.ts` (linha 295)
- **Testes**: `src/logic/engine.test.ts`