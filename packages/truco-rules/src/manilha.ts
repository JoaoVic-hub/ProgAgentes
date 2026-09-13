import type { Carta, Manilha, Valor } from './types'

export const SEQUENCIA: Valor[] = [4, 5, 6, 7, 'Q', 'J', 'K', 'A', 2, 3]

export function definirManilha(cartaVirada: Carta): Manilha {
  const indice = SEQUENCIA.indexOf(cartaVirada.valor)
  if (indice === -1) {
    throw new Error('Valor de carta virada inválido para derivar a manilha')
  }
  return { valor: SEQUENCIA[(indice + 1) % SEQUENCIA.length] }
}