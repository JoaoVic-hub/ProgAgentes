import { describe, expect, it } from 'vitest'
import { distribuirCartas, finalizarMao, iniciarMao, jogarCarta } from '../src/hand'
import { montarTimes } from '../src/validate'
import { pedirValor, responderPedido } from '../src/pedido'
import { CartaNaoDisponivel, JogadaForaDeTurno, PedidoInvalido, ValorMaximoAtingido } from '../src/errors'
import type { Carta, MaoState, Naipe, Valor } from '../src/types'

function carta(valor: Valor, naipe: Naipe): Carta {
  return { id: `${String(valor)}-${naipe}`, valor, naipe }
}

function inici(nJogadores: 2 | 4 | 6, maos: Carta[][], virada: Carta): MaoState {
  return iniciarMao({ nJogadores, maos }, virada)
}

describe('distribuirCartas', () => {
  it('entrega 3 cartas por jogador e devolve o restante (FR-003)', () => {
    const baralho = Array.from({ length: 40 }, (_, i) => carta(((i % 7) + 4) as Valor, 'ouros'))
    const { maos, restante } = distribuirCartas(baralho, 4)
    expect(maos).toHaveLength(4)
    for (const mao of maos) expect(mao).toHaveLength(3)
    expect(restante).toHaveLength(40 - 4 * 3)
  })
})

describe('iniciarMao', () => {
  it('abre a mão no valor 1 com a manilha derivada da virada', () => {
    const virada = carta(6, 'paus')
    const m = inici(2, [[carta(4, 'ouros')], [carta(5, 'ouros')]], virada)
    expect(m.valor).toBe(1)
    expect(m.manilha).toEqual({ valor: 7 })
    expect(m.cartaVirada).toEqual(virada)
    expect(m.rodadaAtual).toBe(1)
    expect(m.rodadas).toHaveLength(0)
  })
})

describe('jogarCarta — validação de turno e disponibilidade', () => {
  it('rejeita jogada fora de turno com erro estável', () => {
    const m = inici(2, [[carta(4, 'ouros')], [carta(4, 'espadas')]], carta(6, 'paus'))
    expect(() => jogarCarta(m, 1, carta(4, 'espadas'))).toThrowError(JogadaForaDeTurno)
  })

  it('rejeita carta que não está na mão do jogador com erro estável', () => {
    const m = inici(2, [[carta(4, 'ouros')], [carta(4, 'espadas')]], carta(6, 'paus'))
    expect(() => jogarCarta(m, 0, carta(5, 'ouros'))).toThrowError(CartaNaoDisponivel)
  })
})

describe('valor da mão — cadeia 1→3→6→9→12 (FR-004/FR-005)', () => {
  it('sobe o valor somente via pedidos aceitos na ordem', () => {
    let m = inici(2, [[carta(4, 'ouros')], [carta(4, 'espadas')]], carta(6, 'paus'))
    m = pedirValor(m, 0, 'truco')
    m = responderPedido(m, 'aceitar')
    expect(m.valor).toBe(3)
    m = pedirValor(m, 0, 'seis')
    m = responderPedido(m, 'aceitar')
    expect(m.valor).toBe(6)
    m = pedirValor(m, 0, 'nove')
    m = responderPedido(m, 'aceitar')
    expect(m.valor).toBe(9)
    m = pedirValor(m, 0, 'doze')
    m = responderPedido(m, 'aceitar')
    expect(m.valor).toBe(12)
  })

  it('rejeita pedido que não é o próximo degrau da cadeia (PedidoInvalido)', () => {
    const m = inici(2, [[carta(4, 'ouros')], [carta(4, 'espadas')]], carta(6, 'paus'))
    expect(() => pedirValor(m, 0, 'seis')).toThrowError(PedidoInvalido)
  })

  it('rejeita pedido com pedido anterior ainda pendente (PedidoInvalido)', () => {
    let m = inici(2, [[carta(4, 'ouros')], [carta(4, 'espadas')]], carta(6, 'paus'))
    m = pedirValor(m, 0, 'truco')
    expect(() => pedirValor(m, 0, 'seis')).toThrowError(PedidoInvalido)
  })

  it('correr: o pedidor leva a mão pelo valor anterior', () => {
    let m = inici(2, [[carta(4, 'ouros')], [carta(4, 'espadas')]], carta(6, 'paus'))
    m = pedirValor(m, 0, 'truco')
    m = responderPedido(m, 'correr')
    expect(m.encerrada).toBe(true)
    expect(m.vencedorTime).toBe('time0')
    expect(m.nula).toBe(false)
    expect(m.pontos).toBe(1)
    expect(finalizarMao(m)).toEqual({ vencedorTime: 'time0', nula: false, pontos: 1 })
  })

  it('aumentar dispara o degrau seguinte e respeita o máximo de 12', () => {
    let m = inici(2, [[carta(4, 'ouros')], [carta(4, 'espadas')]], carta(6, 'paus'))
    m = pedirValor(m, 0, 'truco')
    m = responderPedido(m, 'aumentar')
    expect(m.pedidoPendente?.valorProposto).toBe(6)
    m = responderPedido(m, 'aceitar')
    expect(m.valor).toBe(6)
    m = pedirValor(m, 0, 'nove')
    m = responderPedido(m, 'aumentar')
    expect(m.pedidoPendente?.valorProposto).toBe(12)
    expect(() => responderPedido(m, 'aumentar')).toThrowError(ValorMaximoAtingido)
  })
})

