# Contract: Eventos Socket.io (Cliente ↔ Servidor)

**Branch**: `001-brazilian-truco-game` | **Date**: 2026-09-10 | **Plan**: [plan.md](../plan.md) |
**Data model**: [data-model.md](../data-model.md)

Contrato de mensagens entre o servidor autoritativo Node.js + Socket.io e os clientes
Phaser. O servidor é a única fonte de verdade do estado completo das mãos; o cliente recebe
apenas a própria mão e as informações públicas da mesa (spec FR-009).

## Princípios

- **Autoridade do servidor**: todas as ações de regra são validadas e executadas no
  servidor via `packages/truco-rules`; o cliente nunca decide resultado.
- **Visibilidade mínima**: o servidor jamais envia cartas de oponentes; cada cliente só vê
  sua mão, o estado público do jogo e os jogos na mesa conforme regra de jogo de cartas.
- **Reconexão**: mensagens são idempotentes/reconciliáveis pelo `partida_id` + `estado_id`
  (versão de estado) para retomada após queda (FR-018).
- **Frio da Render**: o cliente trata a latência inicial de reativação (spin-down ~15 min,
  ~1 min de wake) com o evento `server:booting` e feedback "acordando a mesa...".

## Eventos Cliente → Servidor

| Evento | Payload | Descrição |
|--------|---------|-----------|
| `room:create` | `{ formato: 2\|4\|6, nomeHost }` | Cria sala com assentos vagos; responde `room:state` |
| `room:join` | `{ codigo, nomeJogador }` | Entra na sala pelo código; responde `room:state` |
| `room:leave` | `{}` | Sai da sala (lobby) ou abandona a partida |
| `room:start` | `{ aceitarBots: boolean }` | Inicia a partida quando assentos estão preenchidos (humanos e/ou bots) |
| `play:card` | `{ partida_id, cartaId }` | Joga uma carta na rodada atual |
| `play:pedido` | `{ partida_id, pedido: 'truco'\|'seis'\|'nove'\|'doze' }` | Aumenta o valor da mão |
| `play:resposta` | `{ partida_id, resposta: 'aceitar'\|'correr'\|'aumentar' }` | Responde ao pedido do oponente |
| `play:frase` | `{ partida_id, fraseId }` | Dispara uma gíria do Banco de Frases (nunca texto livre — FR-013) |
| `reconnect:restore` | `{ partida_id, estado_id }` | Tenta restaurar estado após reconexão (FR-018) |

## Eventos Servidor → Cliente

| Evento | Payload | Descrição |
|--------|---------|-----------|
| `server:booting` | `{}` | Enviado na tentativa de conexão quando a Render está reativando (feedback "acordando a mesa...") |
| `room:state` | `{ partida_id, codigo, assentos[], estado }` | Estado público da sala/lobby (nomes, times, prontidão) |
| `game:state` | `{ partida_id, estado_id, vez_assento, valor_mao, placar, mesa[], mão_própria?, desfecho? }` | Estado público + própria mão do jogador (nunca cartas de terceiros) |
| `game:card` | `{ partida_id, assento, cartaPublica }` | Carta pública jogada na mesa (os demais veem a carta; quem joga já a conhece) |
| `game:pedido` | `{ partida_id, assento, pedido, novoValor }` | Anuncia pedido (truco/seis/nove/doze) |
| `game:rodada` | `{ partida_id, numero, resultado: 'time0'\|'time1'\|'empate' }` | Resultado da rodada (empate anula a rodada) |
| `game:mao` | `{ partida_id, desfecho: 'time0'\|'time1'\|'nula', valor, pontos }` | Fim da mão (mão nula não pontua) |
| `game:end` | `{ partida_id, vencedor, placar_final }` | Fim da partida (time atinge 12) |
| `game:absent` | `{ partida_id, assento, motivo: 'desconectado'\|'timeout' }` | Jogador ausente (queda ou 60 s de inatividade — FR-020); bot assume |
| `bot:assigned` | `{ partida_id, assento }` | Bot preencheu a vaga (mesa mista — FR-012) |
| `error` | `{ código: 'SALA_NAO_ENCONTRADA'\|'SALA_CHEIA'\|'ACAO_INVALIDA'\|..., mensagem }` | Erros de ação (mensagens em gíria, ex.: "corre não, sócio") |

## Payloads de referência

```jsonc
// game:state — exemplo (online, 2x2)
{
  "partida_id": "9f2c...",
  "estado_id": 42,                       // versão monotônica do estado
  "vez_assento": 3,
  "valor_mao": 6,
  "placar": { "time0": 6, "time1": 3 },
  "mesa": [ { "assento": 2, "carta": "7♠", "posicao": 0 } ],
  "mao_propria": [ "carta:1", "carta:2", "carta:3" ],
  "desfecho": null
}
```

## Fluxos-chave

1. **Criar/entrar em sala**: `room:create` ou `room:join` → `room:state` (lobby). Início
   aguarda assentos preenchidos (humanos ou bots — FR-012).
2. **Rodada**: `play:card` → servidor valida com `truco-rules` → broadcast `game:card` →
   `game:rodada` ao fechar a rodada.
3. **Pedidos**: `play:pedido` → `play:resposta` → `game:pedido` com novo valor (respeitando
   o máximo 12) ou `game:mao` quando há correr.
4. **Desconexão/ausência**: `game:absent` + `bot:assigned` quando um bot assume; reconexão
   tenta `reconnect:restore` com `estado_id` (FR-018/FR-020).
5. **Fim**: `game:end` → cliente persiste `HistóricoPartida` (online: SQLite no servidor;
   contra bots: IndexedDB no dispositivo).

## Contrato de persistência

- Partidas online: o servidor grava `partida em andamento` + `HistóricoPartida` em SQLite
  na Render (disco efêmero do plano gratuito — perda ocasional aceitável na v1).
- Partidas contra bots: o cliente grava o mesmo em IndexedDB, sem passar pelo servidor.