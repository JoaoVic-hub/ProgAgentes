import type { MaoState, PartidaScore } from 'truco-rules'

// ─── Tipos serializáveis ────────────────────────────────────────────────────

export interface PartidaSalva {
  partidaId: string
  modo: 'bots'
  nJogadores: 2 | 4 | 6
  formato: '1x1' | '2x2' | '3x3'
  placar: PartidaScore
  mao: MaoState | null
  situacao: 'jogar' | 'responder' | 'fim'
  respondenteAssento: number | null
  parteContraria: [number, number] | null
  assentoHumano: number
  vencedorTime: 'time0' | 'time1' | null
}

export interface HistoricoPartida {
  id: string
  partida_id: string
  modo: 'bots'
  formato: '1x1' | '2x2' | '3x3'
  vencedor: string
  placar_final: PartidaScore
  concluida_em: string
}

// ─── IndexedDB helpers ──────────────────────────────────────────────────────

const DB_NAME = 'truco-local'
const DB_VERSION = 1
const STORE_ATUAL = 'partidaAtual'
const STORE_HISTORICO = 'historico'

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_ATUAL)) {
        db.createObjectStore(STORE_ATUAL)
      }
      if (!db.objectStoreNames.contains(STORE_HISTORICO)) {
        db.createObjectStore(STORE_HISTORICO, { keyPath: 'id' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function gravar(storeName: string, valor: unknown, chave?: IDBValidKey): Promise<void> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = chave !== undefined ? store.put(valor, chave) : store.put(valor)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function ler<T>(storeName: string, chave: IDBValidKey): Promise<T | null> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.get(chave)
    req.onsuccess = () => resolve((req.result as T) ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function deletar(storeName: string, chave: IDBValidKey): Promise<void> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.delete(chave)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function lerTudo<T>(storeName: string): Promise<T[]> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

async function limpar(storeName: string): Promise<void> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ─── API pública (partida em andamento) ─────────────────────────────────────

const CHAVE_PARTIDA = 'atual'

export async function salvarPartidaAtual(p: PartidaSalva): Promise<void> {
  await gravar(STORE_ATUAL, structuredClone(p), CHAVE_PARTIDA)
}

export async function lerPartidaAtual(): Promise<PartidaSalva | null> {
  return ler<PartidaSalva>(STORE_ATUAL, CHAVE_PARTIDA)
}

export async function limparPartidaAtual(): Promise<void> {
  await deletar(STORE_ATUAL, CHAVE_PARTIDA)
}

// ─── API pública (histórico) ────────────────────────────────────────────────

export async function adicionarHistorico(h: HistoricoPartida): Promise<void> {
  await gravar(STORE_HISTORICO, structuredClone(h))
}

export async function listarHistorico(): Promise<HistoricoPartida[]> {
  return lerTudo<HistoricoPartida>(STORE_HISTORICO)
}

export async function limparHistorico(): Promise<void> {
  await limpar(STORE_HISTORICO)
}
