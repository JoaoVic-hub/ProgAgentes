# ADR — Decisões de Arquitetura (web-swing)

## Índice

1. [ADR-001: Camadas isoladas + teste de arquitetura](#adr-001-camadas-isoladas--teste-de-arquitetura)
2. [ADR-002: Lógica 100% pura e estado serializável](#adr-002-lógica-100-pura-e-estado-serializável)
3. [ADR-003: Determinismo por seed + hash de estado](#adr-003-determinismo-por-seed--hash-de-estado)
4. [ADR-004: Timestep fixo de 60 Hz + interpolação no render](#adr-004-timestep-fixo-de-60-hz--interpolação-no-render)
5. [ADR-005: three.js (WebGLRenderer) sem assets externos](#adr-005-threejs-webglrenderer-sem-assets-externos)
6. [ADR-006: Física própria com Vec3 própria](#adr-006-física-própria-com-vec3-própria)
7. [ADR-007: Câmera lógica: a mira é o raio da câmera](#adr-007-câmera-lógica-a-mira-é-o-raio-da-câmera)
8. [ADR-008: Corda PBD em subpassos, com reel por subpasso](#adr-008-corda-pbd-em-subpassos-com-reel-por-subpasso)
9. [ADR-009: Âncora virtual](#adr-009-âncora-virtual)
10. [ADR-010: Colisão por varredura em eixos, por último no tick](#adr-010-colisão-por-varredura-em-eixos-por-último-no-tick)
11. [ADR-011: Assistência de mira](#adr-011-assistência-de-mira)
12. [ADR-012: Animação procedural pura](#adr-012-animação-procedural-pura)
13. [ADR-013: UI em DOM sobre o canvas](#adr-013-ui-em-dom-sobre-o-canvas)
14. [ADR-014: Ferramentas de dev só em desenvolvimento](#adr-014-ferramentas-de-dev-só-em-desenvolvimento)
15. [ADR-015: Anti-spam de teia (swing mínimo)](#adr-015-anti-spam-de-teia-swing-mínimo)
16. [ADR-016: Tuning de feel medido (histórico)](#adr-016-tuning-de-feel-medido-histórico)
17. [ADR-017: Pontuação — limiares de velocidade adaptados](#adr-017-pontuação--limiares-de-velocidade-adaptados)
18. [ADR-018: Máquina de fases da campanha](#adr-018-máquina-de-fases-da-campanha)
19. [ADR-019: Vãos, gruas e alcançabilidade garantida](#adr-019-vãos-gruas-e-alcançabilidade-garantida)
20. [ADR-020: Recordes — parse robusto, versão e backup](#adr-020-recordes--parse-robusto-versão-e-backup)
21. [ADR-021: Replay dourado com configHash](#adr-021-replay-dourado-com-confighash)

---

## ADR-001: Camadas isoladas + teste de arquitetura

**Status:** Aceito  
**Data:** 2026-09-24

### Contexto
Mesma necessidade do snake-duel: testar regras sem navegador e trocar o render sem tocar nas regras. O snake-duel escorregou nisso: `render/renderer.ts` importa `computeTickMs`, um valor de `logic/engine`.

### Decisão
Pastas sob `src/`:

| Pasta | Papel |
|---|---|
| `logic/` | Regras puras. |
| `app/` | Cola pura e testável (relógio, flags, câmera, interpolação). |
| `render/` | three.js. |
| `input/` | Pointer lock e teclado. |
| `ui/` | DOM. |

- `main.ts` e `pose-viewer.ts` são os únicos arquivos que conhecem todas as camadas.
- `render/`, `input/` e `ui/` só fazem `import type` de `logic/`.
- **Exceção:** `logic/math/*`, que são funções puras e sem estado.
- `src/architecture.test.ts` lê o código-fonte cru (`import.meta.glob ?raw`) e reprova violações. Isso foi validado plantando violações de propósito.

### Consequências
- ✅ A regra deixa de depender de disciplina: o teste quebra.
- ⚠️ O teste é baseado em regex: `import { type X }` inline conta como import de valor (por isso o GUIDELINES exige `import type`).

---

## ADR-002: Lógica 100% pura e estado serializável

**Status:** Aceito  
**Data:** 2026-09-24

### Decisão
- `step(state, input) → novo estado`, sem mutar argumentos.
- Nada de `Math.random`, `Date.now`, `performance.now`, DOM, `console` ou three em `logic/`.
- O estado é composto de objetos simples. O `Level` é imutável e compartilhado por referência entre estados.
- Os eventos do tick (`GameEvent[]`) saem no estado para o render, o áudio e a pontuação (Etapa 2) consumirem.

### Consequências
- ✅ Replays, testes do tipo "mesmos inputs → mesmo hash" e *fuzz* de colisão ficam triviais.
- ⚠️ Há alocação por tick (objetos novos). O custo medido é desprezível para um único jogador.

---

## ADR-003: Determinismo por seed + hash de estado

**Status:** Aceito  
**Data:** 2026-09-24

### Decisão
- PRNG Mulberry32 (copiado do snake-duel), com seed fixa por nível ou `?seed=N`.
- `hashState` usa FNV-1a sobre o JSON do estado dinâmico e aparece no painel de debug.
- `?record=1` + F9 baixa os inputs com o `configHash`.

### Consequências
- ✅ A mesma seed gera a mesma cidade e os mesmos inputs geram o mesmo run.
- ⚠️ O determinismo é garantido no **mesmo motor JS**: `Math.sin`/`Math.cos` podem diferir no último bit entre motores. Replays de referência devem ser gravados no Chrome/V8.

---

## ADR-004: Timestep fixo de 60 Hz + interpolação no render

**Status:** Aceito  
**Data:** 2026-09-24

### Contexto
O loop do snake-duel tem acumulador e `maxCatchUpTicks = 5`, mas não limita o delta nem descarta o excesso. Ao voltar de uma aba em segundo plano, o jogo "acelera" por vários frames.

### Decisão
`app/clock.ts` (puro):
- delta limitado a 250 ms;
- no máximo 5 ticks por frame (proporcional em `?hz=120`);
- **o excesso é descartado**;
- `alpha = acc/dt` interpola a posição do jogador entre o tick anterior e o atual.

O `visibilitychange` e a perda do pointer lock pausam o jogo. As durações ficam em segundos na config e são convertidas para ticks, para que `?hz=120` não mude a sensação.

### Consequências
- ✅ O movimento fica suave a 144 Hz e a física não depende do FPS.
- ✅ O comportamento é testado: com delta de 10 s, roda 5 ticks e zera o acumulador.

---

## ADR-005: three.js (WebGLRenderer) sem assets externos

**Status:** Aceito  
**Data:** 2026-09-24

### Decisão
- `three ~0.186.0` com `WebGLRenderer` (o WebGPU ainda não compensa aqui) e sombras `PCFShadowMap`.
- Prédios: um `InstancedMesh` para os comuns e outro para os de vidro, com janelas geradas no shader (`onBeforeCompile`) a partir da posição de mundo. O padrão vira média quando a janela fica menor que cerca de 2 px (`fwidth`), o que evita moiré.
- Texturas da rua e da faixa de chegada geradas em `CanvasTexture`, a partir de um padrão fixo (determinístico).
- Imports nomeados de `'three'` (*tree-shaking*). Addons via `three/addons/*` e import dinâmico.

### Consequências
- ✅ Bundle de ~150 kB gzip. O jogo funciona offline e não tem questões de licença de assets.
- ⚠️ O shader injetado depende dos nomes de *chunks* do three (`#include <begin_vertex>`, `<emissivemap_fragment>`). Rever a cada upgrade do three.

---

## ADR-006: Física própria com Vec3 própria

**Status:** Aceito  
**Data:** 2026-09-24

### Contexto
Rapier e cannon-es guardam estado mutável próprio, o que não combina com `step(state) → state` nem com testes em Node sem WASM. O mundo aqui é simples: AABBs estáticas e um único corpo dinâmico com uma restrição de corda.

### Decisão
- `logic/math/vec3.ts` (vetores imutáveis) e `logic/math/geom.ts` (slab raio × AABB, sobreposição, ponto mais próximo entre segmento e raio).
- Integração por Euler semi-implícito.
- Unidades em m, s e m/s. Y para cima, a avenida corre em +Z. `yaw = 0` olha para +Z.

### Consequências
- ✅ Tudo é testável e determinístico, sem dependências.
- ⚠️ Quem mexer na física precisa manter os testes de invariantes (túnel, corda ≤ L, energia).

---

## ADR-007: Câmera lógica: a mira é o raio da câmera

**Status:** Aceito  
**Data:** 2026-09-24

### Decisão
- O input entrega o *look* absoluto (yaw/pitch) em cada tick.
- A lógica calcula o pivô sobre o ombro (`logic/camera-rig.ts`) e mira pelo raio que sai dele, que corresponde ao centro da tela.
- O render usa o *look* ao vivo (sem latência) e só suaviza a posição do pivô (`app/camera-follow.ts`).
- O ponto real da âncora aparece como marcador 3D.

**Revisão (Etapa 1):**
- **Pivô seguro:** o ombro fica 0,6 m à direita e o corpo tem 0,35 m de meia-largura. Encostado numa fachada à direita, o pivô ingênuo entrava no prédio: a câmera ia para dentro da parede e a mira atravessava para o prédio de trás. `safeCameraPivot` sonda da cabeça até o ombro e encurta o deslocamento. Mira e câmera usam esse pivô, e o acerto direto também exige linha de visada livre a partir do peito.
- **Feed-forward:** o filtro exponencial ficava v/k atrás do alvo (≈ 2,7 m a 20 m/s), desalinhando o retículo em 4–6°. A câmera agora mira à frente pelo atraso exato do filtro discreto, e o atraso em velocidade constante vai a zero em 30, 60 e 144 fps (há teste).
- **Braço da câmera:** com uma parede muito perto, a câmera encosta na frente dela (limite de 0,15 m) em vez de ser empurrada para dentro.

### Consequências
- ✅ O que o jogador vê no retículo é o que a física usa, inclusive em alta velocidade e colado em paredes.

---

## ADR-008: Corda PBD em subpassos, com reel por subpasso

**Status:** Aceito  
**Data:** 2026-09-24

### Contexto
Medido com o pêndulo sem arrasto: a projeção de posição (PBD) a 60 Hz perdia **9,1%** da energia em meio período (4,7% a 120 Hz; 2,4% a 240 Hz). A perda é proporcional ao passo.

Em seguida, um teste de "anexo não teleporta" revelou um bug. O auto-reel encurtava a corda de uma vez só antes da projeção, e isso virava um tranco de **60 m/s** num único subpasso.

### Decisão
- `integrateRope` roda gravidade + reel + projeção em `web.ropeSubsteps = 4` subpassos dentro do tick.
- O reel encurta a corda um pouco a cada subpasso e acelera em rampa (`reelRampTime = 0,15 s`) após o anexo.
- A corda é anexada com `L = distância atual`, então não há salto no anexo.
- O comprimento-alvo mantém o fundo do arco pelo menos 2,1 m acima da rua.

**Revisão (Etapa 1): corda "catraca".** A revisão adversarial mediu a corda **frouxa em 42% dos ticks**, com trancos de até **23 m/s num único tick**. Isso acontecia no fim do reel (o jogador seguia para dentro, a corda afrouxava e depois esticava de uma vez) e quando a colisão impedia o jogador de acompanhar a esfera. A correção:
- em cada subpasso, a corda recolhe a folga (`L = min(L, distância)`, com mínimo de `minRope`);
- se o tick começa com a distância maior que L (a parede segurou o jogador), a corda **cede** até a distância real em vez de converter o déficit em velocidade;
- o reel desacelera perto do alvo (`reelSlowdown`);
- a teia lançada do chão recolhe no ritmo do *zip* de saída (`groundReel` = 14 m/s), e a lançada no ar, no ritmo suave (`autoReel` = 6 m/s).

Os testes cobrem isso: `|Δv| ≤ 3 m/s` por tick e folga ≤ 5 cm num swing a partir da rua, e déficit sem tranco. Os dois testes reprovam com o modelo antigo (checado por mutação).

### Consequências
- ✅ A energia se conserva dentro de 5% (há teste). O anexo não mexe na posição (há teste). Não há mais trancos.
- ⚠️ Sem as perdas dos trancos, os swings ficaram mais rápidos. O tuning foi recalibrado (ADR-016).
- ✅ O custo é desprezível: aritmética de 4 subpassos para um único corpo.

---

## ADR-009: Âncora virtual

**Status:** Aceito  
**Data:** 2026-09-24

### Contexto
Um pêndulo sempre passa **por baixo** do ponto de apoio, e as quinas ficam nas fachadas (x = ±meia-largura). O piloto automático mostrou que todo swing levava o jogador para dentro do recuo das fachadas, e ele batia (*bonk*) na esquina do prédio seguinte. Os jogos do gênero resolvem isso com um "ponto de swing" que não coincide com a geometria.

### Decisão
- No anexo, o apoio físico é deslocado no eixo X (largura da avenida) em direção ao jogador, por `web.lateralPull = 0,8` da distância lateral.
- `Rope.anchor` é o ponto físico. `Rope.contact` é onde a teia grudou, e é até lá que a linha é desenhada.
- Valores comparados com o piloto (`npm run feel`): 0,6 → 6 *bonks* no L1; 0,8 → 0 *bonks*, sem tocar a rua.

### Consequências
- ✅ O arco segue a avenida e alternar os lados funciona como esperado.
- ⚠️ O comprimento visual da teia varia um pouco durante o arco. Ninguém percebe em movimento.
- ⚠️ A decisão assume uma avenida ao longo de Z. Níveis com curvas exigiriam deslocar a âncora na direção da normal da fachada.

---

## ADR-010: Colisão por varredura em eixos, por último no tick

**Status:** Aceito  
**Data:** 2026-09-24

### Decisão
- A caixa do jogador (0,7 × 1,8 × 0,7 m) é varrida na ordem Y → X → Z, em subpassos de no máximo 0,3 m.
- Todo sólido tem pelo menos 1 m de espessura (invariante do gerador). Com isso não há túnel nem a 60 m/s.
- A colisão roda **depois** da corda: a parede sempre vence.
- `moveAndCollide(pos, disp, vel)` recebe o deslocamento (vindo da corda em subpassos) separado da velocidade final.
- Beirais de até 1,2 m são escalados automaticamente.
- Impacto contra parede acima de 22 m/s gera *bonk*.

### Consequências
- ✅ Um teste de *fuzz* (2.700 ticks com inputs pseudoaleatórios no L1 real) não termina nenhum tick dentro de um sólido.
- ⚠️ Não há rampas nem superfícies inclinadas: só caixas, o que é suficiente para a cidade.

---

## ADR-011: Assistência de mira

**Status:** Aceito  
**Data:** 2026-09-24

### Decisão
Em ordem de prioridade:
1. Raio direto num prédio ancorável.
2. Acerto na fachada até 10 m abaixo do topo sobe para a quina.
3. Se o raio direto não serve, a melhor quina de telhado voltada para a avenida num cone de 8° (depois 20°).
   - Pontuação do candidato: ângulo, distância preferida de 28 m e "para a frente".
   - Exige linha de visada livre.
   - Rejeita candidatos a mais de 100° do olhar no plano horizontal.
   - Histerese: o alvo anterior ganha 3° a mais de cone e só troca se o novo for 0,2 ponto melhor.
4. O clique sem alvo fica pendente por 0,15 s.

### Consequências
- ✅ O retículo não "pisca" e o jogador erra menos por detalhe de pixel.
- ⚠️ Nível de assistência configurável fica para a Etapa 5.

---

## ADR-012: Animação procedural pura

**Status:** Aceito  
**Data:** 2026-09-24

### Decisão
- `render/character/pose.ts` e `animator.ts` não importam three (o teste de arquitetura garante).
  - Poses: ângulos de junta por estado.
  - Animador: máquina de estados, com crossfade exponencial independente de FPS.
- O `bodyPitch` do flip é interpolado pelo menor ângulo, para não "desgirar".
- `rig.ts` monta a hierarquia de `Group`s, aplica a pose, inclina o corpo em direção à teia e aponta o braço direito para o contato.

### Consequências
- ✅ As poses são testáveis em Node (periodicidade, joelho nunca invertido, sem NaN).
- ⚠️ O boneco tem cerca de 17 malhas (e ~17 *draw calls* a mais, contando a sombra). Se precisar, dá para fundir numa única malha com *skinning* manual (Etapa 6).

---

## ADR-013: UI em DOM sobre o canvas

**Status:** Aceito  
**Data:** 2026-09-24

### Decisão
- Overlay, retículo, painel de debug e (Etapas 2–3) HUD e telas em HTML/CSS dentro de `#ui`.
- O `#ui` tem `pointer-events: none`; só os cartões clicáveis reativam.
- O pointer lock só é pedido no gesto do usuário (botão).
- Cliques só contam depois que o lock é confirmado, para que o clique que retoma não dispare a teia.

### Consequências
- ✅ Texto nítido, acessível e fácil de estilizar.
- ⚠️ Atualizar o DOM por frame tem custo: os componentes só escrevem quando o conteúdo muda.

---

## ADR-014: Ferramentas de dev só em desenvolvimento

**Status:** Aceito  
**Data:** 2026-09-24

### Decisão
- `app/flags.ts` só lê a query string quando `import.meta.env.DEV` é verdadeiro. No build de produção as flags são ignoradas, e F1/F2 (wireframes e lil-gui) são eliminados como código morto.
- `tools/autopilot.feel.ts` (`npm run feel`) mede o *feel* com um piloto automático. Ele **não** é teste de CI: a heurística é frágil a mudanças de tuning e serve para comparar variantes.

- Os `import()` de dev (pose-viewer, debug-panel/stats, MapControls) são condicionados a `DEV && flag`, uma condição estática. Assim o Rollup os remove: o `dist/` só contém o jogo.
- Em DEV, `window.__webSwing.loadReplay(json)` reexecuta uma gravação do F9 (`logic/replay.ts`, com teste de ida e volta) e diz se a config bate. Se o tuning mudar durante a gravação, ela é marcada como `reproducible: false`.

### Consequências
- ✅ O tuning é iterável ao vivo (F2 → "Copiar JSON" → `logic/config.ts`) e mensurável (`npm run feel`).

---

## ADR-015: Anti-spam de teia (swing mínimo)

**Status:** Aceito
**Data:** 2026-09-24

### Contexto
A revisão reproduziu um exploit. Cliques de 1 tick a ~7,5 Hz, mais Espaço, levavam o jogador de y = 10 a y = 95 m em 3 s e a 50 m/s, acima do teto do swing. Cada soltura dava boost e abria o flip, e cada teia nova dava direito a um impulso.

### Decisão
- `web.minSwingTime = 0,35 s`. Teia presa por menos tempo não dá boost na soltura, não abre a janela de flip e não permite impulso.
- O flip só abre com a soltura **no ar**.
- Um pulo zera a janela de flip, então o flip não vira pulo duplo.
- O evento `web_released` informa `reason` (manual / above / wall) e `fullSwing`, que a pontuação da Etapa 2 vai usar.

### Consequências
- ✅ Há teste: 3 s de spam não sobem mais que 15 m nem passam do teto de velocidade.
- ⚠️ Toques muito curtos na teia (< 0,35 s) só servem para mudar de direção, sem ganho de energia.

---

## ADR-016: Tuning de feel medido (histórico)

**Status:** Aceito (1º swing de ~29 m/s aceito pelo dono do projeto em 2026-09-24)
**Data:** 2026-09-24

### Contexto
A tabela de tuning inicial do plano era um palpite. O GUIDELINES (Princípio V) pede que mudanças de *feel* venham com medição. Todos os números abaixo vêm de `npm run feel`.

### Histórico
| Rodada | Mudança | L1: 1º swing / cruzeiro / rua / *bonks* |
|---|---|---|
| Plano | `autoReel` 15, `pump` 6, `swingAssist` 2,5, boost 2–6, `swingMax` 48, sem âncora virtual | não concluía o L1 (bonks nas fachadas) |
| 1 | Âncora virtual `lateralPull` 0,6 | 36 / 40,5 / 0 / 6 |
| 2 | `lateralPull` 0,8, arrasto 0,005, `pump` 3, `assist` 1,5, boost 1–4, `swingMax` 42, `autoReel` 12 | 35 / 35,4 / 0 / 0 |
| 3 | Corda catraca (ADR-008): sem as perdas dos trancos, a velocidade sobe | 32 / 39,7 / 1 / 1 |
| 4 (atual) | arrasto 0,007, `autoReel` 6 (ar), `groundReel` 14 (saída do chão), pulinho 5, `pump` 2, `assist` 0,8, boost 1–3, `swingMax` 36 | 29 / 32,8 / 0 / 0 (5/5 níveis) |

Variantes descartadas na rodada 4, com números medidos:
- `autoReel` 6 também na saída do chão: o 1º arco arrasta 45 ticks no asfalto. Reprovado pelo teste "anexar a partir da rua…".
- `swingMax` 36 com `autoReel` 7 (variante "B"): não concluía o L4.

### Consequências
- ✅ Cruzeiro e toques na rua dentro das metas. Os 5 níveis são concluídos pelo piloto.
- ✅ O 1º swing a partir do repouso fica em 28–36 m/s (meta original: 18–22). Decisão (2026-09-24): **aceito** — o "zip" forte de saída é o preço de não raspar a rua (PRD §7).

---

## ADR-017: Pontuação — limiares de velocidade adaptados

**Status:** Aceito
**Data:** 2026-09-24

### Contexto
O plano (§2) dava +50% no anel a partir de 28 m/s e +100% a partir de 40 m/s, e a sequência de velocidade a 28 m/s. Depois do retuning da Etapa 1 (ADR-016), o teto no balanço é 36 m/s e o cruzeiro fica em 26–33 m/s. Com 40 m/s, o bônus cheio só existiria em queda livre.

### Decisão
- Os limiares viraram configuração (`scoring` em `logic/config.ts`): **26 m/s** (+50%), **34 m/s** (+100%) e sequência de velocidade a **26 m/s**.
- O resto segue o plano: anel 100/400 pts, swing 10, soltura perfeita 50, flip 100/200, sequência 40; multiplicador +0,5 a cada 4 eventos, até ×5; quebras em > 150 ms na rua, > 1,2 s num teto, 3 s sem evento, bonk ou queda.
- O anel renova o timer do combo mas não soma no chain. Swing só conta com teia presa ≥ 0,35 s (o mesmo mínimo do anti-spam, ADR-015).

### Consequências
- ✅ O bônus de velocidade existe no jogo real (cruzeiro → +50%; pico do arco → +100%).
- ⚠️ Mudou o tuning de velocidade? Revise estes limiares junto.

---

## ADR-018: Máquina de fases da campanha

**Status:** Aceito
**Data:** 2026-09-24

### Decisão
- `GamePhase`: countdown → playing ⇄ respawning; playing → level_complete | level_failed | game_over; e victory. Fonte da verdade única, como no ADR-007 do snake-duel.
- `engine.step` só despacha pela fase. `logic/progression.ts` faz o resto: countdown, queda, anéis, combo, checkpoints e chegada.
- As fases **terminais não avançam em `step()`**. Só a cola sai delas: Enter → `advanceAfterLevel` / `restartLevel`; fim de run → placar → `createRun`.
- `logic/player/simulate.ts` é o tick físico da Etapa 1, sem mudança de comportamento: os 119 testes anteriores passaram sem alteração, exceto 1 (as gruas ancoram).
- Atalhos de debug (N/K/R) e `?god=1` são funções puras e marcam o run como não ranqueado.

### Consequências
- ✅ Toda a campanha é testável em Node (13 testes de progressão) e reproduzível (replay dourado).
- ⚠️ A UI de transição da Etapa 2 é mínima (faixa central + Enter). As telas completas vêm na Etapa 3.

---

## ADR-019: Vãos, gruas e alcançabilidade garantida

**Status:** Aceito
**Data:** 2026-09-24

### Contexto
O plano pede vãos sem chão a partir do L3, com gruas ancoráveis, e um teste de **alcançabilidade**: a cada 5 m, do meio da avenida a 15 m de altura, precisa existir âncora à frente entre 8 e 45 m.

### Decisão
- **Vãos:** espaçados no miolo do nível. A rua vira segmentos; nenhum prédio invade o vão; as paredes invisíveis descem abaixo de `killY`.
- **Gruas:** torres de 3 × 3 m logo fora do corredor da avenida (o corredor continua livre), alternando os lados, com no máximo ~28 m entre elas.
- **Vidro frente a frente proibido:** o teste de alcançabilidade achou **60 m sem nenhuma âncora no L4**, com vidro dos dois lados. A regra "nunca dois vidros seguidos" só valia no mesmo lado. Agora um prédio não pode ser de vidro se o prédio em frente também for.
- **Checkpoints:** igualmente espaçados; se um cai num vão, vai para 15 m antes dele.
- **Anéis:** rota suave (senoides de fase sorteada) com folga ≥ raio + 1,5 m das fachadas e ≥ raio + 1 m da rua.
- A ordem de consumo do PRNG mantém a cidade do L1 idêntica à da Etapa 1. O L2 mudou onde a regra do vidro se aplicou.

### Consequências
- ✅ Os 5 níveis passam no teste de alcançabilidade, inclusive sobre os vãos.
- ⚠️ **O par (3ª estrela) é provisório.** O piloto automático não mira anéis, então não serve para calibrá-lo. As rotas passam a 3–10 m dos centros e na faixa de altura das trajetórias, portanto são pegáveis com mira. Calibrar com partidas reais.

---

## ADR-020: Recordes — parse robusto, versão e backup

**Status:** Aceito
**Data:** 2026-09-24

### Decisão
- `logic/highscores.ts` (puro):
  - top 10;
  - empate → data mais antiga;
  - nome saneado (1–12 caracteres, sem controle);
  - melhor por nível que só melhora.
- `logic/save-data.ts`:
  - `parseSaveData` **nunca lança**; JSON corrompido ou versão futura → padrão, com o status;
  - migração do formato legado (v0);
  - números não finitos descartados.
- `storage/store.ts`:
  - localStorage com queda para memória (aba anônima, storage bloqueado);
  - só strings, sem regras.
- `app/save.ts` (cola pura, recebe o store por parâmetro):
  - chave `web-swing:v1:save`;
  - o conteúdo ruim vai para `…save.bak` antes de ser substituído;
  - runs não ranqueados não entram.
- A data vem do main (`Date.now()`), nunca da lógica.
- O melhor por nível é salvo a cada nível concluído (não depende de terminar a campanha).

### Consequências
- ✅ Save corrompido não quebra o jogo (verificado no navegador), e nada se perde em silêncio.

---

## ADR-021: Replay dourado com configHash

**Status:** Aceito
**Data:** 2026-09-24

### Decisão
- `tools/golden.gen.ts` (`npm run golden`): o piloto automático joga o L1 desde o countdown até concluir. A gravação vai para `src/logic/__fixtures__/replay-l1.json` com:
  - os inputs comprimidos em RLE (2.076 ticks → 32 trechos, 3,9 kB);
  - o `configHash`;
  - o resultado esperado (pontos, anéis, estrelas, hash do estado).
- `src/logic/golden.test.ts` reproduz e exige o mesmo estado final. Se a config mudou, falha com a mensagem para rodar `npm run golden`.
- As gravações do jogo (`?record=1` + F9) usam o mesmo formato (v2) e são reproduzíveis por `window.__webSwing.loadReplay`. Os atalhos N/K/R e o tuning pelo F2 marcam a gravação como `reproducible: false`.

### Consequências
- ✅ Qualquer mudança acidental de física, pontuação, progressão ou determinismo quebra o teste. Verificado: mudar `pump` em 0,5% já quebra.
- ⚠️ Toda mudança intencional de tuning exige regravar (é o objetivo).

---

## Como registrar novos ADRs

Acrescente `ADR-NNN` neste arquivo (próximo número), com **Status, Data, Contexto, Decisão, Consequências**, e referencie no `CHANGELOG.md`.
