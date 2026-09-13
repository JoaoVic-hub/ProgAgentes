import { describe, expect, it } from 'vitest'
import { aplicarPontos, verificarFim } from '../src/score'
import type { PartidaScore } from '../src/types'

const novaPartida: PartidaScore = { time0: 0, time1: 0 }

describe('aplicarPontos', () => {
  it('soma o valor da mão ao time vencedor', () => {
    expect(aplicarPontos(novaPartida, 0, 3)).toEqual({ time0: 3, time1: 0 })
    expect(aplicarPontos({ time0: 9, time1: 8 }, 1, 3)).toEqual({ time0: 9, time1: 11 })
  })

  it('mão nula (valor 0) não altera o placar', () => {
    expect(aplicarPontos({ time0: 2, time1: 3 }, 0, 0)).toEqual({ time0: 2, time1: 3 })
  })

  it('não muta o placar original (estado imutável)', () => {
    const original: PartidaScore = { time0: 5, time1: 5 }
    aplicarPontos(original, 0, 6)
    expect(original).toEqual({ time0: 5, time1: 5 })
  })
})

describe('verificarFim (FR-006)', () => {
  it('retorna false enquanto nenhum time atingiu 12', () => {
    expect(verificarFim({ time0: 11, time1: 8 })).toBe(false)
  })

  it('retorna true quando um time atinge 12, inclusive no meio de uma mão', () => {
    expect(verificarFim({ time0: 12, time1: 5 })).toBe(true)
    expect(verificarFim({ time0: 11, time1: 12 })).toBe(true)
    expect(verificarFim({ time0: 12, time1: 12 })).toBe(true)
  })
})