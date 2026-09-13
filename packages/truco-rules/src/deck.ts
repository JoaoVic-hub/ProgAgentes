import { SEQUENCIA } from './manilha'
import type { Carta, Naipe, Valor } from './types'

export const VALORES: Valor[] = [...SEQUENCIA]

export const NAIPES: Naipe[] = ['ouros', 'espadas', 'copas', 'paus']

export function criarBaralho(): Carta[] {
  const cartas: Carta[] = []
  for (const valor of VALORES) {
    for (const naipe of NAIPES) {
      cartas.push({ id: `${String(valor)}-${naipe}`, valor, naipe })
    }
  }
  return cartas
}

function mulberry32(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function embaralhar(baralho: Carta[], semente?: number): Carta[] {
  const cartas = [...baralho]
  const aleatorio = semente === undefined ? Math.random : mulberry32(semente)
  for (let i = cartas.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    const tmp = cartas[i]
    cartas[i] = cartas[j]
    cartas[j] = tmp
  }
  return cartas
}