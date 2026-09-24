# Guidelines — Padrões e Convenções (web-swing)

## 1. Princípios Fundamentais

| Princípio | Regra prática |
|-----------|---------------|
| **I. Separação de camadas** | `logic/` não importa nada de fora de `logic/`. `render/`, `input/` e `ui/` só fazem `import type` de `logic/` (exceto `logic/math/*`). `app/` é cola pura. Só `main.ts` e `pose-viewer.ts` conhecem tudo. O `architecture.test.ts` reprova violações. |
| **II. Pureza da lógica** | Funções em `logic/` mapeiam entrada em saída, sem efeitos colaterais, sem navegador, sem `console`, sem `Math.random`/`Date.now`. |
| **III. Determinismo** | Mesma seed + mesmos inputs = mesmo `hashState`. |
| **IV. Testes como spec** | Todo comportamento de física, mira, gerador, câmera e animação tem teste com nome em português dizendo o que acontece e em que condição. |
| **V. Feel é medido** | Mudou o tuning? Rode `npm run feel` e anote os números no PR. |

---

## 2. TypeScript

- `strict`, `noUnusedLocals`, `noImplicitReturns`, `noFallthroughCasesInSwitch` e `isolatedModules` (ver `tsconfig.json`).
- **Interfaces** para objetos de domínio (`GameState`, `Player`, `Level`). **Type aliases** para uniões (`PlayerMode`, `GameEvent`).
- Tudo que vai para o estado é `readonly`. Dentro de `step()`, use um `Mutable<T>` local e devolva um objeto novo.
- Imports de tipo sempre com `import type { … }`; nunca `import { type X }` inline, que o teste de arquitetura trata como import de valor.
- Nomes: PascalCase para tipos; camelCase para funções e variáveis; UPPER_SNAKE para constantes globais (`DEFAULT_GAME_CONFIG`); arquivos em kebab-case.

---

## 3. Arquitetura

```
src/
├── main.ts, pose-viewer.ts       # cola (únicos que conhecem todas as camadas)
├── architecture.test.ts           # regras de import/pureza
├── app/      clock, flags, frame, camera-follow, save, threat-radar   # cola PURA e testável
├── logic/    engine (despacho por fase), progression, momentum, threats, highscores,
│             save-data, aim, config, types, camera-rig, replay, testing, __fixtures__/
│   ├── math/    vec3, geom                        # pode ser importado como valor pelo render
│   ├── level/   specs, generator, broadphase
│   └── player/  simulate (tick físico), physics, collision, web
├── input/    mouse-keyboard                        # pointer lock → InputFrame
├── storage/  store                                 # localStorage → strings (sem regras)
├── render/   scene, city, threats, web-line, camera, debug-draw, palette
│   └── character/ pose, animator, orientation (puros), rig (three)
└── ui/       overlay, crosshair, hud, banner, scoreboard, threat-indicator, format, debug-panel, tuning-gui
tools/        autopilot.ts (estratégia), autopilot.feel.ts (npm run feel), golden.gen.ts (npm run golden)
```

### 3.1 Ordem do tick

`engine.step` despacha pela fase (`logic/progression.ts`): countdown (só o olhar), respawning (espera e reaparece no checkpoint) ou playing. As fases terminais não avançam: só a cola (`main.ts`) sai delas.

Na fase playing:
1. Config efetiva do impulso (`applyMomentum`, `logic/momentum.ts`)
2. Tick físico (`logic/player/simulate.ts`, abaixo) com essa config
3. Queda no vão (`pos.y < killY`) → impulso zerado, respawning (o relógio continua)
4. Mísseis e lançadores (`logic/threats.ts`); acerto → `applyHit` (solta a teia, atordoa, empurra)
5. Impulso (`updateMomentum`): ganhos e perdas a partir dos eventos da física, do acerto e do input
6. Checkpoints (com o tempo parcial)
7. Chegada → conclui (tempo, estrelas)

Tick físico:
1. Look
2. Timers
3. Mira
4. Teia (soltar, anexar, buffer)
5. Espaço (impulso, pulo, flip)
6. Forças
7. Corda em subpassos (ou gravidade + integração)
8. **Colisão por último**
9. Pouso, bonk, modo e eventos

Uma regra nova entra no passo certo e ganha teste.

### 3.2 Configuração e tuning
- Todo número de *feel* fica em `logic/config.ts` (`DEFAULT_GAME_CONFIG`), com durações **em segundos** (convertidas por `secondsToTicks`).
- Números novos exigem: o campo em `types.ts`, o valor em `config.ts` e, se forem ajustáveis, a faixa em `ui/tuning-gui.ts`.
- Ajuste ao vivo com F2 → "Copiar JSON" → cole em `config.ts` → `npm run feel`.

### 3.3 Imutabilidade
- Nunca mute parâmetros: `state.player.pos.x = …` ❌
- Sempre `{ ...state, player: { ...p, pos } }` ✅. O `Level` é compartilhado por referência e nunca muda.

---

## 4. Testes (Vitest)

- Organização em `describe('Domínio (etapa)')` + `it('o que acontece quando …')`, com nomes em português.
- Cenários controlados com `logic/testing.ts`:
  - `makeTestLevel` (nível sob medida);
  - `stateWith` (sobrescreve o jogador);
  - `runTicks`;
  - `lookAtFrom` (mirar num ponto);
  - `ropeAt` (corda com apoio exato, sem âncora virtual);
  - `makeTestLevel([...], { launchers, checkpoints, voids, finishZ })` para cenários de mísseis e progressão.
