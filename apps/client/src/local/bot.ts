import type { Carta, MaoState, Pedido, RespostaPedido, Valor } from 'truco-rules'

const FORCE_TOP: Valor[] = [3, 2, 'A', 'K', 'J']

function forca(carta: Carta, manilha: Valor): number {
  if (carta.valor === manilha) return 100
  const idx = FORCE_TOP.indexOf(carta.valor)
  if (idx !== -1) return 50 + idx
  return FORCE_TOP.length - FORCE_TOP.indexOf(carta.valor)
}

function cartasFortes(mao: Carta[], manilha: Valor): number {
  return mao.filter((c) => forca(c, manilha) >= 50 || c.valor === manilha).length
}

export function escolherCartaBot(
  mao: Carta[],
  manilha: Valor,
  rodadasVencidas: number,
  rodadasPerdidas: number,
): Carta {
  const ranked = [...mao].sort((a, b) => forca(a, manilha) - forca(b, manilha))
  const precisaoVencer = rodadasVencidas === 1
  const decisiva = rodadasPerdidas === 1
  if (decisiva) return ranked[ranked.length - 1]
  if (precisaoVencer) return ranked[ranked.length - 1]
  return ranked[0]
}

export function botQuerPedirValor(
  mao: Carta[],
  manilha: Valor,
  valorAtual: number,
  pontuacaoBot: number,
): Pedido | null {
  const qtd = cartasFortes(mao, manilha)
  if (valorAtual >= 9) return null
  const chance = qtd >= 2 ? 0.5 : qtd === 1 ? 0.25 : 0.05
  if (Math.random() > chance) return null
  if (valorAtual === 1) return 'truco'
  if (valorAtual === 3) return 'seis'
  if (valorAtual === 6) return 'nove'
  return 'doze'
}

export function responderPedidoBot(
  manilha: Valor,
  mao: Carta[],
  valorAtual: number,
  valorProposto: number,
  pontuacaoBot: number,
): RespostaPedido {
  const qtd = cartasFortes(mao, manilha)
  if (valorProposto >= 12) {
    return qtd >= 1 && Math.random() > 0.3 ? 'aceitar' : 'correr'
  }
  if (qtd >= 2) return Math.random() > 0.2 ? 'aumentar' : 'aceitar'
  if (qtd === 1) return Math.random() > 0.5 ? 'aceitar' : 'correr'
  return Math.random() > 0.7 ? 'aceitar' : 'correr'
}
