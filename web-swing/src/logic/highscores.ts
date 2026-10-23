/**
 * Recordes por tempo (redesenho da Etapa 2) — funções puras.
 *
 * - Tabela geral: top 10 de campanhas completas (L1 → L5) pelo MENOR tempo
 *   total; empate → quem fez primeiro (data mais antiga).
 * - Melhor por nível: melhor tempo e mais estrelas (cada campo só melhora).
 * - Runs não ranqueados (flags de debug que mudam o jogo) não entram.
 * A data vem de fora (a lógica não lê relógio): main passa Date.now().
 */

import type { LevelResult } from './types';

export const MAX_HIGHSCORES = 10;
export const NAME_MAX_LENGTH = 12;
export const DEFAULT_NAME = 'Anônimo';

export interface HighscoreEntry {
  readonly name: string;
  /** Tempo total da campanha em ms. */
  readonly timeMs: number;
  /** Epoch em ms (desempate: o mais antigo fica na frente). */
  readonly date: number;
}

export interface LevelBest {
  readonly bestTimeMs: number;
  readonly stars: 0 | 1 | 2 | 3;
}

export type BestByLevel = Readonly<Record<string, LevelBest>>;

/** Controle C0/C1, espaços de largura zero, separadores de linha e BOM. */
function isInvisible(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0xfeff
  );
}

/** Nome exibível: sem caracteres invisíveis, espaços colapsados, 1–12 caracteres. */
export function sanitizeName(raw: string): string {
  const visible = Array.from(raw)
    .filter((ch) => !isInvisible(ch.codePointAt(0) ?? 0))
    .join('');
  const cleaned = Array.from(visible.replace(/\s+/g, ' ').trim());
  const name = cleaned.slice(0, NAME_MAX_LENGTH).join('').trim();
  return name.length > 0 ? name : DEFAULT_NAME;
}

export function ticksToMs(ticks: number, tickHz: number): number {
  return Math.round((ticks * 1000) / tickHz);
}

export function compareEntries(a: HighscoreEntry, b: HighscoreEntry): number {
  return a.timeMs - b.timeMs || a.date - b.date || a.name.localeCompare(b.name);
}

/** O tempo entraria na tabela? (empate com o 10º não entra: o mais antigo fica.) */
export function qualifies(list: readonly HighscoreEntry[], timeMs: number, max = MAX_HIGHSCORES): boolean {
  if (!(timeMs > 0)) return false;
  if (list.length < max) return true;
  const sorted = [...list].sort(compareEntries);
  return timeMs < sorted[max - 1].timeMs;
}

/** Insere e devolve a tabela ordenada e cortada, com a posição (1-based) ou null se ficou de fora. */
export function insertEntry(
  list: readonly HighscoreEntry[],
  entry: HighscoreEntry,
  max = MAX_HIGHSCORES,
): { list: HighscoreEntry[]; position: number | null } {
  const sorted = [...list, entry].sort(compareEntries).slice(0, max);
  const index = sorted.indexOf(entry);
  return { list: sorted, position: index >= 0 ? index + 1 : null };
}

/** Atualiza o melhor resultado do nível: menor tempo e mais estrelas. */
export function updateBestByLevel(best: BestByLevel, result: LevelResult, tickHz: number): BestByLevel {
  const key = String(result.levelIndex);
  const timeMs = ticksToMs(result.timeTicks, tickHz);
  const prev = best[key];
  const next: LevelBest = prev
    ? { bestTimeMs: Math.min(prev.bestTimeMs, timeMs), stars: Math.max(prev.stars, result.stars) as LevelBest['stars'] }
    : { bestTimeMs: timeMs, stars: result.stars };
  return { ...best, [key]: next };
}

/** Níveis liberados para seleção (Etapa 3): o 1º e todo nível após um concluído. */
export function unlockedLevels(best: BestByLevel, total: number): number[] {
  const out = [1];
  for (let i = 2; i <= total; i++) if (best[String(i - 1)]) out.push(i);
  return out;
}