- Mísseis: monte o `ThreatState` à mão (míssil já armado, na posição e direção do cenário) e chame `stepThreats` com o jogador seguindo um caminho — como em `threats.test.ts`. Dificuldade se testa como **invariante** (janela de desvio que nunca cresce), não como número mágico.
- `createGame(level)` devolve um estado já em playing (sandbox); `createRun()` começa a campanha no countdown.
- Invariantes valem mais que valores mágicos: "a corda nunca excede L", "nunca termina dentro de um sólido" (*fuzz*), "energia ≥ 95%".
- Testes de tempo usam limites folgados (ex.: gerar um nível em < 50 ms).
- `npm run test` é a suíte padrão. `npm run feel` é só medição, fora do CI.
- **Replay dourado:** mudou tuning, regras ou o gerador de propósito? Rode `npm run golden` e confira no diff que o novo tempo faz sentido. Se o teste quebrou sem você querer mudar nada, é regressão.
- **Recordes e save:** a lógica é pura (`logic/highscores.ts`, `logic/save-data.ts`); a cola recebe o store por parâmetro (`app/save.ts` + `createMemoryStore` nos testes).

---

## 5. Renderização (three.js)

- Cada módulo de render expõe `create…()` → `{ group/root, update(...), dispose() }` e libera geometrias, materiais e texturas no `dispose`.
- Muitos objetos iguais vão num `InstancedMesh`. Evite criar `Mesh` por prédio.
- Nada de alocar `Vector3`/`Quaternion` por frame em código quente: reutilize temporários do módulo.
- Cores e parâmetros visuais ficam em `render/palette.ts`, nunca fixos no meio do código.
- Shader injetado (`onBeforeCompile`) usa `customProgramCacheKey`. Revise os nomes de *chunks* ao atualizar o three.
- Ordem de desenho: cena (cidade, boneco, teia) → marcador 3D (`depthTest: false`) → debug (`renderOrder` alto).

---

## 6. Input

- `input/` só traduz eventos em `InputFrame`, sem regras.
- *Look* absoluto (yaw/pitch). Picos de `movementX/Y` acima de 300 px são descartados.
- Bordas (Espaço, clique rápido) ficam travadas até o próximo `consumeInput()`, para não se perderem entre ticks.
- Cliques só contam com o pointer lock confirmado.

---

## 7. Loop Principal (`main.ts`)

- `advanceClock(clock, deltaMs × slowmo)` → roda N ticks (`step`) → interpola com `alpha` → câmera com *look* ao vivo → animador → render.
- Sem pointer lock (e fora de `?cam=free`), a simulação fica pausada e o overlay aparece.
- Os eventos de todos os ticks do frame são repassados ao animador (e, nas próximas etapas, ao HUD e ao áudio).

---

## 8. Git & Commits

- Conventional Commits em inglês: `feat(web-swing): …`, `fix(web-swing): …`, `test`, `docs`, `refactor`, `perf`, `chore`.
- Branch `feat/web-swing` (a `main` só recebe via PR).
- Uma tag por etapa concluída: `web-swing-v0.<etapa>.<sub>`.

---

## 9. Checklist de PR

- [ ] `npm run verify` passa (typecheck + build + testes)
- [ ] Regra nova em `logic/` tem teste correspondente
- [ ] Mudou o tuning? Números do `npm run feel` antes e depois no PR
- [ ] Roteiro manual da etapa em `VERIFICACAO.md` executado
- [ ] Nenhum `console.log`/`debugger` fora das ferramentas de dev
- [ ] Nenhuma alocação por frame nova em render
- [ ] Recursos three liberados em `dispose()`

---

## 10. Depuração

| Ferramenta | Uso |
|---|---|
| `?debug=1` | FPS + painel: tick, modo, posição, velocidade, corda, mira, % de cliques sem alvo, hash, *draw calls* |
| `?level=N` / `?seed=N` | Nível e seed |
| `?cam=free` | Voo livre (MapControls: arrastar para mover, botão direito para girar, roda para zoom, setas) |
| `?slowmo=0.25` | Câmera lenta |
| `?hz=120` | Física a 120 Hz (compara estabilidade) |
| `?record=1` + F9 | Baixa os inputs gravados (JSON com `configHash`) |
| `?view=pose` | Visualizador de poses (teclas 1–8) |
| `?god=1` | Mísseis não acertam (run não ranqueado) |
| `?resetScores=1` | Apaga os recordes salvos ao abrir |
| N / J / K / R | Pula para a chegada / avança 60 m (no ar) / simula um acerto de míssil / volta ao checkpoint (run não ranqueado) |
| F1 | Wireframe das AABBs, lançadores com o círculo de alcance, checkpoints, raio de mira, âncora virtual → contato, vetor velocidade |
| F2 | lil-gui de tuning ao vivo |
| F3 / `.` | Congela a simulação / avança um tick |
| `window.__webSwing` | `getState()`, `hashState()`, `loadReplay(json)` no console |
| Painel `?debug=1` | Também mostra fase, tempo, ranqueado, impulso (valor, máximo, combo, ociosidade), mísseis vivos, estado de cada lançador (i/a/f/c), invulnerabilidade, acertos, quedas e os últimos 8 eventos |
