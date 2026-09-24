/**
 * Piloto automático (ferramenta de dev): joga um nível com uma estratégia
 * simples — mira na fachada/quina ~30 m à frente alternando os lados, segura
 * até passar o fundo do arco, solta subindo a ~30°, faz o flip logo depois
 * (se `flips`), e sai andando de becos. Não desvia de mísseis de propósito.
 * Determinístico: os mesmos estado inicial e config geram sempre os mesmos inputs.
 *
 * Usado por tools/autopilot.feel.ts (métricas de feel e calibração das
 * estrelas) e tools/golden.gen.ts (replay dourado do L1).
 */

import { isTerminal, step } from '../src/logic/engine';
import { input, lookAtFrom } from '../src/logic/testing';
import { attachPoint } from '../src/logic/player/web';
import type { GameState, InputFrame, Level, MomentumLossReason } from '../src/logic/types';

export interface PilotOptions {
  /** Limite de tempo de jogo (s). */
  readonly maxSeconds?: number;
  /** Faz o flip logo após cada soltura (ganha impulso). */
  readonly flips?: boolean;
  /** Ticks depois da soltura em que aperta o Espaço. */
  readonly flipDelay?: number;
}

export interface PilotMetrics {
  readonly phase: GameState['phase'];
  /** Tempo do nível no relógio do jogo (s). */
  readonly seconds: number;
  readonly swings: number;
  readonly firstSwingMax: number;
  readonly cruise: number;
  readonly arc: number;
  readonly max: number;
  readonly street: number;
  readonly bonks: number;
  readonly falls: number;
  readonly hits: number;
  readonly missiles: number;
  readonly perfects: number;
  readonly flips: number;
  readonly momentumAvg: number;
  readonly momentumBest: number;
  readonly losses: Readonly<Partial<Record<MomentumLossReason, number>>>;
  readonly stars: number;
}

export interface PilotRun {
  readonly frames: InputFrame[];
  readonly final: GameState;
  readonly metrics: PilotMetrics;
}

function pickTarget(level: Level, s: GameState, side: -1 | 1) {
  const pos = s.player.pos;
  const zWant = pos.z + 30;
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
export function fly(start: GameState, opts: PilotOptions = {}): PilotRun {
  const cfg = start.config;
  const maxSeconds = opts.maxSeconds ?? 150;
  const doFlips = opts.flips ?? true;
  const flipDelay = opts.flipDelay ?? 4;
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
  let missiles = 0;
  let momentumSum = 0;
  let playingTicks = 0;
  const losses: Partial<Record<MomentumLossReason, number>> = {};
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
        const target = pickTarget(level, s, side) ?? pickTarget(level, s, side < 0 ? 1 : -1);
        if (target) {
          look = lookAtFrom(s.player.pos, target, cfg);
          // só clica com o retículo válido (○), como um jogador atento; segura até anexar
          frame = input({ ...look, moveZ: 1, webHeld: s.aim.point !== null });
        }
      } else if (phase === 'hold') {
        const v = s.player.vel;
        const theta = (Math.atan2(v.y, Math.hypot(v.x, v.z)) * 180) / Math.PI;
        const rope = s.player.rope;
        if (v.y < -1) passedBottom = true;
        const nearTop = rope !== null && attachPoint(s.player.pos, cfg.web).y > rope.anchor.y - 4;
        const release = !rope || (passedBottom && theta > 28 && v.y > 0) || nearTop || rope.heldTicks > 200;
        frame = input({ ...look, moveZ: 1, webHeld: !release });
      } else if (phase === 'air') {
        const flipNow = doFlips && airTicks === flipDelay && s.player.flipAvailable && s.player.flipWindowTicks > 0;
        frame = input({ ...look, moveZ: 1, jumpPressed: flipNow });
      }
    }
    frames.push(frame);
    const prevMode = s.player.mode;
    const prevRopeTicks = s.player.rope?.heldTicks ?? 0;
    s = step(s, frame);
    if (s.phase === 'playing') {
      momentumSum += s.momentum.value;
      playingTicks++;
    }
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
      else if (e.type === 'fell') falls++;
      else if (e.type === 'missile_launched') missiles++;
      else if (e.type === 'momentum_loss') losses[e.reason] = (losses[e.reason] ?? 0) + 1;
      else if (e.type === 'respawned' || e.type === 'go' || e.type === 'player_hit') phase = 'attach';
    }
    if (prevMode === 'swing' && s.player.mode !== 'swing' && phase === 'hold') phase = 'air';
    if (phase === 'air') {
      airTicks++;
      if ((s.player.vel.y < 0 && airTicks > 8) || s.player.grounded) phase = 'attach';
    }
  }
  const cruise = releases.slice(2);
  const last = s.results[s.results.length - 1];
  const done = s.phase === 'level_complete' && last !== undefined;
  return {
    frames,
    final: s,
    metrics: {
      phase: s.phase,
      seconds: (done ? last.timeTicks : s.progress.ticks) / cfg.tickHz,
      swings: releases.length,
      firstSwingMax,
      cruise: cruise.reduce((a, b) => a + b, 0) / Math.max(1, cruise.length),
      arc: arcs.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, arcs.length - 1),
      max: releases.length ? Math.max(...releases) : 0,
      street,
      bonks,
      falls,
      hits: s.progress.hits,
      missiles,
      perfects: s.progress.perfects,
      flips: s.progress.flips,
      momentumAvg: momentumSum / Math.max(1, playingTicks),
      momentumBest: s.momentum.best,
      losses,
      stars: done ? last.stars : 0,
    },
  };
}
