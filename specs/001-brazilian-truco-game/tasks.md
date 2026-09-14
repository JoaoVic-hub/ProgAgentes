---

description: "Task list for Jogo de Truco Brasileiro Multijogador"

---

# Tasks: Jogo de Truco Brasileiro Multijogador

**Input**: Design documents from `specs/001-brazilian-truco-game/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Testes incluídos onde a constituição do projeto exige (módulo de regras e camada de persistência); camada de apresentação/UI sem testes formais.

**Organization**: Tarefas agrupadas por história de usuário para implementação e teste independentes. Labels de história seguem o spec.md (`US1`, `US3`, `US4`, `US5`, `US6` — a antiga US2 "Bluetooth" foi removida do escopo).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependências)
- **[Story]**: História de usuário a que a tarefa pertence (US1, US3, US4, US5, US6)
- Caminhos de arquivos exatos nos nomes das tarefas

## Path Conventions (monorepo npm workspaces)

- Raiz: `package.json`, `tsconfig.base.json`, `vitest.workspace.ts`
- Motor de regras: `packages/truco-rules/`
- Servidor autoritativo: `apps/server/`
- Cliente Phaser/Vite/Capacitor: `apps/client/`

---

## Phase 1: Setup (Infraestrutura Compartilhada)

**Purpose**: Inicialização do monorepo e estrutura básica dos três pacotes.

- [X] T001 [P] Criar monorepo npm workspaces em `package.json` raiz (`workspaces: ["apps/*","packages/*"]`) com scripts `dev:client`, `dev:server` e `test` (vitest run)
- [X] T002 [P] Configurar `tsconfig.base.json` raiz (TypeScript strict, NodeNext para packages) e `vitest.workspace.ts` com os projetos `truco-rules`, `server` e `client`
- [X] T003 [P] Scaffold `packages/truco-rules/package.json` (módulo puro, sem dependências externas) e `tsconfig.json`
- [X] T004 [P] Scaffold `apps/server/package.json` com deps socket.io, better-sqlite3 e `tsconfig.json`
- [X] T005 [P] Scaffold `apps/client/package.json` com deps phaser, vite, @capacitor/core/cli e `capacitor.config.ts` (appId/appName)
- [X] T006 [P] Instalar dependências do workspace e verificar bootstrap: `npm install`, `npm run dev:client` abre Vite e `npm run dev:server` escuta porta

---

## Phase 2: Foundational — Motor de Regras (`packages/truco-rules`)

**Purpose**: Motor puro de regras (baralho, manilha, mão/valor, pontuação, validação) — lógica crítica com testes obrigatórios (constituição). **BLOQUEIA todas as histórias.** Sem rede/UI nesta fase.

> Testes escritos ANTES da implementação (red → green). Contrato: [contracts/rules-module.md](contracts/rules-module.md), [data-model.md](data-model.md).

### Testes do Motor de Regras

- [X] T007 [P] Escrever testes de baralho em `packages/truco-rules/tests/deck.test.ts`: 40 cartas, sem 8/9/10 (FR-001), embaralhamento determinístico com semente
- [X] T008 [P] Escrever testes de manilha em `packages/truco-rules/tests/manilha.test.ts`: sequência circular fixa `4 → 5 → 6 → 7 → Q → J → K → A → 2 → 3 → 4`, manilha = carta imediatamente após a virada (`SEQUENCIA[(indice(V)+1)%10]`), sem exceção por naipe; casos-limite virada 3 → manilha 4 e virada 4 → manilha 5 (FR-002)
- [X] T009 [P] Escrever testes de mão/valor em `packages/truco-rules/tests/hand.test.ts`: 3 cartas e até 3 rodadas por mão (FR-003); valor `1→3→6→9→12` com aceitar/correr/aumentar e máximo 12 (FR-004/FR-005); mão sem vencedor de rodadas é NULA (ninguém pontua) e rodada empatada anula a rodada (clarificação da spec)
- [X] T010 [P] Escrever testes de pontuação em `packages/truco-rules/tests/score.test.ts`: soma do valor ao time vencedor, mão nula não pontua, fim de partida ao atingir 12 mesmo no meio de uma mão (FR-006)

### Implementação do Motor de Regras

- [X] T011 [P] Criar tipos base em `packages/truco-rules/src/types.ts`: `Naipe`, `Valor` (sem 8/9/10), `Carta {id,valor,naipe}`, `Manilha {valor}`, `Pedido`, `RespostaPedido`, `MaoState`, `PartidaScore`
- [X] T012 [P] Implementar `criarBaralho()` e `embaralhar(baralho, semente?)` em `packages/truco-rules/src/deck.ts`
- [X] T013 [P] Implementar `definirManilha(cartaVirada)` em `packages/truco-rules/src/manilha.ts` usando a sequência circular `[4,5,6,7,Q,J,K,A,2,3]` (carta após a virada, sem regra por naipe)
- [X] T014 [P] Implementar mão em `packages/truco-rules/src/hand.ts`: `iniciarMao`, `jogarCarta` (falha `JogadaForaDeTurno`/`CartaNaoDisponivel`), `avaliarRodada` (empate anula a rodada), `finalizarMao` (2 de 3 rodadas; `nula=true` sem vencedor)
- [X] T015 [P] Implementar pedidos em `packages/truco-rules/src/pedido.ts`: `pedirValor` (`1→3→6→9→12`, falha `PedidoInvalido`/`ValorMaximoAtingido`) e `responderPedido` (aceitar/correr/aumentar, respeitando máximo 12)
- [X] T016 [P] Implementar pontuação em `packages/truco-rules/src/score.ts`: `aplicarPontos` (mão nula não pontua) e `verificarFim` (≥12)
- [X] T017 [P] Implementar composição de mesa em `packages/truco-rules/src/validate.ts`: `montarTimes(2|4|6)` → `1x1|2x2|3x3` com parceiros de mesmo time em assentos alternados (FR-007/FR-008)
- [X] T018 Rodar suíte completa em `packages/truco-rules` (`npm test`) — todos os testes verdes

**Checkpoint**: Motor de regras testado e determinístico. Histórias podem começar (Phase 3+).

---

## Phase 3: User Story 1 — Partida solo contra bots (Priority: P1) ⭐ MVP

**Goal**: Jogar truco completo (até 12 pontos) contra bots no dispositivo, sem internet, com HUD básico (vez, placar, valor da mão) e persistência IndexedDB.

**Independent Test**: Abrir `apps/client` (`npm run dev`), criar partida "contra bots" e concluir uma partida inteira até 12 pontos, com histórico salvo no dispositivo (SC-001).

### Tests for User Story 1 (obrigatórios — persistência)

- [X] T019 [P] [US1] Escrever testes de persistência IndexedDB em `apps/client/tests/storage.test.ts`: escrever e restaurar estado de partida em andamento e gravar/ler `HistóricoPartida` de partida contra bots (FR-018/FR-019)

### Implementation for User Story 1

- [X] T020 [P] [US1] Implementar camada IndexedDB em `apps/client/src/storage/localdb.ts` (abrir DB, salvar/ler partida em andamento, append de histórico `{partida_id, modo:'bots', formato, vencedor, placar_final, concluida_em}`)
- [X] T021 [P] [US1] Implementar bot local em `apps/client/src/local/bot.ts`: escolhe carta/pedido básico usando `truco-rules` (heurística simples v1)
- [X] T022 [US1] Implementar orquestrador local em `apps/client/src/local/game.ts`: máquina de estados mão/rodada via `truco-rules` (distribui, define manilha, valida jogadas, controla turno e pedidos) e persiste via `localdb`
- [X] T023 [US1] Criar cena de menu em `apps/client/src/scenes/menu.ts`: criar partida contra bots com formato 2/4/6 e rótulos em gíria ("Contra Bots", "Duplas", "Trios")
- [X] T024 [US1] Criar cena de mesa em `apps/client/src/scenes/table.ts`: renderizar mão própria, cartas na mesa, indicador de vez, placar por time e valor da mão (HUD básico), com ações de jogar carta e pedir truco/quero/corro (FR-014)
- [X] T025 [US1] Configurar bootstrap em `apps/client/src/main.ts`: instância Phaser (`scale: RESIZE`, carregando as cenas menu/table)
- [X] T026 [US1] Integrar fim de partida: detectar 12 via `truco-rules`, anunciar vencedor (fluxo visual básico) e gravar `HistóricoPartida` no IndexedDB (FR-019)
- [X] T027 [US1] Rodar ponta a ponta em `apps/client` (`npm run dev`): concluir partida contra bots até 12 pontos sem falhas de regra (SC-001)

**Checkpoint**: US1 totalmente funcional e testável de forma independente (MVP).

---

## Phase 4: User Story 3 — Partida online em tempo real (Priority: P1)

**Goal**: Partidas online cliente-servidor (Socket.io) com servidor autoritativo na Render, estado público sincronizado, reconexão e camada SQLite. Depende da cena de mesa da US1 (reuso) e do motor (Phase 2).

**Independent Test**: Rodar `apps/server` e abrir o client em dois navegadores na mesma sala; jogar uma mão com estado (vez, placar, valor) espelhado em ≤1 s (SC-003).

### Tests for User Story 3 (obrigatórios — persistência)

- [ ] T028 [P] [US3] Escrever testes de persistência SQLite em `apps/server/tests/db.test.ts`: criar/restaurar partida online em andamento e gravar/ler `HistóricoPartida` (FR-018/FR-019)

### Implementation — Server

- [ ] T029 [P] [US3] Implementar `apps/server/src/db.ts`: SQLite via better-sqlite3 (tabelas `partida` e `historico`; aceitar disco efêmero da Render como premissa v1)
- [ ] T030 [P] [US3] Implementar `apps/server/src/rooms.ts`: salas por código, assentos/times via `montarTimes` do `truco-rules`, `room:create/join/leave/start`
- [ ] T031 [P] [US3] Implementar `apps/server/src/gameplay.ts`: orquestra mãos autoritativamente via `truco-rules`; cada cliente só recebe a própria mão + estado público (nunca cartas de oponentes)
- [ ] T032 [US3] Implementar `apps/server/src/index.ts`: Socket.io com os eventos `server:booting`, `room:*`, `play:card`, `play:pedido`, `play:resposta`, `game:*` conforme [contracts/socket-events.md](contracts/socket-events.md)
- [ ] T033 [US3] Implementar ausência/timeout em `apps/server/src/rooms.ts`: jogador inativo 60 s → `game:absent` + bot substituto (FR-020), com reconexão restaurando a posição via `estado_id` (FR-018)

### Implementation — Client

- [ ] T034 [P] [US3] Implementar cliente socket em `apps/client/src/net/socket.ts`: conexão, `room:join/code`, envio de ações e escuta dos broadcasts (`game:state`), com fila/retry
- [ ] T035 [P] [US3] Implementar cold start da Render em `apps/client/src/net/wake.ts`: detectar `server:booting` e exibir feedback "acordando a mesa..." em vez de tela travada
- [ ] T036 [US3] Adaptar `apps/client/src/scenes/table.ts` para partida online: renderizar estado via eventos, desabilitar ações fora da vez, atualizar valor da mão/placar via broadcast
- [ ] T037 [US3] Implementar reconexão em `apps/client/src/net/socket.ts`: `reconnect:restore` com `estado_id` e restauração do estado salvo do servidor
- [ ] T038 [US3] Testar fim a fim local: duas janelas jogam uma mão online; novo valor de mão refletido em ≤1 s (SC-002/SC-003)

**Checkpoint**: US3 funcional e testável de forma independente (US1 + US3 sem quebra).

---

## Phase 5: User Story 4 — Mesa mista com bots e jogadores reais (Priority: P2)

**Goal**: Preencher vagas com bots nas mesas online e misturar bots + humanos numa mesma partida (FR-012). Depende do bot-runner: servidor (online) e local (contra bots).

**Independent Test**: Sala online para 4 iniciada com 2 jogadores humanos — os 2 assentos vagos são ocupados por bots e a partida flui (FR-012).

- [ ] T039 [P] [US4] Implementar bot-runner de servidor em `apps/server/src/bot-runner.ts`: decide cartas/pedidos via `truco-rules` e age como um assento normal
- [ ] T040 [US4] Alterar `apps/server/src/rooms.ts` para aceitar `room:start { aceitarBots }` preenchendo vagas com bots de servidor e garantir mesas 2/4/6 com assentos alternados
- [ ] T041 [P] [US4] Exibir assentos com bot na sala online em `apps/client/src/scenes/menu.ts` e `apps/client/src/net/socket.ts` (rótulo "sócio é bot")
- [ ] T042 [US4] Habilitar mesas mistas locais em `apps/client/src/local/game.ts`: definir nº de humanos e preencher o restante com `local/bot.ts`
- [ ] T043 [US4] Validar ponta a ponta: sala online para 4 com 2 humanos inicia com 2 bots (US1/US3 intactas)

**Checkpoint**: US1, US3 e US4 funcionando.

---

## Phase 6: User Story 5 — Estado de jogo sempre visível (Priority: P2)

**Goal**: Toda partida destaca claramente quem joga, o placar de cada time, o valor da mão, com feedback visual e sonoro nos momentos-chave (FR-014/FR-015). Depende da cena de mesa (US1/US3).

**Independent Test**: Assistir a uma partida inteira e, a cada momento, afirmar corretamente quem joga, o placar e o valor da mão (SC-005).

- [ ] T044 [P] [US5] Implementar HUD de vez em `apps/client/src/ui/hud.ts`: marcação visual clara e não ambígua da vez atual (usada tanto em solo quanto online)
- [ ] T045 [P] [US5] Renderizar placar por time e valor da mão em destaque permanente no HUD (visíveis durante toda a mão)
- [ ] T046 [US5] Implementar feedback em `apps/client/src/fx/feedback.ts`: animação + som para pedido/aceite de truco, vitória de rodada e fechamento de mão (FR-015)
- [ ] T047 [US5] Validar: assistir partidas (solo e online) confirmando vez/placar/valor sempre identificáveis (SC-005)

**Checkpoint**: US5 integrada às partidas solo e online.

---

## Phase 7: User Story 6 — Identidade visual estilo Balatro e gírias do truco (Priority: P3)

**Goal**: Visual estilizado/vibrante (cartas expressivas, animações) e interface 100% com gírias do truco via Banco de Frases (FR-013/FR-016/FR-017). Depende da cena de mesa (US1/US3).

**Independent Test**: Navegar por uma partida inteira e confirmar que todos os rótulos/botões usam gírias do truco e que o visual é estilizado (não realista) (SC-007).

- [ ] T048 [P] [US6] Criar Banco de Frases em `apps/client/src/ui/phrases.ts`: catálogo estático pt-BR com as 5 categorias de [spec.md](spec.md) FR-013 ("Truco!", "Seis!", ..., "Tô com a manilha!", "Que mão de vaca!", "Só truco, sócio", etc.), selecionado por menu, nunca texto livre
- [ ] T049 [P] [US6] Implementar visual de cartas estilizado estilo Balatro em `apps/client/src/fx/cards.ts` (sprites/arte vibrante, animações de entrada) — sem aparência realista (FR-017)
- [ ] T050 [P] [US6] Implementar animação expressiva de destaque da manilha ("tô com a manilha") quando a manilha entra em jogo
- [ ] T051 [US6] Integrar menu de frases na mesa (`apps/client/src/ui/hud.ts`): frases de pedido/resposta disparam ações de regra (truco/seis/nove/doze/quero/corro) e demais são ambientação — em nenhum caso revelam naipe/valor real da mão (FR-013)
- [ ] T052 [US6] Validar qualitativo: navegar partida confirmando gírias autênticas e ausência de vazamento de info de cartas (SC-007)

**Checkpoint**: Todas as histórias funcionais.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Melhorias que atravessam as histórias, empacotamento móvel e pronto para produção na Render.

- [ ] T053 [P] Empacotar mobile com Capacitor em `apps/client` (`npx cap add android`, `npx cap add ios`, `npx cap sync` após `npm run build`) — mesma base web (constituição III)
- [ ] T054 [P] Publicar servidor na Render (plano gratuito): config de start (`npm run start` em `apps/server`), portbinding; validar "acordando a mesa..." ao reativar de spin-down (keep: client/wake.ts)
- [ ] T055 [P] Performance em dispositivos de entrada: auditar fps com animações/feedback ativos e mitigar custos visuais para ≥30 fps (SC-006)
- [ ] T056 [P] Endurecer validação server-side dos eventos Socket.io (códigos `SALA_NAO_ENCONTRADA`, `SALA_CHEIA`, `ACAO_INVALIDA`) garantindo que nenhum payload vaze cartas de oponentes
- [ ] T057 [P] Rodar [quickstart.md](quickstart.md) completo (cenários 1–7) e ajustar discrepâncias; atualizar plan/artefatos se necessário
  - [ ] T058 [P] Revisão final de pt-BR/gírias em toda a UI (FR-016) e limpeza de TODOs/lixo de código antes do commit

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: Depende do Setup — **BLOQUEIA todas as histórias**
- **US1 (Phase 3)**: Depende da Phase 2. Nenhuma dependência de outras histórias
- **US3 (Phase 4)**: Depende da Phase 2 e da cena de mesa `scenes/table.ts` criada na US1 (reuso)
- **US4 (Phase 5)**: Depende da US3 (bot-runner de servidor) e da US1 (bot-runner local)
- **US5 (Phase 6)**: Depende da US1 (HUD/cena de mesa) e aplica-se também à US3
- **US6 (Phase 7)**: Depende da US1/US3 (cena de mesa + frases)
- **Polish (Phase 8)**: Depende de todas as histórias desejadas concluídas

### User Story Dependencies

- **US1 (P1)**: começa após Phase 2 — núcleo do MVP, sem dependências
- **US3 (P1)**: começa após Phase 2; reusa `scenes/table.ts` da US1 (independência de teste preservada — duas janelas)
- **US4 (P2)**: após US1 e US3 (bots em ambos os lados)
- **US5 (P2)**: após US1 (e complementa US3)
- **US6 (P3)**: após US1/US3 (visual e frases na mesa)

### Within Each User Story

- Testes (onde exigidos) são escritos ANTES e precisam falhar antes da implementação
- Modelos/tipos antes de serviços; serviços antes de integração
- Histórias concluídas na ordem de prioridade (P1 → P2 → P3)

### Parallel Opportunities

- Todos os Setup [P] em paralelo
- Todos os [P] do motor de regras em paralelo (arquivos distintos: deck.ts, manilha.ts, hand.ts, pedido.ts, score.ts, validate.ts)
- Tests [P] do motor em paralelo (red) antes da implementação
- US1 e US3 em paralelo após a Phase 2 (times distintos de dev), desde que a US3 reutilize apenas contratos
- Models/storage [P] em paralelo dentro de cada história
- Polish [P] em paralelo após as histórias

---

## Parallel Example: User Story 1

```bash
# Testes de persistência (escrever primeiro — falham antes da implementação):
Task: "Testes de persistência IndexedDB em apps/client/tests/storage.test.ts"

