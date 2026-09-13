# Implementation Plan: Jogo de Truco Brasileiro Multijogador

**Branch**: `001-brazilian-truco-game` | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-brazilian-truco-game/spec.md`

## Summary

Jogo digital de truco brasileiro para web e mobile (mesma base de código), com identidade
visual estilo Balatro e interface 100% em gírias do truco. Dois modos de conexão na v1:
partidas online em tempo real (cliente-servidor) e partidas contra bots de IA (incluindo
mesas mistas). Motor de regras puro e compartilhado (servidor e cliente), servidor
autoritativo Node.js + Socket.io hospedado na Render, persistência mista (SQLite na Render
para online; IndexedDB no dispositivo para partidas contra bots). Abordagem técnica
consolidada na [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (Node.js ≥ 20 + navegador moderno/WKWebView)

**Primary Dependencies**: Phaser 3 (engine/render), Vite (bundler/dev server), Capacitor
(empacotamento nativo Android/iOS), socket.io + socket.io-client (tempo real),
better-sqlite3 (persistência online), Vitest (testes)

**Storage**: SQLite no serviço da Render (partidas online e histórico); IndexedDB no
dispositivo do jogador (partidas contra bots e histórico)

**Testing**: Vitest — obrigatório para `packages/truco-rules` e camada de persistência
(SQLite/IndexedDB); camada de apresentação sem testes formais

**Target Platform**: Web (Chrome/Safari) + Android/iOS via Capacitor; servidor Node.js na
Render (plano gratuito, Linux)

**Project Type**: Monorepo npm workspaces — `apps/client` (Phaser), `apps/server`
(Node + Socket.io + SQLite), `packages/truco-rules` (biblioteca pura de regras)

**Performance Goals**: Estado online propagado em ≤1s (SC-003); ≥30fps em dispositivos de
entrada com animações e feedback sonoro (SC-006)

**Constraints**: Requerido pelo usuário — Phaser 3, Vite, Capacitor, Socket.io, Render free
(spin-down 15 min, ~1 min de reativação, disco efêmero) com feedback visual "acordando a
mesa..."; módulo de regras puro sem rede/UI; bots sem duplicação de lógica; poucas
dependências mantidas (constituição)

**Scale/Scope**: Protótipo v1 — 2, 4 ou 6 jogadores (1x1, 2x2, 3x3); partidas simples;
histórico básico de fim de partida; loc pt-BR

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **III. Cross-Platform Compatibility**: PASS — Phaser + Vite com a mesma base de código
  empacotada por Capacitor para Android/iOS; persistência local usa IndexedDB (padrão W3C,
  disponível em web e WebView), sem API exclusiva de plataforma.
- **IV. Minimal Dependencies**: PASS — dependências: Phaser, Vite, Capacitor, socket.io,
  better-sqlite3, Vitest; todas amplamente adotadas e mantidas.
- **II. Selective Testing**: PASS — Vitest cobre o módulo de regras e a persistência
  (lógica crítica da constituição); UI/animações/frases não exigem testes formais.
- **I. Simplicity and Readability**: PASS — três camadas claras (gameplay puro, rede/
  servidor, apresentação) conforme a constituição; sem otimizações prematuras.
- **Performance (entrada)**: PASS — alvo explícito de 30fps em dispositivos de entrada no
  SC-006; latência de reativação da Render tratada com feedback explícito.

Nenhuma violação de gate. **Complexity Tracking**: não preenchido (sem violações a
justificar).

## Project Structure

### Documentation (this feature)

```text
specs/001-brazilian-truco-game/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── rules-module.md
│   └── socket-events.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
truco/
├── package.json                # npm workspaces (client, server, truco-rules)
├── tsconfig.base.json          # config TS compartilhada
├── vitest.workspace.ts         # projetos de teste (via Vitest)

├── packages/
│   └── truco-rules/            # MÓDULO PURO DE REGRAS (shareable, sem rede/UI)
│       ├── package.json
│       ├── src/
│       │   ├── deck.ts         # baralho de 40, embaralhamento
│       │   ├── manilha.ts      # derivação da manilha cartas 8/9/10
│       │   ├── hand.ts         # estado da mão: rodadas, pedidos, desfecho
│       │   ├── score.ts        # pontuação por mão/partida (até 12)
│       │   ├── validate.ts     # validação de jogadas e pedidos
│       │   └── types.ts        # tipos compartilhados (Carta, Mão, PartidaState…)
│       └── tests/              # testes obrigatórios (Vitest)
│           ├── deck.test.ts
│           ├── manilha.test.ts
│           ├── hand.test.ts
│           └── score.test.ts

├── apps/
│   └── server/                 # SERVIDOR AUTORITATIVO (Node.js + Socket.io)
│       ├── package.json
│       ├── src/
│       │   ├── index.ts        # bootstrap, servidor HTTP + Socket.io
│       │   ├── rooms.ts        # salas/mesas, assentos, times (autoridade)
│       │   ├── gameplay.ts     # orquestra mãos via truco-rules
│       │   ├── bot-runner.ts   # bots que preenchem vagas online
│       │   └── db.ts           # SQLite: partida em andamento + histórico
│       └── tests/              # testes obrigatórios de persistência
│           └── db.test.ts

│   └── client/                 # CLIENTE (Phaser + Vite + Capacitor)
│       ├── package.json
│       ├── capacitor.config.ts
│       ├── index.html
│       ├── src/
│       │   ├── main.ts         # bootstrap da aplicação Phaser
│       │   ├── scenes/         # cenas Phaser (menu, sala, mesa, resultado)
│       │   ├── ui/             # UI, HUD, Banco de Frases, gírias
│       │   ├── fx/             # animações e feedback visual/sonoro
│       │   ├── net/            # socket client + detecção "acordando a mesa..."
│       │   ├── local/          # partida contra bots: truco-rules + bot-runner local
│       │   └── storage/        # IndexedDB: partidas contra bots + histórico
│       └── tests/              # testes de persistência local (IndexedDB)
│           └── storage.test.ts
```

**Structure Decision**: Monorepo npm workspaces com três pacotes (client, server,
truco-rules). O pacote `truco-rules` é a única camada de gameplay, importada tanto pelo
servidor (partidas online) quanto pelo cliente (partidas contra bots), garantindo uma única
implementação das regras para toda a validação de lógica crítica — alinhado às camadas
gameplay/rede/UI da constituição.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Nenhuma violação de gate identificada — seção não preenchida.