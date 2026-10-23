/**
 * Cola entre o armazenamento (storage/) e as regras de recordes (logic/) —
 * pura: recebe o KeyValueStore por parâmetro, então é testável em Node.
 *
 * - Chave `web-swing:v1:save` (o "v1" é o espaço de nomes; a versão dos dados
 *   fica dentro do JSON). Conteúdo corrompido ou de versão futura vai para
 *   `…save.bak` antes de ser substituído (nada é perdido em silêncio).
 * - Só campanhas completas desde o L1 e ranqueadas entram na tabela geral;
 *   o melhor por nível vale para qualquer nível concluído num run ranqueado.
 */

import type { KeyValueStore } from '../storage/store';
import type { HighscoreEntry } from '../logic/highscores';
import type { SaveData, SaveStatus } from '../logic/save-data';
import type { GameState } from '../logic/types';
import { insertEntry, qualifies, sanitizeName, ticksToMs, updateBestByLevel } from '../logic/highscores';
import { parseSaveData, serializeSaveData } from '../logic/save-data';

export const SAVE_KEY = 'web-swing:v1:save';
export const BACKUP_KEY = `${SAVE_KEY}.bak`;

export function loadSave(store: KeyValueStore): { data: SaveData; status: SaveStatus } {
  const raw = store.get(SAVE_KEY);
  const parsed = parseSaveData(raw);
  if ((parsed.status === 'corrupt' || parsed.status === 'future' || parsed.status === 'migrated') && raw !== null) store.set(BACKUP_KEY, raw);
  return parsed;
}

export function writeSave(store: KeyValueStore, data: SaveData): boolean {
  return store.set(SAVE_KEY, serializeSaveData(data));
}

export function resetSave(store: KeyValueStore): void {
  store.remove(SAVE_KEY);
}

/** Melhores por nível a partir dos níveis concluídos do run (só se ranqueado). */
export function recordLevelBests(save: SaveData, run: GameState): SaveData {
  if (!run.ranked) return save;
  let best = save.bestByLevel;
  for (const r of run.results) best = updateBestByLevel(best, r, run.config.tickHz);
  return { ...save, bestByLevel: best };
}

/** Tempo total da campanha em ms. */
export function runTimeMs(run: GameState): number {
  return ticksToMs(run.runTicks, run.config.tickHz);
}

/** A campanha pode entrar na tabela geral? (completa desde o L1, ranqueada, no top 10) */
export function runQualifies(save: SaveData, run: GameState): boolean {
  return run.ranked && run.startLevel === 1 && run.phase === 'victory' && qualifies(save.times, runTimeMs(run));
}

/** Registra a campanha na tabela geral (se qualificada). */
export function recordHighscore(
  save: SaveData,
  run: GameState,
  rawName: string,
  date: number,
): { save: SaveData; position: number | null } {
  if (!runQualifies(save, run)) return { save, position: null };
  const entry: HighscoreEntry = { name: sanitizeName(rawName), timeMs: runTimeMs(run), date };
  const r = insertEntry(save.times, entry);
  return { save: { ...save, times: r.list }, position: r.position };
}
