import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  adicionarHistorico,
  lerPartidaAtual,
  limparPartidaAtual,
  listarHistorico,
  salvarPartidaAtual,
} from '../src/storage/localdb'
import type { HistoricoPartida, PartidaSalva } from '../src/storage/localdb'

function fakerFactory() {
  ;(globalThis as { indexedDB?: unknown }).indexedDB = new IDBFactory()
}

beforeEach(() => {
  fakerFactory()
})

const PARTIDA_SALVA: PartidaSalva = {
  partidaId: 'p-1',
  modo: 'bots',
  nJogadores: 2,
  formato: '1x1',
  placar: { time0: 6, time1: 3 },
  mao: null,
  situacao: 'jogar',
  respondenteAssento: null,
  parteContraria: null,
  assentoHumano: 0,
  vencedorTime: null,
}

const HISTORICO: HistoricoPartida = {
  id: 'h-1',
  partida_id: 'p-1',
  modo: 'bots',
  formato: '1x1',
  vencedor: 'Você',
  placar_final: { time0: 12, time1: 5 },
  concluida_em: '2026-09-14T10:00:00.000Z',
}

describe('persistência IndexedDB — partida em andamento (FR-018)', () => {
  it('grava e restaura o estado de uma partida em andamento', async () => {
    await salvarPartidaAtual(PARTIDA_SALVA)
    const restaurada = await lerPartidaAtual()
    expect(restaurada).toEqual(PARTIDA_SALVA)
  })

  it('retorna null quando não há partida em andamento salva', async () => {
    const restaurada = await lerPartidaAtual()
    expect(restaurada).toBeNull()
  })

  it('limpa a partida em andamento após ser consumida', async () => {
    await salvarPartidaAtual(PARTIDA_SALVA)
    await limparPartidaAtual()
    expect(await lerPartidaAtual()).toBeNull()
  })

  it('sobrescreve a partida em andamento salva', async () => {
    await salvarPartidaAtual(PARTIDA_SALVA)
    const nova: PartidaSalva = { ...PARTIDA_SALVA, partidaId: 'p-2', placar: { time0: 12, time1: 0 } }
    await salvarPartidaAtual(nova)
    const restaurada = await lerPartidaAtual()
    expect(restaurada?.partidaId).toBe('p-2')
    expect(restaurada?.placar).toEqual({ time0: 12, time1: 0 })
  })
})

describe('persistência IndexedDB — histórico de partida contra bots (FR-019)', () => {
  it('grava e lê um registro de HistóricoPartida', async () => {
    await adicionarHistorico(HISTORICO)
    const historico = await listarHistorico()
    expect(historico).toHaveLength(1)
    expect(historico[0]).toEqual(HISTORICO)
  })

  it('faz append de vários registros em ordem de conclusão', async () => {
    await adicionarHistorico(HISTORICO)
    const segundo: HistoricoPartida = {
      ...HISTORICO,
      id: 'h-2',
      partida_id: 'p-2',
      vencedor: 'Manduca',
      placar_final: { time0: 3, time1: 12 },
    }
    await adicionarHistorico(segundo)
    const historico = await listarHistorico()
    expect(historico).toHaveLength(2)
    expect(historico.map((h) => h.id)).toEqual(['h-1', 'h-2'])
  })

  it('preserva os campos essenciais do registro consultado', async () => {
    await adicionarHistorico(HISTORICO)
    const [registro] = await listarHistorico()
    expect(registro).toMatchObject({
      modo: 'bots',
      formato: '1x1',
      vencedor: 'Você',
      placar_final: { time0: 12, time1: 5 },
    })
    expect(typeof registro.concluida_em).toBe('string')
    expect(typeof registro.partida_id).toBe('string')
  })
})