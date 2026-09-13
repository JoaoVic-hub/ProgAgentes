import { describe, expect, it } from 'vitest'
import { definirManilha } from '../src/manilha'
import type { Carta, Naipe, Valor } from '../src/types'

function carta(valor: Valor, naipe: Naipe): Carta {
  return { id: `${String(valor)}-${naipe}`, valor, naipe }
}

const casos: Array<{ virada: Valor; manilha: Valor }> = [
  { virada: 4, manilha: 5 },
  { virada: 5, manilha: 6 },
  { virada: 6, manilha: 7 },
  { virada: 7, manilha: 'Q' },
  { virada: 'Q', manilha: 'J' },
  { virada: 'J', manilha: 'K' },
  { virada: 'K', manilha: 'A' },
  { virada: 'A', manilha: 2 },
  { virada: 2, manilha: 3 },
  { virada: 3, manilha: 4 },
]

describe('definirManilha', () => {
  it.each(casos)('virada $virada → manilha $manilha (FR-002)', ({ virada, manilha }) => {
    expect(definirManilha(carta(virada, 'ouros'))).toEqual({ valor: manilha })
  })

  it('testa os valores limite da sequência (3 → 4 e 4 → 5)', () => {
    expect(definirManilha(carta(3, 'ouros'))).toEqual({ valor: 4 })
    expect(definirManilha(carta(4, 'ouros'))).toEqual({ valor: 5 })
  })

  it('não depende do naipe da carta virada (sem exceção por naipe)', () => {
    for (const naipe of ['ouros', 'espadas', 'copas', 'paus'] as const) {
      expect(definirManilha(carta(4, naipe))).toEqual({ valor: 5 })
    }
  })

  it('deriva sempre o valor imediatamente posterior na sequência circular', () => {
    const sequencia: Valor[] = [4, 5, 6, 7, 'Q', 'J', 'K', 'A', 2, 3]
    for (let i = 0; i < sequencia.length; i++) {
      const virada = sequencia[i]!
      const esperada = sequencia[(i + 1) % sequencia.length]!
      expect(definirManilha(carta(virada, 'espadas'))).toEqual({ valor: esperada })
    }
  })
})