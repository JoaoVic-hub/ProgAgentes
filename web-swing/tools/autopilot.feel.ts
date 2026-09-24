/**
 * Métricas de "feel" (npm run feel): o piloto automático (tools/autopilot.ts)
 * joga cada nível e imprime as métricas comparadas às metas do plano:
 * velocidade máxima no 1º swing a partir do repouso (~29 m/s, ADR-016),
 * cruzeiro (25–35 m/s sem impulso), duração do arco (1,2–1,8 s), toques na
 * rua, bonks, quedas — e, desde o redesenho contra o relógio, o tempo do
 * nível, as estrelas, o impulso médio/máximo, mísseis disparados e acertos.
 *
 * Cada nível roda em três modos:
 *   - "sem flip, god": só swings, sem mísseis (base de comparação);
 *   - "flip, god": com flips (impulso sobe mais) — referência para o ouro;
 *   - "flip": o mesmo, mas levando mísseis (o piloto não desvia).
 *
 * Não é um teste de CI: a heurística é frágil e muda a cada ajuste de tuning.
 * Serve para comparar variantes — acrescente entradas em VARIANTS.
 */

import { it } from 'vitest';
import { createRun } from '../src/logic/engine';
import { DEFAULT_GAME_CONFIG } from '../src/logic/config';
import { LEVEL_SPECS } from '../src/logic/level/specs';
import type { GameConfig, MomentumConfig, PhysicsConfig, WebConfig } from '../src/logic/types';
import { fly } from './autopilot';

interface Override {
  physics?: Partial<PhysicsConfig>;
  web?: Partial<WebConfig>;
  momentum?: Partial<MomentumConfig>;
}

const VARIANTS: [string, Override][] = [
  ['padrão', {}],
  // ['exemplo: menos arrasto', { physics: { airDragQuad: 0.004 } }],
];

const MODES = [
  { name: 'sem flip, god', flips: false, god: true },
  { name: 'flip, god', flips: true, god: true },
  { name: 'flip', flips: true, god: false },
] as const;

it('métricas de feel por nível', () => {
  for (const [name, ov] of VARIANTS) {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      physics: { ...DEFAULT_GAME_CONFIG.physics, ...ov.physics },
      web: { ...DEFAULT_GAME_CONFIG.web, ...ov.web },
      momentum: { ...DEFAULT_GAME_CONFIG.momentum, ...ov.momentum },
    };
    for (const spec of LEVEL_SPECS) {
      console.log(`${name} — L${spec.index} ${spec.name} (ouro ${spec.goldTime} s, prata ${spec.silverTime} s)`);
      for (const mode of MODES) {
        const m = fly(createRun(cfg, { startLevel: spec.index, god: mode.god }), { flips: mode.flips }).metrics;
        const losses = Object.entries(m.losses).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
        console.log(
          `  ${mode.name.padEnd(14)} ${m.phase === 'level_complete' ? 'chegou' : `NÃO chegou (${m.phase})`} em ${m.seconds.toFixed(1)} s ${'★'.repeat(m.stars)} | ` +
            `1º swing ${m.firstSwingMax.toFixed(1)} | cruzeiro ${m.cruise.toFixed(1)} | máx ${m.max.toFixed(1)} m/s | arco ${m.arc.toFixed(2)} s | ` +
            `impulso méd ${m.momentumAvg.toFixed(2)} máx ${m.momentumBest.toFixed(1)} | perfeitas ${m.perfects} flips ${m.flips} | ` +
            `rua ${m.street} bonks ${m.bonks} quedas ${m.falls} | mísseis ${m.missiles} acertos ${m.hits} | perdas: ${losses}`,
        );
      }
    }
  }
});
