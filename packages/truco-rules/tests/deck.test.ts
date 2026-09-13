import { describe, expect, it } from 'vitest'
import { criarBaralho, embaralhar } from '../src/deck'

describe('criarBaralho', () => {
  it('cria exatamente 40 cartas (FR-001)', () => {
    const baralho = criarBaralho()
    expect(baralho).toHaveLength(40)
  })

  it('não contém 8, 9 e 10 (FR-001)', () => {
    const baralho = criarBaralho()
    for (const carta of baralho) {
      expect(carta.valor).not.toBe(8)
      expect(carta.valor).not.toBe(9)
      expect(carta.valor).not.toBe(10)
    }
  })

  it('gera ids únicos (cada carta exatamente uma vez)', () => {
    const baralho = criarBaralho()
    expect(new Set(baralho.map((c) => c.id)).size).toBe(40)
  })
})

describe('embaralhar', () => {
  it('é determinístico com a mesma semente', () => {
    const baralho = criarBaralho()
    const a = embaralhar(baralho, 42).map((c) => c.id)
    const b = embaralhar(baralho, 42).map((c) => c.id)
    expect(a).toEqual(b)
  })

  it('não modifica o baralho de origem', () => {
    const baralho = criarBaralho()
    const original = baralho.map((c) => c.id)
    embaralhar(baralho, 7)
    expect(baralho.map((c) => c.id)).toEqual(original)
  })

  it('produz ordens diferentes com sementes diferentes', () => {
    const baralho = criarBaralho()
    const a = embaralhar(baralho, 1).map((c) => c.id)
    const b = embaralhar(baralho, 2).map((c) => c.id)
    expect(a).not.toEqual(b)
  })
})