describe('desfecho de mão por rodadas', () => {
  it('vence a mão quem ganha 2 das 3 rodadas', () => {
    const m0 = [carta('A', 'ouros'), carta('A', 'espadas'), carta('A', 'copas')]
    const m1 = [carta(4, 'ouros'), carta(4, 'espadas'), carta(4, 'copas')]
    let m = inici(2, [m0, m1], carta(6, 'paus'))
    m = jogarCarta(m, 0, carta('A', 'ouros'))
    m = jogarCarta(m, 1, carta(4, 'ouros'))
    expect(m.rodadas[0]?.resultado).toBe('time0')
    expect(m.encerrada).toBe(false)
    m = jogarCarta(m, 0, carta('A', 'espadas'))
    m = jogarCarta(m, 1, carta(4, 'espadas'))
    expect(m.encerrada).toBe(true)
    expect(m.vencedorTime).toBe('time0')
    expect(m.nula).toBe(false)
    expect(m.pontos).toBe(1)
    expect(finalizarMao(m)).toEqual({ vencedorTime: 'time0', nula: false, pontos: 1 })
  })

  it('rodada empatada (mesma força/manilha) anula a rodada (clarificação)', () => {
    const m0 = [carta(7, 'ouros'), carta(7, 'espadas'), carta(4, 'ouros')]
    const m1 = [carta(7, 'paus'), carta(7, 'copas'), carta(2, 'ouros')]
    let m = inici(2, [m0, m1], carta(6, 'paus'))
    m = jogarCarta(m, 0, carta(7, 'ouros'))
    m = jogarCarta(m, 1, carta(7, 'paus'))
    expect(m.rodadas[0]?.resultado).toBe('empate')
  })

  it('mão sem vencedor de 2 rodadas é nula e não pontua (clarificação)', () => {
    const m0 = [carta(7, 'ouros'), carta(7, 'espadas'), carta(4, 'ouros')]
    const m1 = [carta(7, 'paus'), carta(7, 'copas'), carta(2, 'ouros')]
    let m = inici(2, [m0, m1], carta(6, 'paus'))
    m = jogarCarta(m, 0, carta(7, 'ouros'))
    m = jogarCarta(m, 1, carta(7, 'paus'))
    m = jogarCarta(m, 0, carta(7, 'espadas'))
    m = jogarCarta(m, 1, carta(7, 'copas'))
    m = jogarCarta(m, 0, carta(4, 'ouros'))
    m = jogarCarta(m, 1, carta(2, 'ouros'))
    expect(m.nula).toBe(true)
    expect(m.encerrada).toBe(true)
    expect(m.vencedorTime).toBeNull()
    expect(finalizarMao(m)).toEqual({ nula: true, pontos: 0 })
  })
})

describe('montarTimes (FR-007/FR-008)', () => {
  it('monta 2, 4 e 6 jogadores com assentos alternados por time', () => {
    expect(montarTimes(2)).toEqual({ formato: '1x1', times: [[0], [1]] })
    expect(montarTimes(4)).toEqual({ formato: '2x2', times: [[0, 2], [1, 3]] })
    expect(montarTimes(6)).toEqual({ formato: '3x3', times: [[0, 2, 4], [1, 3, 5]] })
  })
})