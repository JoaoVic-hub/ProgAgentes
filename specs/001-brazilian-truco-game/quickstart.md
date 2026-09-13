# Quickstart: Validação do Jogo de Truco Brasileiro

**Branch**: `001-brazilian-truco-game` | **Date**: 2026-09-10 | **Plan**: [plan.md](plan.md) |
**Contracts**: [rules-module.md](contracts/rules-module.md), [socket-events.md](contracts/socket-events.md) |
**Data model**: [data-model.md](data-model.md)

Guia de validação fim-a-fim. Cenários executáveis para provar que a feature funciona.
Detalhes de implementação pertencem a `tasks.md` e à fase de implementação.

## Pré-requisitos

- Node.js ≥ 20 e npm.
- Conta/credencial da Render (opcional para o cenário online em nuvem; para validação local
  o servidor roda `npm run dev:server`).
- Um navegador moderno (Chrome/Safari). Para mobile: Capacitor (Android/iOS) após build.

## Estrutura de comandos (projetos)

| Onde | Comando | O que faz |
|------|---------|-----------|
| raiz (workspace) | `npm install` | Instala client + server + truco-rules |
| `packages/truco-rules` | `npm test` | Vitest: regras (deck, manilha, mão, pontuação, validação) |
| `apps/server` | `npm run dev` | Sobe o servidor Socket.io + SQLite (para testes online locais) |
| `apps/client` | `npm run dev` | Dev server Vite (app Phaser) |
| `apps/client` | `npm run build && npx cap sync` | Build web + empacotamento Capacitor Android/iOS |

## Cenários de validação

### 1. Regras — testes automatizados (obrigatório)

- Comando: `npm test` em `packages/truco-rules`.
- Esperado: suíte verde cobrindo baralho (40, sem 8/9/10), manilha por carta virada,
  valor `1→3→6→9→12`, recusas/corridas, limite em 12, mão nula, rodada empatada, fim de
  partida em 12 e validações de turno/cartas.
- Referência: [rules-module.md](contracts/rules-module.md) (critérios de teste).

### 2. Persistência — testes automatizados (obrigatório)

- Comando: `npm test` em `apps/server` (SQLite) e em `apps/client` (IndexedDB).
- Esperado: estado da partida em andamento + `HistóricoPartida` persistidos e restaurados
  em ambos os lados; reconexão restaura pelo `estado_id`.
- Referência: [data-model.md](data-model.md) (HistóricoPartida), [socket-events.md](contracts/socket-events.md).

### 3. Partida contra bots (solo) — fim a fim

1. Rode `apps/client` (`npm run dev`), abra `http://localhost:5173`.
2. Crie partida "contra bots", formato 1x1 (ou 2x2 misto).
3. Jogue mãos até um time chegar a 12.
- Esperado: todas as regras aplicadas localmente (mesmo motor), feedback visual/sonoro nos
  momentos-chave, gírias na UI, fim de partida com o histórico salvo em IndexedDB.

### 4. Partida online — fim a fim (local)

1. `apps/server` → `npm run dev` (Socket.io).
2. Abra o client em **duas abas/navegadores** e entre na mesma sala pelo código.
3. Jogue uma mão entre as duas abas.
- Esperado: estado (vez, placar, cartas na mesa, valor da mão) propagado em ≤1 s; cada
  cliente só vê a própria mão; reconexão ao recarregar restaura a partida.

### 5. Frio da Render ("acordando a mesa...")

1. Com a credencial da Render, implante o servidor free e deixe 15+ min sem uso.
2. Abra o client e entre numa sala.
- Esperado: após a conexão ser iniciada, o client exibe o feedback "acordando a mesa..."
  (sem travar em tela escura) enquanto o serviço reativa (~1 min); a sala segue normal.

### 6. Ausência de jogador (timeout/desconexão)

1. Numa partida online, deixe um jogador inativo por 60 segundos.
2. Feche o navegador de outro jogador no meio da mão.
- Esperado: `game:absent` avisa a mesa e um bot assume a posição (FR-012/FR-020); ao
  reconectar, o jogador retorna à posição se o estado ainda permitir (FR-018).

### 7. Mesas mistas

1. Crie uma sala online para 4 e inicie com 2 jogadores humanos.
- Esperado: as 2 vagas restantes são preenchidas por bots (FR-012) e a partida flui com
  humanos + bots misturados.

## Cobertura de critérios de sucesso

| Criterio | Cenário |
|----------|---------|
| SC-001 (partida contra bots ≤15 min) | Cenário 3 |
| SC-002 (sala online inicia ≤1 min) | Cenários 4/7 |
| SC-003 (estado online ≤1 s) | Cenário 4 |
| SC-004 (regras 100% corretas) | Cenário 1 |
| SC-005 (vez e valor da mão claros) | Cenários 3–4 |
| SC-006 (≥30 fps em dispositivos de entrada) | Cenários 3–4 + build mobile Capacitor |
| SC-007 (gírias autênticas) | Cenários 3–4 (avaliação qualitativa com jogadores) |