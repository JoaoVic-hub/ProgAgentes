/**
 * Interpolação de render entre o estado anterior e o atual da simulação
 * (alpha do relógio). Saltos grandes (respawn, troca de nível) não são
 * interpolados — o render vai direto para o estado atual.
 */

import type { Player } from '../logic/types';
import type { Vec3 } from '../logic/math/vec3';
import { distance, lerp } from '../logic/math/vec3';

/** Acima disto (m) entre dois ticks consideramos teleporte. */
export const TELEPORT_DISTANCE = 5;

export interface InterpolatedPlayer {
  readonly feet: Vec3;
  readonly vel: Vec3;
}

export function interpolatePlayer(prev: Player, curr: Player, alpha: number): InterpolatedPlayer {
  if (distance(prev.pos, curr.pos) > TELEPORT_DISTANCE) return { feet: curr.pos, vel: curr.vel };
  return { feet: lerp(prev.pos, curr.pos, alpha), vel: lerp(prev.vel, curr.vel, alpha) };
}
