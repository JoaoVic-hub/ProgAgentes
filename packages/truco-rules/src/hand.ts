import { CartaNaoDisponivel, JogadaForaDeTurno } from './errors'
import { definirManilha, SEQUENCIA } from './manilha'
import { montarTimes, timeDoAssento } from './validate'
import type {
  Carta,
  Jogada,
  MaoState,
  PartidaState,
  Rodada,
  RodadaResultado,
  Valor,
} from './types'

export function distribuirCartas(
  baralho: Carta[],
  nJogadores: number,
): { maos: Carta[][]; restante: Carta[] } {
  const necessarias = nJogadores * 3
  if (baralho.length < necessarias) {
    throw new Error('Baralho insuficiente para distribuir as cartas')
  }
  const maos: Carta[][] = []
  for (let i = 0; i < nJogadores; i++) {
    maos.push(baralho.slice(i * 3, i * 3 + 3))
  }
  return { maos, restante: baralho.slice(necessarias) }
}

export function iniciarMao(ctx: PartidaState, cartaVirada: Carta): MaoState {
  return {
    valor: 1,
    cartaVirada,
    manilha: definirManilha(cartaVirada),
    maos: ctx.maos.map((mao) => [...mao]),
    rodadaAtual: 1,
    rodadas: [],
    jogadasAtuais: [],
    primeiroJogadorRodada: 0,
    pedidoPendente: null,
    encerrada: false,
    vencedorTime: null,
    nula: false,
    pontos: 0,
  }
}

function forcaCarta(carta: Carta, manilhaValor: Valor): number {
  if (carta.valor === manilhaValor) return 100
  const indice = SEQUENCIA.indexOf(carta.valor)
  if (indice === -1) {
    throw new Error('Valor de carta inválido')
  }
  return indice
}

function nJogadoresDe(m: MaoState): 2 | 4 | 6 {
  return m.maos.length as 2 | 4 | 6
}

function jogadorDaVez(m: MaoState): number {
  return (m.primeiroJogadorRodada + m.jogadasAtuais.length) % m.maos.length
}

function avaliarRodada(
  m: MaoState,
  jogadas: Jogada[],
): { resultado: RodadaResultado; assentoVencedor?: number } {
  let maiorForca = -1
  let vencedores: number[] = []
  for (const jogada of jogadas) {
    const forca = forcaCarta(jogada.carta, m.manilha.valor)
    if (forca > maiorForca) {
      maiorForca = forca
      vencedores = [jogada.assento]
    } else if (forca === maiorForca) {
      vencedores.push(jogada.assento)
    }
  }
  if (vencedores.length === 1) {
    const assento = vencedores[0]
    const time = timeDoAssento(nJogadoresDe(m), assento)
    return { resultado: time === 0 ? 'time0' : 'time1', assentoVencedor: assento }
  }
  return { resultado: 'empate' }
}

export function jogarCarta(m: MaoState, assento: number, carta: Carta): MaoState {
  if (m.encerrada) throw new JogadaForaDeTurno()
  if (assento !== jogadorDaVez(m)) throw new JogadaForaDeTurno()
  const maoDoJogador = m.maos[assento] ?? []
  if (!maoDoJogador.some((c) => c.id === carta.id)) throw new CartaNaoDisponivel()

  const proximo: MaoState = {
    ...m,
    maos: m.maos.map((mao, i) =>
      i === assento ? mao.filter((c) => c.id !== carta.id) : mao,
    ),
    jogadasAtuais: [...m.jogadasAtuais, { assento, carta }],
  }

  if (proximo.jogadasAtuais.length < proximo.maos.length) {
    return proximo
  }

  const avaliacao = avaliarRodada(proximo, proximo.jogadasAtuais)
  const rodada: Rodada = {
    numero: proximo.rodadaAtual,
    jogadas: proximo.jogadasAtuais,
    resultado: avaliacao.resultado,
  }
  const rodadas = [...proximo.rodadas, rodada]
  const vitoriasTime0 = rodadas.filter((r) => r.resultado === 'time0').length
  const vitoriasTime1 = rodadas.filter((r) => r.resultado === 'time1').length

  let vencedorTime: 'time0' | 'time1' | null = null
  if (vitoriasTime0 >= 2) vencedorTime = 'time0'
  else if (vitoriasTime1 >= 2) vencedorTime = 'time1'

  const nula = rodadas.length === 3 && vencedorTime === null
  const encerrada = vencedorTime !== null || nula

  return {
    ...proximo,
    rodadas,
    jogadasAtuais: [],
    rodadaAtual: proximo.rodadaAtual + 1,
    primeiroJogadorRodada: avaliacao.assentoVencedor ?? proximo.primeiroJogadorRodada,
    encerrada,
    vencedorTime,
    nula,
    pontos: encerrada && vencedorTime !== null ? proximo.valor : 0,
  }
}

export function finalizarMao(m: MaoState): {
  vencedorTime?: 'time0' | 'time1'
  nula: boolean
  pontos: number
} {
  if (m.encerrada) {
    if (m.nula) return { nula: true, pontos: 0 }
    return { vencedorTime: m.vencedorTime ?? 'time0', nula: false, pontos: m.pontos }
  }

  const rodadas = m.rodadas
  const vitoriasTime0 = rodadas.filter((r) => r.resultado === 'time0').length
  const vitoriasTime1 = rodadas.filter((r) => r.resultado === 'time1').length
  let vencedorTime: 'time0' | 'time1' | null = null
  if (vitoriasTime0 >= 2) vencedorTime = 'time0'
  else if (vitoriasTime1 >= 2) vencedorTime = 'time1'
  const nula = rodadas.length === 3 && vencedorTime === null
  if (nula) return { nula: true, pontos: 0 }
  if (vencedorTime === null) return { nula: false, pontos: 0 }
  return { vencedorTime, nula: false, pontos: m.valor }
}

export { timeDoAssento } from './validate'