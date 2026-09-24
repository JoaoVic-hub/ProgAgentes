/**
 * Índice espacial 1D em faixas de Z. O nível é um corredor ao longo de +Z,
 * então basta fatiar em Z: cada faixa lista os sólidos que a tocam. A laje
 * da rua aparece em todas as faixas (é um id só, custo desprezível).
 * Estrutura plain-data, criada uma vez por nível e compartilhada por
 * referência entre estados.
 */

import type { Broadphase, Solid } from '../types';

export const BROADPHASE_CELL_SIZE = 16;

export function buildBroadphase(solids: readonly Solid[], cellSize = BROADPHASE_CELL_SIZE): Broadphase {
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const s of solids) {
    zMin = Math.min(zMin, s.box.min.z);
    zMax = Math.max(zMax, s.box.max.z);
  }
  if (solids.length === 0) return { zOrigin: 0, cellSize, cells: [] };
  const count = Math.max(1, Math.ceil((zMax - zMin) / cellSize));
  const cells: number[][] = Array.from({ length: count }, () => []);
  for (const s of solids) {
    const first = Math.max(0, Math.floor((s.box.min.z - zMin) / cellSize));
    const last = Math.min(count - 1, Math.floor((s.box.max.z - zMin) / cellSize));
    for (let c = first; c <= last; c++) cells[c].push(s.id);
  }
  return { zOrigin: zMin, cellSize, cells };
}

/** Ids (sem repetição, ordem crescente) dos sólidos que podem tocar a faixa [zMin, zMax]. */
export function querySolidIds(bp: Broadphase, zMin: number, zMax: number): number[] {
  if (bp.cells.length === 0) return [];
  const first = Math.max(0, Math.floor((zMin - bp.zOrigin) / bp.cellSize));
  const last = Math.min(bp.cells.length - 1, Math.floor((zMax - bp.zOrigin) / bp.cellSize));
  if (first > last) return [];
  if (first === last) return bp.cells[first].slice();
  const seen = new Set<number>();
  for (let c = first; c <= last; c++) for (const id of bp.cells[c]) seen.add(id);
  return Array.from(seen).sort((a, b) => a - b);
}
