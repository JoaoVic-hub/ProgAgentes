/**
 * Interpolação de render entre o estado anterior e o atual da simulação
 * (alpha do relógio). Saltos grandes (respawn, troca de nível) não são
 * interpolados — o render vai direto para o estado atual.
 */

import type { Missile, Player } from '../logic/types';
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

export interface InterpolatedMissile {
  readonly id: number;
  readonly pos: Vec3;
  readonly vel: Vec3;
}

/**
 * Mísseis interpolados por id. Míssil que acabou de nascer aparece direto na
 * posição atual; o que explodiu neste tick já não está em `curr` (a explosão
 * cuida do visual).
 */
export function interpolateMissiles(prev: readonly Missile[], curr: readonly Missile[], alpha: number): InterpolatedMissile[] {
  const before = new Map(prev.map((m) => [m.id, m]));
  return curr.map((m) => {
    const p = before.get(m.id);
    if (!p || distance(p.pos, m.pos) > TELEPORT_DISTANCE) return { id: m.id, pos: m.pos, vel: m.vel };
    return { id: m.id, pos: lerp(p.pos, m.pos, alpha), vel: lerp(p.vel, m.vel, alpha) };
  });
}
