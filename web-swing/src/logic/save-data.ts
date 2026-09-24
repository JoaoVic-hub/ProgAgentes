/**
 * Dados salvos (recordes) — parse robusto e versionado, puro.
 *
 * parseSaveData NUNCA lança exceção: JSON corrompido, campos inválidos ou
 * versão futura viram o padrão (com o status dizendo o que houve, para a
 * camada de storage guardar um backup). Números não finitos são descartados;
 * nomes são saneados; a tabela é reordenada e cortada em 10.
 *
 * Versões:
 *   0 — (legado) sem campo version
 *   1 — pontuação por anéis (tag web-swing-v0.2.0-aneis): { highscores, bestByLevel{score, stars, bestTimeTicks} }
 *   2 — atual, contra o relógio: { times: HighscoreEntry[], bestByLevel{bestTimeMs, stars} }
 * Migração v0/v1 → v2: pontuações não são tempos, então a tabela recomeça;
 * do v1 aproveita-se o melhor tempo por nível (sem as estrelas, que eram de anéis).
 */

import type { BestByLevel, HighscoreEntry, LevelBest } from './highscores';
import { compareEntries, MAX_HIGHSCORES, sanitizeName } from './highscores';

export const SAVE_VERSION = 2;
/** 10 horas: acima disto é lixo. */
const MAX_TIME_MS = 36_000_000;
/** O v1 gravava tempo em ticks de 60 Hz. */
const V1_TICK_HZ = 60;

export interface SaveData {
  readonly version: typeof SAVE_VERSION;
  readonly times: readonly HighscoreEntry[];
  readonly bestByLevel: BestByLevel;
}

export type SaveStatus = 'ok' | 'empty' | 'migrated' | 'corrupt' | 'future';

export interface ParsedSave {
  readonly data: SaveData;
  readonly status: SaveStatus;
}

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, times: [], bestByLevel: {} };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function validTime(ms: number | null): number | null {
  return ms !== null && ms > 0 && ms <= MAX_TIME_MS ? Math.round(ms) : null;
}

function parseEntry(v: unknown): HighscoreEntry | null {
  if (!isRecord(v)) return null;
  const timeMs = validTime(finiteNumber(v.timeMs));
  if (timeMs === null) return null;
  const date = finiteNumber(v.date);
  return { name: sanitizeName(typeof v.name === 'string' ? v.name : ''), timeMs, date: date === null ? 0 : date };
}

function parseEntries(v: unknown): HighscoreEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(parseEntry)
    .filter((e): e is HighscoreEntry => e !== null)
    .sort(compareEntries)
    .slice(0, MAX_HIGHSCORES);
}

function parseBest(v: unknown, fromV1: boolean): BestByLevel {
  if (!isRecord(v)) return {};
  const out: Record<string, LevelBest> = {};
  for (const [key, raw] of Object.entries(v)) {
    if (!/^\d+$/.test(key) || !isRecord(raw)) continue;
    const timeMs = fromV1
      ? validTime((finiteNumber(raw.bestTimeTicks) ?? NaN) * (1000 / V1_TICK_HZ))
      : validTime(finiteNumber(raw.bestTimeMs));
    if (timeMs === null) continue;
    const stars = fromV1 ? null : finiteNumber(raw.stars);
    out[key] = { bestTimeMs: timeMs, stars: (stars === null ? 0 : Math.min(Math.max(Math.round(stars), 0), 3)) as LevelBest['stars'] };
  }
  return out;
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
    // v0 (legado, pontos): nada aproveitável como tempo
    if (!Array.isArray(json.highscores)) return { data: defaultSave(), status: 'corrupt' };
    return { data: defaultSave(), status: 'migrated' };
  }
  const version = finiteNumber(json.version);
  if (version === null) return { data: defaultSave(), status: 'corrupt' };
  if (version > SAVE_VERSION) return { data: defaultSave(), status: 'future' };
  if (version < SAVE_VERSION) {
    return { data: { version: SAVE_VERSION, times: [], bestByLevel: parseBest(json.bestByLevel, true) }, status: 'migrated' };
  }
  return {
    data: { version: SAVE_VERSION, times: parseEntries(json.times), bestByLevel: parseBest(json.bestByLevel, false) },
    status: 'ok',
  };
}

export function serializeSaveData(data: SaveData): string {
  return JSON.stringify(data);
}
