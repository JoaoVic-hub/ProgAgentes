/**
 * Cola entre o armazenamento (storage/) e as regras de recordes (logic/) —
 * pura: recebe o KeyValueStore por parâmetro, então é testável em Node.
 *
 * - Chave `web-swing:v1:save`; se o conteúdo estiver corrompido ou for de
 *   uma versão futura, o original vai para `…save.bak` antes de ser
 *   substituído (nada é perdido em silêncio).
 * - Runs não ranqueados nunca entram nos recordes.
 */

import type { KeyValueStore } from '../storage/store';
import type { HighscoreEntry } from '../logic/highscores';
import type { SaveData, SaveStatus } from '../logic/save-data';
import type { GameState } from '../logic/types';
import { insertEntry, qualifies, sanitizeName, updateBestByLevel } from '../logic/highscores';
import { parseSaveData, serializeSaveData } from '../logic/save-data';

export const SAVE_KEY = 'web-swing:v1:save';
export const BACKUP_KEY = `${SAVE_KEY}.bak`;

export function loadSave(store: KeyValueStore): { data: SaveData; status: SaveStatus } {
  const raw = store.get(SAVE_KEY);
  const parsed = parseSaveData(raw);
  if ((parsed.status === 'corrupt' || parsed.status === 'future') && raw !== null) store.set(BACKUP_KEY, raw);
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
  for (const r of run.results) best = updateBestByLevel(best, r);
  return { ...save, bestByLevel: best };
}

/** O run pode entrar na tabela? */
export function runQualifies(save: SaveData, run: GameState): boolean {
  return run.ranked && qualifies(save.highscores, run.runScore);
}

/** Registra o run na tabela geral (se ranqueado e qualificado). */
export function recordHighscore(
  save: SaveData,
  run: GameState,
  rawName: string,
  date: number,
): { save: SaveData; position: number | null } {
  if (!runQualifies(save, run)) return { save, position: null };
  const entry: HighscoreEntry = {
    name: sanitizeName(rawName),
    score: run.runScore,
    levelReached: run.level.spec.index,
    victory: run.phase === 'victory',
    date,
  };
  const r = insertEntry(save.highscores, entry);
  return { save: { ...save, highscores: r.list }, position: r.position };
}
