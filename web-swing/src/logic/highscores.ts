/**
 * Recordes (Etapa 2C) — funções puras.
 *
 * - Tabela geral: top 10 por pontuação da campanha; empate → quem fez
 *   primeiro fica na frente (data mais antiga).
 * - Melhor por nível: pontuação, estrelas e tempo (estatística) só melhoram.
 * - Runs não ranqueados (flags de debug que mudam o jogo) não entram.
 * A data vem de fora (a lógica não lê relógio): main passa Date.now().
 */

import type { LevelResult } from './types';

export const MAX_HIGHSCORES = 10;
export const NAME_MAX_LENGTH = 12;
export const DEFAULT_NAME = 'Anônimo';

export interface HighscoreEntry {
  readonly name: string;
  readonly score: number;
  /** Último nível alcançado na campanha (1..5). */
  readonly levelReached: number;
  readonly victory: boolean;
  /** Epoch em ms (desempate: o mais antigo fica na frente). */
  readonly date: number;
}

export interface LevelBest {
  readonly score: number;
  readonly stars: 0 | 1 | 2 | 3;
  /** Melhor tempo (estatística; não pontua). */
  readonly bestTimeTicks: number | null;
}

export type BestByLevel = Readonly<Record<string, LevelBest>>;

/** Caracteres de controle (C0/C1), espaços de largura zero e separadores de linha. */
const INVISIBLE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g;

/** Nome exibível: sem caracteres de controle, espaços colapsados, 1–12 caracteres. */
export function sanitizeName(raw: string): string {
  // remove caracteres de controle (C0/C1) e espaços invisíveis
  const cleaned = Array.from(raw.replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim());
  const name = cleaned.slice(0, NAME_MAX_LENGTH).join('').trim();
  return name.length > 0 ? name : DEFAULT_NAME;
}

export function compareEntries(a: HighscoreEntry, b: HighscoreEntry): number {
  return b.score - a.score || a.date - b.date || a.name.localeCompare(b.name);
}

/** A pontuação entraria na tabela? (empate com o último não entra: o mais antigo fica.) */
export function qualifies(list: readonly HighscoreEntry[], score: number, max = MAX_HIGHSCORES): boolean {
  if (score <= 0) return false;
  if (list.length < max) return true;
  const sorted = [...list].sort(compareEntries);
  return score > sorted[max - 1].score;
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

/** Atualiza o melhor resultado do nível: cada campo só melhora. */
export function updateBestByLevel(best: BestByLevel, result: LevelResult): BestByLevel {
  const key = String(result.levelIndex);
  const prev = best[key];
  const next: LevelBest = prev
    ? {
        score: Math.max(prev.score, result.score),
        stars: Math.max(prev.stars, result.stars) as LevelBest['stars'],
        bestTimeTicks: prev.bestTimeTicks === null ? result.timeTicks : Math.min(prev.bestTimeTicks, result.timeTicks),
      }
    : { score: result.score, stars: result.stars, bestTimeTicks: result.timeTicks };
  return { ...best, [key]: next };
}

/** Níveis liberados para seleção (Etapa 3): o 1º e todo nível após um concluído. */
export function unlockedLevels(best: BestByLevel, total: number): number[] {
  const out = [1];
  for (let i = 2; i <= total; i++) if (best[String(i - 1)]) out.push(i);
  return out;
}
