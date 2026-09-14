import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { montarTimes, type Pedido } from 'truco-rules'
import { JogoSolo } from '../src/local/game'
import { escolherCartaBot, responderPedidoBot } from '../src/local/bot'
import { lerPartidaAtual, listarHistorico } from '../src/storage/localdb'

beforeEach(() => {
  ;(globalThis as { indexedDB?: unknown }).indexedDB = new IDBFactory()
})

async function jogarPartidaCompleta(nJogadores: 2 | 4 | 6): Promise<JogoSolo> {
  const jogo = new JogoSolo(nJogadores, 0)
  await jogo.iniciarPartida()

  let passos = 0
  while (jogo.situacaoAtual !== 'fim' && passos < 200000) {
    if (jogo.minhaVez) {
      const manilha = jogo.manilhaAtual
      if (jogo.possoPedir && Math.random() > 0.5) {
        const valor = jogo.valorMaoAtual
        const pedido: Pedido = valor === 1 ? 'truco' : valor === 3 ? 'seis' : valor === 6 ? 'nove' : 'doze'
        await jogo.pedirTrucoHumano(pedido)
      } else {
        const carta = escolherCartaBot(jogo.minhaMao, manilha?.valor ?? 5, 0, 0)
        await jogo.jogarCartaHumano(carta.id)
      }
    } else if (jogo.devoResponder) {
      const pendente = jogo.pedidoPendenteAtual
      const manilha = jogo.manilhaAtual
      if (!pendente || !manilha) throw new Error('Pedido pendente sem manilha')
      const resposta = responderPedidoBot(
        manilha.valor,
        jogo.minhaMao,
        jogo.valorMaoAtual,
        pendente.valorProposto,
        jogo.placarAtual.time0,
      )
      await jogo.responderHumano(resposta)
    } else {
      break
    }
    passos++
  }

  if (jogo.situacaoAtual !== 'fim') {
    throw new Error(`Partida não concluiu após ${passos} passos`)
  }
  return jogo
}

describe('US1 — fluxo completo de partida contra bots (SC-001/FR-006)', () => {
  for (const n of [2, 4, 6] as const) {
    it(`completa até 12 pontos com ${n} jogadores sem falha de regra`, async () => {
      const jogo = await jogarPartidaCompleta(n)

      expect(jogo.situacaoAtual).toBe('fim')
      expect(jogo.placarAtual.time0 >= 12 || jogo.placarAtual.time1 >= 12).toBe(true)
      expect(jogo.vencedorLabelAtual).not.toBeNull()
    })
  }

  it('grava o histórico da partida contra bots no IndexedDB (FR-019)', async () => {
    const jogo = await jogarPartidaCompleta(2)

    const historico = await listarHistorico()
    expect(historico).toHaveLength(1)
    const registro = historico[0]
    expect(registro.modo).toBe('bots')
    expect(registro.formato).toBe('1x1')
    expect(registro.partida_id).toBe(jogo.partidaId)
    expect(registro.vencedor).toBe(jogo.vencedorLabelAtual)
    expect(registro.placar_final.time0 + registro.placar_final.time1).toBeGreaterThanOrEqual(12)
    expect(typeof registro.concluida_em).toBe('string')

    const salva = await lerPartidaAtual()
    expect(salva).toBeNull()
  })
})

describe('US1 — persistência de partida em andamento (FR-018)', () => {
  it('persiste e retoma uma partida no meio de uma mão', async () => {
    const jogo = new JogoSolo(2, 0)
    await jogo.iniciarPartida()

    expect(jogo.minhaVez).toBe(true)
    expect(jogo.situacaoAtual).toBe('jogar')
    expect(jogo.minhaMao).toHaveLength(3)

    const salvo = await lerPartidaAtual()
    expect(salvo).not.toBeNull()
    expect(salvo?.mao).not.toBeNull()

    const retomado = JogoSolo.carregar(salvo!)
    expect(retomado.partidaId).toBe(jogo.partidaId)
    expect(retomado.minhaVez).toBe(true)
    expect(retomado.minhaMao).toHaveLength(3)
    expect(retomado.placarAtual).toEqual(jogo.placarAtual)
  })
})