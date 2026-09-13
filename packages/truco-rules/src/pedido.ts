import { PedidoInvalido, ValorMaximoAtingido } from './errors'
import { timeDoAssento } from './validate'
import type { MaoState, Pedido, RespostaPedido } from './types'

const DEGRAUS: Array<{ pedido: Pedido; de: number; para: number }> = [
  { pedido: 'truco', de: 1, para: 3 },
  { pedido: 'seis', de: 3, para: 6 },
  { pedido: 'nove', de: 6, para: 9 },
  { pedido: 'doze', de: 9, para: 12 },
]

export function pedirValor(m: MaoState, assento: number, pedido: Pedido): MaoState {
  if (m.encerrada || m.pedidoPendente) throw new PedidoInvalido()
  const degrau = DEGRAUS.find((d) => d.de === m.valor && d.pedido === pedido)
  if (!degrau) throw new PedidoInvalido()
  return { ...m, pedidoPendente: { assento, valorProposto: degrau.para } }
}

export function responderPedido(m: MaoState, resposta: RespostaPedido): MaoState {
  const pendente = m.pedidoPendente
  if (!pendente) throw new PedidoInvalido()

  if (resposta === 'aceitar') {
    return { ...m, valor: pendente.valorProposto, pedidoPendente: null }
  }

  if (resposta === 'correr') {
    const nJogadores = m.maos.length as 2 | 4 | 6
    const timeDoPedidor = timeDoAssento(nJogadores, pendente.assento)
    return {
      ...m,
      encerrada: true,
      vencedorTime: timeDoPedidor === 0 ? 'time0' : 'time1',
      nula: false,
      pontos: m.valor,
      pedidoPendente: null,
    }
  }

  if (pendente.valorProposto === 12) throw new ValorMaximoAtingido()
  const proximo = DEGRAUS.find((d) => d.de === pendente.valorProposto)
  if (!proximo) throw new PedidoInvalido()
  return { ...m, pedidoPendente: { ...pendente, valorProposto: proximo.para } }
}