# Modelos/camadas [P] juntos:
Task: "Camada IndexedDB em apps/client/src/storage/localdb.ts"
Task: "Bot local em apps/client/src/local/bot.ts"

# Depois, sequencial (dependem dos anteriores):
Task: "Orquestrador local em apps/client/src/local/game.ts"
Task: "Cena de mesa em apps/client/src/scenes/table.ts"
```

## Parallel Example: User Story 3

```bash
# Testes de persistência SQLite (red primeiro):
Task: "Testes em apps/server/tests/db.test.ts"

# Server [P]:
Task: "db.ts (SQLite)"
Task: "rooms.ts (salas)"
Task: "gameplay.ts (autoridade via truco-rules)"

# Client [P]:
Task: "socket.ts (cliente)"
Task: "wake.ts (feedback 'acordando a mesa...')"

# Depois, sequencial:
Task: "scenes/table.ts adaptado para online"
Task: "reconexão por estado_id"
```

---

## Implementation Strategy

### MVP First (US1 somente)

1. Phase 1: Setup
2. Phase 2: Foundational (motor de regras + testes) — CRÍTICO, bloqueia tudo
3. Phase 3: US1 (solo contra bots no dispositivo)
4. **PARE e VALIDE**: partida completa até 12 pontos no próprio dispositivo
5. Demo do MVP

### Incremental Delivery

1. Setup + Foundational → motor de regras testado
2. US1 → teste independente (partida contra bots) → demo/MVP
3. US3 → teste independente (partida online em duas janelas) → demo
4. US4 → mesas mistas (bots online + locais) → demo
5. US5 → HUD/feedback nos dois modos → demo
6. US6 → identidade visual + Banco de Frases → demo
7. Polish → Capacitor mobile + deploy Render + auditoria de performance/segs

### Parallel Team Strategy

Time único (protótipo): seguir o fluxo sequencial MVP-first. Com mais devs, após a Phase 2, divirjam US1 (client/Solo) e US3 (server + client/net), e depois integrem por cima da cena de mesa.

---

## Notes

- [P] tarefas = arquivos distintos, sem dependências entre si
- Label [USx] mapeia para a história do spec (`US1, US3, US4, US5, US6` — US2 removida do escopo)
- Testes exigidos pela constituição: motor de regras (`packages/truco-rules`) e persistência (SQLite/IndexedDB) — escrever em red, depois implementação verde
- Commit após cada tarefa/grupo lógico
- Parar nos checkpoints para validar cada história de forma independente
- Evitar tarefas vagas, conflito de arquivos ou dependências que quebrem a independência das histórias