/**
 * "Juice" da câmera (Etapa 4), puro e testável:
 *
 * - Tremor por TRAUMA (modelo clássico): eventos somam trauma em [0, 1], que
 *   decai linearmente; o tremor usa trauma² (pancada forte treme muito, a
 *   leve quase nada) e ruído suave determinístico (sem Math.random).
 * - Inclinação (roll) na direção do movimento lateral, limitada a 3°.
 * - Intensidade das speed lines a partir da velocidade.
 *
 * Tudo isso é visual: não mexe no estado do jogo nem na mira.
 */

import type { GameEvent } from '../logic/types';
import type { Vec3 } from '../logic/math/vec3';

export interface ShakeState {
  readonly trauma: number;
  /** Tempo acumulado (s) que alimenta o ruído. */
  readonly time: number;
}

export interface ShakeOffsets {
  /** Deslocamento no plano da câmera (m). */
  readonly right: number;
  readonly up: number;
  /** Rotações extras (rad). */
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
}

/** Trauma perdido por segundo (de 1 a 0 em ~0,7 s). */
export const TRAUMA_DECAY = 1.4;
export const SHAKE_MAX_OFFSET = 0.35;
export const SHAKE_MAX_ANGLE = 0.035;
/** Roll máximo por movimento lateral: 3°. */
export const MAX_ROLL = (3 * Math.PI) / 180;
/** m/s de velocidade lateral para chegar ao roll máximo. */
const ROLL_FULL_SPEED = 22;

export const NO_SHAKE: ShakeState = { trauma: 0, time: 0 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function addTrauma(s: ShakeState, amount: number): ShakeState {
  return { ...s, trauma: clamp01(s.trauma + Math.max(0, amount)) };
}

export function stepShake(s: ShakeState, dt: number): ShakeState {
  return { trauma: Math.max(0, s.trauma - TRAUMA_DECAY * dt), time: s.time + dt };
}

/** Ruído suave e determinístico em [-1, 1]: soma de senoides de frequências incomensuráveis. */
export function smoothNoise(t: number, seed: number): number {
  const a = Math.sin(t * 13.7 + seed * 1.93);
  const b = Math.sin(t * 23.3 + seed * 4.71) * 0.6;
  const c = Math.sin(t * 7.1 + seed * 2.37) * 0.4;
  return (a + b + c) / 2;
}

export function shakeOffsets(s: ShakeState): ShakeOffsets {
  const k = s.trauma * s.trauma;
  if (k === 0) return { right: 0, up: 0, yaw: 0, pitch: 0, roll: 0 };
  return {
    right: SHAKE_MAX_OFFSET * k * smoothNoise(s.time, 1),
    up: SHAKE_MAX_OFFSET * k * smoothNoise(s.time, 2),
    yaw: SHAKE_MAX_ANGLE * k * smoothNoise(s.time, 3),
    pitch: SHAKE_MAX_ANGLE * k * smoothNoise(s.time, 4),
    roll: SHAKE_MAX_ANGLE * k * smoothNoise(s.time, 5),
  };
}

/** Quanto trauma cada evento soma (o jogador está em `feet`). */
export function traumaFor(e: GameEvent, feet: Vec3): number {
  switch (e.type) {
    case 'player_hit':
      return 0.75;
    case 'bonk':
      return 0.35 + 0.25 * clamp01((e.speed - 22) / 20);
    case 'landed':
      return e.speed > 14 ? 0.12 + 0.2 * clamp01((e.speed - 14) / 16) : 0;
    case 'fell':
      return 0.25;
    case 'missile_exploded': {
      if (e.hitPlayer) return 0; // o player_hit já cobre
      const d = Math.hypot(e.pos.x - feet.x, e.pos.y - feet.y, e.pos.z - feet.z);
      return d < 30 ? 0.35 * (1 - d / 30) : 0;
    }
    default:
      return 0;
  }
}

/**
 * Roll alvo pela velocidade lateral (positiva = para a direita da tela):
 * inclina para dentro da curva, como um avião, até ±3°.
 */
export function targetRoll(lateralSpeed: number): number {
  const r = (-lateralSpeed / ROLL_FULL_SPEED) * MAX_ROLL;
  return Math.max(-MAX_ROLL, Math.min(MAX_ROLL, r));
}

/** Aproxima o roll do alvo de forma independente do FPS (e nunca passa de ±3°). */
export function stepRoll(roll: number, lateralSpeed: number, dt: number, sharpness = 4): number {
  const next = roll + (targetRoll(lateralSpeed) - roll) * (1 - Math.exp(-sharpness * dt));
  return Math.max(-MAX_ROLL, Math.min(MAX_ROLL, next));
}

/** Velocidade lateral em relação à câmera (direita da tela = (−cos yaw, 0, sin yaw)). */
export function lateralSpeed(vel: Vec3, yaw: number): number {
  return vel.x * -Math.cos(yaw) + vel.z * Math.sin(yaw);
}

/** Speed lines: nada abaixo de 30 m/s, cheias a partir de 52 m/s (suave no meio). */
export function speedLinesIntensity(speed: number): number {
  const t = clamp01((speed - 30) / (52 - 30));
  return t * t * (3 - 2 * t);
}
