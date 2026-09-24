/**
 * Piloto automático (ferramenta de dev): joga um nível com uma estratégia
 * simples — mira na fachada/quina ~30 m à frente alternando os lados, segura
 * até passar o fundo do arco, solta subindo a ~30°, e sai andando de becos.
 * Não mira em anéis (os que pega são por acaso). Determinístico: os mesmos
 * estado inicial e config geram sempre os mesmos inputs.
 *
 * Usado por tools/autopilot.feel.ts (métricas de feel) e tools/golden.gen.ts
 * (replay dourado do L1).
 */

import { isTerminal, step } from '../src/logic/engine';
import { input, lookAtFrom } from '../src/logic/testing';
import { attachPoint } from '../src/logic/player/web';
import type { GameState, InputFrame, Level } from '../src/logic/types';

export interface PilotMetrics {
  readonly phase: GameState['phase'];
  readonly seconds: number;
  readonly swings: number;
  readonly firstSwingMax: number;
  readonly cruise: number;
  readonly arc: number;
  readonly max: number;
  readonly street: number;
  readonly bonks: number;
  readonly falls: number;
  readonly rings: number;
  readonly ringsTotal: number;
  readonly levelScore: number;
  readonly stars: number;
}

export interface PilotRun {
  readonly frames: InputFrame[];
  readonly final: GameState;
  readonly metrics: PilotMetrics;
}

function pickTarget(level: Level, s: GameState, side: -1 | 1, seekRings = false) {
  const pos = s.player.pos;
  const ring = seekRings ? nextRing(s) : null;
  // mirando anéis: âncora uns 12 m depois do anel, para o arco passar por ele
  const zWant = ring && ring.center.z - pos.z < 38 ? ring.center.z + 12 : pos.z + 30;
  let best: { x: number; y: number; z: number } | null = null;
  for (const b of level.solids) {
    if (!b.anchorable || b.side !== side) continue;
    if (b.box.max.z < pos.z + 18 || b.box.min.z > pos.z + 45) continue;
    const z = Math.min(Math.max(zWant, b.box.min.z + 1), b.box.max.z - 1);
    const x = side < 0 ? b.box.max.x : b.box.min.x;
    const cand = { x, y: Math.min(b.box.max.y, pos.y + 32), z };
    if (!best || Math.abs(cand.z - zWant) < Math.abs(best.z - zWant)) best = cand;
  }
  return best;
}

/** Joga a partir de `start` até uma fase terminal (ou o limite de tempo). */
/** Próximo anel ainda não coletado à frente. */
function nextRing(s: GameState) {
  return s.level.rings.find((r) => !s.ringsCollected[r.id] && r.center.z > s.player.pos.z + 3) ?? null;
}

/** A/D para alinhar lateralmente com o próximo anel (direita da tela = (−cos yaw, 0, sin yaw)). */
function steerToRing(s: GameState, yaw: number): -1 | 0 | 1 {
  const ring = nextRing(s);
  if (!ring || ring.center.z - s.player.pos.z > 40) return 0;
  const off = (ring.center.x - s.player.pos.x) * -Math.cos(yaw) + (ring.center.z - s.player.pos.z) * Math.sin(yaw);
  return off > 1 ? 1 : off < -1 ? -1 : 0;
}

export function fly(start: GameState, maxSeconds = 120, seekRings = false): PilotRun {
  const cfg = start.config;
  let s = start;
  const frames: InputFrame[] = [];
  let phase: 'attach' | 'hold' | 'air' = 'attach';
  let side: -1 | 1 = -1;
  let look = { yaw: 0, pitch: 0.4 };
  let airTicks = 0;
  let passedBottom = false;
  let ropes = 0;
  let firstSwingMax = 0;
  const releases: number[] = [];
  const arcs: number[] = [];
  let street = 0;
  let bonks = 0;
  let falls = 0;
  let t = 0;
  for (; t < maxSeconds * cfg.tickHz && !isTerminal(s.phase); t++) {
    const level = s.level;
    let frame = input({ ...look });
    if (s.phase === 'playing') {
      frame = input({ ...look, moveZ: 1 });
      const halfW = level.spec.avenueWidth / 2;
      if (phase === 'attach' && s.player.grounded && Math.abs(s.player.pos.x) > halfW - 1) {
        // caiu num beco/recuo atrás das fachadas: volta andando para a avenida
        frame = input({ yaw: Math.atan2(-s.player.pos.x, 12), pitch: 0, moveZ: 1 });
      } else if (phase === 'attach') {
        const target = pickTarget(level, s, side, seekRings) ?? pickTarget(level, s, side < 0 ? 1 : -1, seekRings);
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
        frame = input({ ...look, moveZ: 1, moveX: seekRings ? steerToRing(s, look.yaw) : 0, webHeld: !release });
      } else if (phase === 'air' && seekRings) {
        frame = input({ ...look, moveZ: 1, moveX: steerToRing(s, look.yaw) });
      }
    }
    frames.push(frame);
    const prevMode = s.player.mode;
    const prevRopeTicks = s.player.rope?.heldTicks ?? 0;
    s = step(s, frame);
    if (ropes === 1 && s.player.rope) firstSwingMax = Math.max(firstSwingMax, Math.hypot(s.player.vel.x, s.player.vel.y, s.player.vel.z));
    for (const e of s.events) {
      if (e.type === 'web_attached') {
        phase = 'hold';
        passedBottom = false;
        ropes++;
      } else if (e.type === 'web_released') {
        releases.push(e.speed);
        if (prevRopeTicks > 0) arcs.push(prevRopeTicks / cfg.tickHz);
        phase = 'air';
        airTicks = 0;
        side = side < 0 ? 1 : -1;
      } else if (e.type === 'landed' && e.kind === 'street') street++;
      else if (e.type === 'bonk') bonks++;
      else if (e.type === 'life_lost') falls++;
      else if (e.type === 'respawned' || e.type === 'go') phase = 'attach';
    }
    if (prevMode === 'swing' && s.player.mode !== 'swing' && phase === 'hold') phase = 'air';
    if (phase === 'air') {
      airTicks++;
      if ((s.player.vel.y < 0 && airTicks > 8) || s.player.grounded) phase = 'attach';
    }
  }
  const cruise = releases.slice(2);
  const last = s.results[s.results.length - 1];
  return {
    frames,
    final: s,
    metrics: {
      phase: s.phase,
      seconds: t / cfg.tickHz,
      swings: releases.length,
      firstSwingMax,
      cruise: cruise.reduce((a, b) => a + b, 0) / Math.max(1, cruise.length),
      arc: arcs.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, arcs.length - 1),
      max: releases.length ? Math.max(...releases) : 0,
      street,
      bonks,
      falls,
      rings: s.ringsCollected.filter(Boolean).length,
      ringsTotal: s.level.rings.length,
      levelScore: s.levelScore,
      stars: last && s.phase === 'level_complete' ? last.stars : 0,
    },
  };
}
