export type Naipe = 'ouros' | 'espadas' | 'copas' | 'paus'

export type Valor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 'Q' | 'J' | 'K' | 'A'

export interface Carta {
  id: string
  valor: Valor
  naipe: Naipe
}

export interface Manilha {
  valor: Valor
}

export type Pedido = 'truco' | 'seis' | 'nove' | 'doze'

export type RespostaPedido = 'aceitar' | 'correr' | 'aumentar'

export type ResultadoTime = 'time0' | 'time1'

export type RodadaResultado = ResultadoTime | 'empate'

export type Time = 0 | 1

export interface Jogada {
  assento: number
  carta: Carta
}

export interface Rodada {
  numero: number
  jogadas: Jogada[]
  resultado: RodadaResultado
}

export interface PedidoPendente {
  assento: number
  valorProposto: number
}

export interface MaoState {
  valor: number
  cartaVirada: Carta
  manilha: Manilha
  maos: Carta[][]
  rodadaAtual: number
  rodadas: Rodada[]
  jogadasAtuais: Jogada[]
  primeiroJogadorRodada: number
  pedidoPendente: PedidoPendente | null
  encerrada: boolean
  vencedorTime: ResultadoTime | null
  nula: boolean
  pontos: number
}

export interface PartidaState {
  nJogadores: number
  maos: Carta[][]
}

export interface PartidaScore {
  time0: number
  time1: number
}