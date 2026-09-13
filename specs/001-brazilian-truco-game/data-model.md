# Data Model: Jogo de Truco Brasileiro Multijogador

**Branch**: `001-brazilian-truco-game` | **Date**: 2026-09-10 | **Plan**: [plan.md](plan.md) |
**Spec**: [spec.md](spec.md)

Modelo derivado da seção "Entidades-Chave" da spec. Persistência mista: **SQLite**
(servidor/Render, partidas online) e **IndexedDB** (dispositivo, partidas contra bots).

## Entidades

### Partida

Reúne jogadores e bots em uma disputa até 12 pontos.

| Campo | Tipo | Regras / Validação |
|-------|------|--------------------|
| id | string (uuid) | único; gerado na criação da mesa |
| modo | enum | `online` \| `bots` |
| formato | enum | `1x1` \| `2x2` \| `3x3` (derivado de 2/4/6 jogadores) |
| estado | enum | `lobby` → `em_andamento` → `concluida` |
| placar | time → pontos | soma de pontos; vence o primeiro a atingir 12 (FR-006) |
| criada_em / concluida_em | ISO datetime | preenchida ao concluir |
| vencedor_time | time? | nula até a conclusão |
| persistencia | enum | `servidor_sqlite` (online) \| `indexeddb` (bots) |

Transições: `lobby → em_andamento` (todos os assentos preenchidos); `em_andamento →
concluida` (time atinge 12 pontos, inclusive no meio de uma mão — FR-006).

### Mesa / Assento

Posição ordenada de um jogador ao redor da mesa.

| Campo | Tipo | Regras / Validação |
|-------|------|--------------------|
| partida_id | FK → Partida | obrigatório |
| posicao | int (0..5) | único por partida; define a ordem de turno |
| time_idx | int | times dos parceiros ocupam posições alternadas (FR-008) |
| jogador_ref | string | internação: id de sessão (humano) ou `bot:<id>` |
| status | enum | `humano` \| `bot` |

Validações: partida `1x1` tem 2 assentos (times 1x1); `2x2` tem 4 (2+2); `3x3` tem 6 (3+3)
(FR-007). Parceiros do mesmo time ficam em posições alternadas (nunca adjacentes).

### Jogador

Participante humano (online) ou bot de IA.

| Campo | Tipo | Regras / Validação |
|-------|------|--------------------|
| id | string | id de sessão/código nome (sem contas na v1) |
| tipo | enum | `humano` \| `bot` |
| nome_exibicao | string | livre, pt-BR |
| sessao | string? | vínculo de conexão (online); nula para bots |

Sem contas obrigatórias na v1 (premissa da spec); no modo online o jogador entra por código
de sala/convite.

### Time / Parceria

Grupo de jogadores do mesmo lado.

| Campo | Tipo | Regras / Validação |
|-------|------|--------------------|
| partida_id | FK → Partida | obrigatório |
| indice | int | 0 ou 1 |
| pontos | int | 0..12; ao atingir 12, partida encerra |

Escala conforme o formato: 1 integrante (1x1), 2 (2x2), 3 (3x3).

### Mão

Disputa atual de até 3 rodadas.

| Campo | Tipo | Regras / Validação |
|-------|------|--------------------|
| id | string (uuid) | único |
| partida_id | FK → Partida | obrigatório |
| valor | enum | `1` (padrão) → `3` → `6` → `9` → `12` (FR-004) |
| carta_virada | Carta | define a manilha da mão (FR-002) |
| manilha | { valor, naipe } | derivado da carta virada pela hierarquia oficial |
| rodadas_fechadas | int | 0..3 (FR-003) |
| desfecho | enum? | `time0` \| `time1` \| `nula` (clarificação: mão nula não pontua) |

Transições: `aberta → em_disputa → fechada`. Valor sobe apenas via pedidos aceitos:
`1 → 3 → 6 → 9 → 12`; acima de 12 não é permitido (FR-005). Desfecho "nula" quando não há
vencedor de 2 rodadas (1x1 + rodada nula) — nenhum time pontua (clarificação da spec).

