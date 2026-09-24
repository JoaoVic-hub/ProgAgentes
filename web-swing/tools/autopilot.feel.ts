/**
 * Piloto automático de medição de "feel" — ferramenta de dev (npm run feel).
 *
 * Joga os níveis reais com uma estratégia simples (mira na fachada/quina
 * ~30 m à frente alternando os lados, segura até passar o fundo do arco,
 * solta subindo a ~30°) e imprime métricas comparadas às metas do plano:
 * velocidade máxima no 1º swing a partir do repouso (18–22 m/s), cruzeiro
 * (25–35 m/s), duração do arco (1,2–1,8 s), toques na rua e bonks. Não é um teste de CI: a heurística é
 * frágil e muda a cada ajuste de tuning. Serve para comparar variantes.
 *
 * Para comparar tunings, acrescente entradas em VARIANTS.
 */

import { it } from 'vitest';
import { createGame, step } from '../src/logic/engine';
import { DEFAULT_GAME_CONFIG } from '../src/logic/config';
import { generateLevel } from '../src/logic/level/generator';
import { LEVEL_SPECS } from '../src/logic/level/specs';
import { input, lookAtFrom } from '../src/logic/testing';
import { attachPoint } from '../src/logic/player/web';
import type { GameConfig, GameState, Level, PhysicsConfig, WebConfig } from '../src/logic/types';

interface Override {
  physics?: Partial<PhysicsConfig>;
  web?: Partial<WebConfig>;
}

const VARIANTS: [string, Override][] = [
  ['padrão', {}],
  // ['exemplo: menos arrasto', { physics: { airDragQuad: 0.004 } }],
];

function pickTarget(level: Level, s: GameState, side: -1 | 1) {
  const pos = s.player.pos;
  const zWant = pos.z + 30;
  let best: { x: number; y: number; z: number } | null = null;
  for (const b of level.solids) {
    if (b.kind !== 'building' || b.side !== side) continue;
    if (b.box.max.z < pos.z + 18 || b.box.min.z > pos.z + 45) continue;
    const z = Math.min(Math.max(zWant, b.box.min.z + 1), b.box.max.z - 1);
    const x = side < 0 ? b.box.max.x : b.box.min.x;
    const cand = { x, y: Math.min(b.box.max.y, pos.y + 32), z };
    if (!best || Math.abs(cand.z - zWant) < Math.abs(best.z - zWant)) best = cand;
  }
  return best;
}

function fly(level: Level, cfg: GameConfig) {
  let s = createGame(level, cfg);
  let phase: 'attach' | 'hold' | 'air' = 'attach';
  let side: -1 | 1 = -1;
  let look = { yaw: 0, pitch: 0.4 };
  let airTicks = 0;
  let passedBottom = false;
  const releases: number[] = [];
  const arcs: number[] = [];
  let firstSwingMax = 0;
  let ropes = 0;
  let street = 0;
  let bonks = 0;
  let t = 0;
  for (; t < 90 * cfg.tickHz && s.player.pos.z < level.finishZ; t++) {
    let frame = input({ ...look, moveZ: 1 });
    const halfW = level.spec.avenueWidth / 2;
    if (phase === 'attach' && s.player.grounded && Math.abs(s.player.pos.x) > halfW - 1) {
      // caiu num beco/recuo atrás das fachadas: volta andando para a avenida (como um humano faria)
      const yaw = Math.atan2(-s.player.pos.x, 12);
      frame = input({ yaw, pitch: 0, moveZ: 1 });
    } else if (phase === 'attach') {
      const target = pickTarget(level, s, side) ?? pickTarget(level, s, side < 0 ? 1 : -1);
      if (target) {
        look = lookAtFrom(s.player.pos, target, cfg);
        frame = input({ ...look, moveZ: 1, webHeld: t % 2 === 0 });
      }
    } else if (phase === 'hold') {
      const v = s.player.vel;
      const theta = (Math.atan2(v.y, Math.hypot(v.x, v.z)) * 180) / Math.PI;
      const rope = s.player.rope;
      if (v.y < -1) passedBottom = true;
      const nearTop = rope !== null && attachPoint(s.player.pos, cfg.web).y > rope.anchor.y - 4;
      const release = !rope || (passedBottom && theta > 28 && v.y > 0) || nearTop || rope.heldTicks > 200;
      frame = input({ ...look, moveZ: 1, webHeld: !release });
    }
    const prevMode = s.player.mode;
    const prevRopeTicks = s.player.rope?.heldTicks ?? 0;
    s = step(s, frame);
    if (ropes === 1 && s.player.rope) firstSwingMax = Math.max(firstSwingMax, Math.hypot(s.player.vel.x, s.player.vel.y, s.player.vel.z));
    for (const e of s.events) {
      if (e.type === 'web_attached') {
        phase = 'hold';
        passedBottom = false;
        ropes++;
      }
      if (e.type === 'web_released') {
        releases.push(e.speed);
        if (prevRopeTicks > 0) arcs.push(prevRopeTicks / cfg.tickHz);
        phase = 'air';
        airTicks = 0;
        side = side < 0 ? 1 : -1;
      }
      if (e.type === 'landed' && e.kind === 'street') street++;
      if (e.type === 'bonk') bonks++;
    }
    if (prevMode === 'swing' && s.player.mode !== 'swing' && phase === 'hold') phase = 'air';
    if (phase === 'air') {
      airTicks++;
      if ((s.player.vel.y < 0 && airTicks > 8) || s.player.grounded) phase = 'attach';
    }
  }
  const cruise = releases.slice(2);
  return {
    finished: s.player.pos.z >= level.finishZ,
    seconds: t / cfg.tickHz,
    swings: releases.length,
    firstRelease: releases[0] ?? 0,
    firstSwingMax,
    arc: arcs.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, arcs.length - 1),
    cruise: cruise.reduce((a, b) => a + b, 0) / Math.max(1, cruise.length),
    max: releases.length ? Math.max(...releases) : 0,
    street,
    bonks,
  };
}

it('métricas de feel por nível', () => {
  for (const [name, ov] of VARIANTS) {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      physics: { ...DEFAULT_GAME_CONFIG.physics, ...ov.physics },
      web: { ...DEFAULT_GAME_CONFIG.web, ...ov.web },
    };
    for (const spec of LEVEL_SPECS) {
      const m = fly(generateLevel(spec), cfg);
      console.log(
        `${name.padEnd(12)} L${spec.index} ${m.finished ? 'chegou' : 'NÃO chegou'} em ${m.seconds.toFixed(1)} s | ` +
          `swings ${m.swings} | 1º swing máx ${m.firstSwingMax.toFixed(1)} m/s (18–22) | cruzeiro ${m.cruise.toFixed(1)} m/s (25–35) | arco ${m.arc.toFixed(2)} s (1,2–1,8) | ` +
          `máx ${m.max.toFixed(1)} | rua ${m.street} | bonks ${m.bonks}`,
      );
    }
  }
});
