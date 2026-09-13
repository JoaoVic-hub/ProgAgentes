import { ErroTruco } from './errors'

export interface Mesa {
  formato: '1x1' | '2x2' | '3x3'
  times: number[][]
}

export function montarTimes(nJogadores: 2 | 4 | 6): Mesa {
  if (nJogadores === 2) return { formato: '1x1', times: [[0], [1]] }
  if (nJogadores === 4) return { formato: '2x2', times: [[0, 2], [1, 3]] }
  if (nJogadores === 6) return { formato: '3x3', times: [[0, 2, 4], [1, 3, 5]] }
  throw new ErroTruco('AssentosInvalidos', 'Quantidade de jogadores deve ser 2, 4 ou 6')
}

export function timeDoAssento(nJogadores: 2 | 4 | 6, assento: number): 0 | 1 {
  const { times } = montarTimes(nJogadores)
  const indice = times.findIndex((time) => time.includes(assento))
  if (indice === -1) {
    throw new ErroTruco('AssentoInvalido', 'Assento inexistente na mesa')
  }
  return indice as 0 | 1
}