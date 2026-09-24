/**
 * Métricas de "feel" (npm run feel): o piloto automático (tools/autopilot.ts)
 * joga cada nível em god mode (quedas não encerram o run) e imprime as
 * métricas comparadas às metas do plano: velocidade máxima no 1º swing a
 * partir do repouso (meta revisada ~29 m/s, ADR-016), cruzeiro (25–35 m/s),
 * duração do arco (1,2–1,8 s), toques na rua, bonks, quedas, anéis e pontos.
 *
 * Não é um teste de CI: a heurística é frágil e muda a cada ajuste de tuning.
 * Serve para comparar variantes — acrescente entradas em VARIANTS.
 */

import { it } from 'vitest';
import { createRun } from '../src/logic/engine';
import { DEFAULT_GAME_CONFIG } from '../src/logic/config';
import { LEVEL_SPECS } from '../src/logic/level/specs';
import type { GameConfig, PhysicsConfig, WebConfig } from '../src/logic/types';
import { fly } from './autopilot';

interface Override {
  physics?: Partial<PhysicsConfig>;
  web?: Partial<WebConfig>;
}

const VARIANTS: [string, Override][] = [
  ['padrão', {}],
  // ['exemplo: menos arrasto', { physics: { airDragQuad: 0.004 } }],
];

it('métricas de feel por nível', () => {
  for (const [name, ov] of VARIANTS) {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      physics: { ...DEFAULT_GAME_CONFIG.physics, ...ov.physics },
      web: { ...DEFAULT_GAME_CONFIG.web, ...ov.web },
    };
    for (const spec of LEVEL_SPECS) {
      const m = fly(createRun(cfg, { startLevel: spec.index, god: true })).metrics;
      console.log(
        `${name.padEnd(8)} L${spec.index} ${m.phase === 'level_complete' ? 'chegou' : `NÃO chegou (${m.phase})`} em ${m.seconds.toFixed(1)} s | ` +
          `1º swing máx ${m.firstSwingMax.toFixed(1)} m/s | cruzeiro ${m.cruise.toFixed(1)} m/s (25–35) | arco ${m.arc.toFixed(2)} s | ` +
          `rua ${m.street} | bonks ${m.bonks} | quedas ${m.falls} | anéis ${m.rings}/${m.ringsTotal} | ` +
          `pontos ${m.levelScore} (par ${spec.parScore}) ${'★'.repeat(m.stars)}`,
      );
    }
  }
});
