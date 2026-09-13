# Contract: Módulo de Regras do Truco (truco-rules)

**Branch**: `001-brazilian-truco-game` | **Date**: 2026-09-10 | **Plan**: [plan.md](../plan.md) |
**Data model**: [data-model.md](../data-model.md)

Contrato da biblioteca pura `packages/truco-rules` (sem rede, sem UI, sem dependências
externas). Usada pelo servidor (partidas online, autoridade) e pelo cliente (partidas
contra bots). Assinaturas apresentadas em pseudotipagem TypeScript. Este é o contrato com
maior exigência de testes automatizados (constituição).

## Princípios

- Funções determinísticas e puras: mesmo estado → mesma saída, sem efeitos colaterais.
- Nenhuma dependência de rede, I/O, timer ou UI dentro deste pacote.
- O daemon/estado é imutável (novas instâncias por passo) para facilitar reconciliação e
  reconexão.

## Tipos base

```ts
type Naipe = 'ouros' | 'espadas' | 'copas' | 'paus'
type Valor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 'A' | 'J' | 'Q' | 'K'
interface Carta { id: string; valor: Valor; naipe: Naipe }
interface Manilha { valor: Valor } /* as 4 cartas deste valor são manilhas */
interface Pedido = 'truco' | 'seis' | 'nove' | 'doze'
type RespostaPedido = 'aceitar' | 'correr' | 'aumentar'
```

## Funções públicas

### Baralho

- `criarBaralho(): Carta[]`
  Retorna as 40 cartas (sem 8, 9 e 10). Validação a testar (FR-001).
- `embaralhar(baralho: Carta[], semente?: number): Carta[]`
  Embaralhamento completo e determinístico (semente opcional para testes/registro).

### Manilha

- `definirManilha(cartaVirada: Carta): Manilha`
  Deriva a manilha da carta virada pela hierarquia oficial do truco brasileiro (FR-002):
  uma sequência circular fixa `4 → 5 → 6 → 7 → Q → J → K → A → 2 → 3 → 4`. A manilha é
  sempre a carta que vem imediatamente depois da carta virada nessa sequência, sem exceção
  por naipe — todas as 4 cartas do valor seguinte são manilhas:

  | Carta virada | Manilha (valor) |
  |--------------|-----------------|
  | 4            | 5 |
  | 5            | 6 |
  | 6            | 7 |
  | 7            | Q |
  | Q            | J |
  | J            | K |
  | K            | A |
  | A            | 2 |
  | 2            | 3 |
  | 3            | 4 |

  A implementação deve resolver a manilha como `SEQUENCIA[(indice(V) + 1) % 10]` para
  qualquer valor de carta virada, sem regra condicional por naipe.

### Mão / Rodadas

- `distribuirCartas(baralho: Carta[], nJogadores: number): { maos: Carta[][]; restante: Carta[] }`
  3 cartas por jogador (FR-003); falha se o baralho não tiver cartas suficientes.
- `iniciarMao(ctx: PartidaState, cartaVirada: Carta): MaoState`
  Cria a mão com valor inicial `1` e manilha derivada.
- `jogarCarta(m: MaoState, assento: number, carta: Carta): MaoState`
  Valida turno (ordem), validade da carta (na mão do jogador) e segueção de 1 carta/assento/
  rodada. Erro: jogada inválida (FR-015b — validação de jogadas).
- `avaliarRodada(m: MaoState, jogadas: {assento, carta}[]): RodadaResultado`
  Força das cartas com manilha; empate anula a rodada; devolve `time0 | time1 | empate`.
- `finalizarMao(m: MaoState): { vencedorTime?: 'time0'|'time1'; nula: boolean; pontos: number }`
  Vence quem tem 2 de 3 rodadas; `nula=true` (nenhum time pontua) quando não há vencedor
  (clarificação da spec).

### Pedidos / valor da mão

- `pedirValor(m: MaoState, pedido: Pedido): MaoState`
  Sobe o valor: `1→3 (truco), 3→6 (seis), 6→9 (nove), 9→12 (doze)`. Erro se pedido inválido
  para o valor atual.
- `responderPedido(m: MaoState, resposta: RespostaPedido): MaoState`
  - `aceitar`: valor vale o novo valor.
  - `correr`: o pedidor leva a mão pelo valor anterior (não pode aumentar além de 12).
  - `aumentar`: dispara novo pedido (seis/nove/doze), respeitando máximo 12 (FR-005).

### Pontuação / partida

- `aplicarPontos(p: PartidaScore, vencedorTime: 0|1, valorMao: number): PartidaScore`
  Soma o valor da mão ao time vencedor; mão nula não pontua.
- `verificarFim(p: PartidaScore): boolean`
  `true` quando algum time atinge 12 (FR-006), inclusive no meio de uma mão.

### Composição de mesa

- `montarTimes(nJogadores: 2|4|6): { formato: '1x1'|'2x2'|'3x3'; times: number[][] }`
  Define os times e assentos alternados (FR-007/FR-008): times opostos nunca adjacentes.

## Erros esperados (validação)

- `JogadaForaDeTurno`, `CartaNaoDisponivel`, `BaralhoInsuficiente`, `PedidoInvalido`,
  `ValorMaximoAtingido` — devem ser idiomas de erros estáveis para testes e mensagens de UI
  (ex.: "não quero", "corro").

## Critérios de teste (obrigatórios)

- Baralho: 40 cartas, sem 8/9/10, embaralhamento determinístico com semente.
- Manilha: a manilha segue a sequência circular fixa `4 → 5 → 6 → 7 → Q → J → K → A → 2 → 3`
  (carta imediatamente posterior à virada), válida para todos os valores de carta virada e
  sem exceção por naipe; teste de valor limite confirmando que 3 produz 4 e 4 produz 5.
- Valor da mão: toda a cadeia `1→3→6→9→12` + recusas (`correr`) + limite em 12.
- Mão nula e rodada empatada não pontuam (clarificação).
- Pontuação: soma correta e fim da partida em 12 (todo o caminho de pontuação).
- Validação: turno, cartas não disponíveis e pedidos inválidos falham com erro estável.