### Rodada

Uma jogada de carta por assento dentro de uma mão.

| Campo | Tipo | Regras / Validação |
|-------|------|--------------------|
| mão_id | FK → Mão | obrigatório |
| numero | int (1..3) | sequencial |
| jogadas | lista { assento, carta } | uma carta por assento, jogadas em ordem de turno |
| resultado | enum? | `time0` \| `time1` \| `empate` (empate de mesma força/naipe de manilha anula a rodada) |

O vencedor da maioria das rodadas (2 de 3) leva a mão.

### Carta

| Campo | Tipo | Regras / Validação |
|-------|------|--------------------|
| valor | enum | 1..7, A, J, Q, K (baralho de 40, sem 8/9/10 — FR-001) |
| naipe | enum | `ouros`, `espadas`, `copas`, `paus` |
| forca | int | hierarquia de truco (3 > 2 > A > K > J > Q > 7 > 6 > 5 > 4); manilhas acima de tudo |
| posicao_atual | enum | `mao` \| `mesa` \| `virada` (definição da manilha) |

### Banco de Frases

Catálogo estático de UI com as gírias do truco (FR-013/FR-016).

| Campo | Tipo | Regras / Validação |
|-------|------|--------------------|
| id | string | único (slug, ex: `aumento-pra-seis`) |
| categoria | enum | `pedido_resposta`, `parceiro`, `reacao`, `manilha`, `blefe` |
| texto | string | gíria predefinida em pt-BR |

Regras: selecionável por menu, nunca texto livre; nenhuma frase revela naipe/valor real da
mão do jogador; frases de pedido/resposta podem disparar ações de regra (truco/seis/nove/
doze/quero/corro), as demais são apenas ambientação visual/sonora (ficam na camada de UI).

### HistóricoPartida

Registro consultável de partida concluída (FR-019).

| Campo | Tipo | Regras / Validação |
|-------|------|--------------------|
| id | string | único |
| partida_id | FK → Partida | refere a partida concluída |
| modo | enum | `online` \| `bots` |
| formato | enum | `1x1` \| `2x2` \| `3x3` |
| vencedor | string | nome do vencedor / descrição do time |
| placar_final | time → pontos | ex: `{ time0: 12, time1: 5 }` |
| concluida_em | ISO datetime | quando a partida terminou |

Persistência: SQLite (online, na Render — disco efêmero do plano gratuito pode perder dados
entre reinicializações, aceitável para v1) ou IndexedDB (contra bots, no dispositivo).

## Relacionamentos

- `Partida 1—N Mesa/Assento` (assentos da mesa)
- `Partida 1—2 Time` (dois times parelhos)
- `Partida 1—N Mão` (mãos sucessivas até 12 pontos)
- `Mão 1—3 Rodada` (até 3 rodadas por mão)
- `Rodada 1—N jogada{assento,carta}` (uma jogada por assento)
- `Partida 1—1 HistóricoPartida` (registro ao concluir)

## Regras de negócio críticas (para testes)

1. Baralho: 40 cartas, sem 8/9/10; embaralhamento completo antes de cada mão (FR-001).
2. Manilha: derivada da carta virada pela hierarquia oficial (FR-002).
3. Mão: 3 cartas por jogador, até 3 rodadas (FR-003).
4. Valor da mão: `1 → 3 → 6 → 9 → 12`; aceitar/correr/aumentar; máximo 12 (FR-004/FR-005).
5. Pontuação: vence a partida quem somar 12 primeiro (FR-006); mão nula não pontua;
   empate de rodada anula a rodada (clarificação).
6. Mesas: 2/4/6 jogadores → 1x1/2x2/3x3; assentos alternados por time (FR-007/FR-008).
7. Persistência: estado em andamento + histórico (FR-018/FR-019); online no servidor,
   contra bots no dispositivo (clarificação).