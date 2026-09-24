/**
 * Dados salvos (recordes) — parse robusto e versionado, puro.
 *
 * parseSaveData NUNCA lança exceção: JSON corrompido, campos inválidos ou
 * versão futura viram o padrão (com o status dizendo o que houve, para a
 * camada de storage guardar um backup). Números não finitos são descartados;
 * nomes são saneados; a tabela é reordenada e cortada em 10.
 *
 * Versões:
 *   0 — (legado) sem campo version: { highscores: [{ name, score }] }
 *   1 — atual: { version: 1, highscores: HighscoreEntry[], bestByLevel }
 */

import type { BestByLevel, HighscoreEntry, LevelBest } from './highscores';
import { compareEntries, MAX_HIGHSCORES, sanitizeName } from './highscores';

export const SAVE_VERSION = 1;
const MAX_SCORE = 1e9;

export interface SaveData {
  readonly version: typeof SAVE_VERSION;
  readonly highscores: readonly HighscoreEntry[];
  readonly bestByLevel: BestByLevel;
}

export type SaveStatus = 'ok' | 'empty' | 'migrated' | 'corrupt' | 'future';

export interface ParsedSave {
  readonly data: SaveData;
  readonly status: SaveStatus;
}

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, highscores: [], bestByLevel: {} };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseEntry(v: unknown): HighscoreEntry | null {
  if (!isRecord(v)) return null;
  const score = finiteNumber(v.score);
  if (score === null || score < 0) return null;
  const level = finiteNumber(v.levelReached);
  const date = finiteNumber(v.date);
  return {
    name: sanitizeName(typeof v.name === 'string' ? v.name : ''),
    score: Math.min(Math.round(score), MAX_SCORE),
    levelReached: level === null ? 1 : Math.min(Math.max(Math.round(level), 1), 99),
    victory: v.victory === true,
    date: date === null ? 0 : date,
  };
}

function parseBest(v: unknown): BestByLevel {
  if (!isRecord(v)) return {};
  const out: Record<string, LevelBest> = {};
  for (const [key, raw] of Object.entries(v)) {
    if (!/^\d+$/.test(key) || !isRecord(raw)) continue;
    const score = finiteNumber(raw.score);
    const stars = finiteNumber(raw.stars);
    const time = finiteNumber(raw.bestTimeTicks);
    if (score === null || score < 0) continue;
    out[key] = {
      score: Math.min(Math.round(score), MAX_SCORE),
      stars: (stars === null ? 0 : Math.min(Math.max(Math.round(stars), 0), 3)) as LevelBest['stars'],
      bestTimeTicks: time === null || time < 0 ? null : Math.round(time),
    };
  }
  return out;
}

function parseEntries(v: unknown): HighscoreEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(parseEntry)
    .filter((e): e is HighscoreEntry => e !== null)
    .sort(compareEntries)
    .slice(0, MAX_HIGHSCORES);
}

export function parseSaveData(raw: string | null): ParsedSave {
  if (raw === null || raw.trim() === '') return { data: defaultSave(), status: 'empty' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { data: defaultSave(), status: 'corrupt' };
  }
  if (!isRecord(json)) return { data: defaultSave(), status: 'corrupt' };

  if (!('version' in json)) {
    // v0 (legado): só a tabela, sem melhor por nível
    if (!Array.isArray(json.highscores)) return { data: defaultSave(), status: 'corrupt' };
    return { data: { version: SAVE_VERSION, highscores: parseEntries(json.highscores), bestByLevel: {} }, status: 'migrated' };
  }
  const version = finiteNumber(json.version);
  if (version === null) return { data: defaultSave(), status: 'corrupt' };
  if (version > SAVE_VERSION) return { data: defaultSave(), status: 'future' };
  return {
    data: { version: SAVE_VERSION, highscores: parseEntries(json.highscores), bestByLevel: parseBest(json.bestByLevel) },
    status: 'ok',
  };
}

export function serializeSaveData(data: SaveData): string {
  return JSON.stringify(data);
}
