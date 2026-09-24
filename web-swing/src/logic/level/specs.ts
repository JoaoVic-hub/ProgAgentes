/**
 * Especificações dos 5 níveis (tabela do plano, §3). A dificuldade cresce de
 * forma monotônica: avenida mais longa e mais larga, alturas mais
 * irregulares, becos maiores, mais prédios de vidro (sem ancoragem), vãos
 * sem chão a partir do L3, anéis menores, mais anéis de risco e cota maior.
 * Seeds fixas → recordes comparáveis entre jogadores.
 */

import type { LevelSpec } from '../types';

const BASE = {
  buildingLength: [18, 40],
  buildingDepth: [16, 28],
  setback: [0, 2.5],
} as const;

export const LEVEL_SPECS: readonly LevelSpec[] = [
  {
    ...BASE,
    index: 1,
    name: 'Avenida Aurora',
    seed: 1101,
    length: 800,
    avenueWidth: 28,
    buildingHeight: [35, 55],
    spacing: [4, 10],
    glassRatio: 0,
    voids: { count: 0, length: [0, 0] },
    rings: { count: 14, gold: 1, radius: 3.0, riskyRatio: 0.1 },
    minRingRatio: 0,
    checkpoints: 2,
    parScore: 4000,
  },
  {
    ...BASE,
    index: 2,
    name: 'Rua do Mercado',
    seed: 1102,
    length: 1000,
    avenueWidth: 32,
    buildingHeight: [30, 65],
    spacing: [5, 12],
    glassRatio: 0.1,
    voids: { count: 0, length: [0, 0] },
    rings: { count: 18, gold: 2, radius: 2.8, riskyRatio: 0.15 },
    minRingRatio: 0.3,
    checkpoints: 2,
    parScore: 6000,
  },
  {
    ...BASE,
    index: 3,
    name: 'Viaduto Quebrado',
    seed: 1103,
    length: 1200,
    avenueWidth: 36,
    buildingHeight: [25, 75],
    spacing: [6, 14],
    glassRatio: 0.15,
    voids: { count: 1, length: [40, 50] },
    rings: { count: 22, gold: 2, radius: 2.6, riskyRatio: 0.2 },
    minRingRatio: 0.4,
    checkpoints: 3,
    parScore: 8500,
  },
  {
    ...BASE,
    index: 4,
    name: 'Distrito Industrial',
    seed: 1104,
    length: 1400,
    avenueWidth: 40,
    buildingHeight: [20, 90],
    spacing: [8, 16],
    glassRatio: 0.2,
    voids: { count: 2, length: [50, 70] },
    rings: { count: 26, gold: 3, radius: 2.4, riskyRatio: 0.25 },
    minRingRatio: 0.5,
    checkpoints: 3,
    parScore: 11000,
  },
  {
    ...BASE,
    index: 5,
    name: 'Torres Finais',
    seed: 1105,
    length: 1600,
    avenueWidth: 44,
    buildingHeight: [20, 120],
    spacing: [8, 20],
    glassRatio: 0.25,
    voids: { count: 3, length: [60, 80] },
    rings: { count: 30, gold: 4, radius: 2.2, riskyRatio: 0.3 },
    minRingRatio: 0.6,
    checkpoints: 4,
    parScore: 14000,
  },
];

/** Spec pelo número do nível (1-based), limitado ao intervalo existente. */
export function getLevelSpec(levelNumber: number): LevelSpec {
  const i = Math.min(Math.max(Math.floor(levelNumber), 1), LEVEL_SPECS.length) - 1;
  return LEVEL_SPECS[i];
}
