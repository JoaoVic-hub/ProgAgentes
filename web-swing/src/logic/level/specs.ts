/**
 * Especificações dos 5 níveis (só geometria nesta etapa; anéis, vãos sem
 * chão, cotas e par entram na Etapa 2). A dificuldade cresce de forma
 * monotônica: avenida mais longa e mais larga, alturas mais irregulares,
 * becos maiores e mais prédios de vidro (sem ancoragem).
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
  },
];

/** Spec pelo número do nível (1-based), limitado ao intervalo existente. */
export function getLevelSpec(levelNumber: number): LevelSpec {
  const i = Math.min(Math.max(Math.floor(levelNumber), 1), LEVEL_SPECS.length) - 1;
  return LEVEL_SPECS[i];
}
