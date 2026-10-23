/**
 * Forças do jogador fora da teia: corrida no chão, controle aéreo, gravidade,
 * arrasto e limites de velocidade. Funções puras sobre vetores.
 */

import type { InputFrame, PhysicsConfig } from '../types';
import type { Vec3 } from '../math/vec3';
import { length, normalize, scale } from '../math/vec3';
import { flatForward, flatRight } from '../camera-rig';

/** Direção desejada no plano horizontal (WASD no referencial do yaw), unitária ou nula. */
export function wishDirection(input: Pick<InputFrame, 'moveX' | 'moveZ'>, yaw: number): Vec3 {
  if (input.moveX === 0 && input.moveZ === 0) return { x: 0, y: 0, z: 0 };
  const f = flatForward(yaw);
  const r = flatRight(yaw);
  return normalize({
    x: f.x * input.moveZ + r.x * input.moveX,
    y: 0,
    z: f.z * input.moveZ + r.z * input.moveX,
  });
}

/** Corrida no chão: aproxima a velocidade horizontal do alvo (wish·runMax) com aceleração limitada. */
export function groundMove(vel: Vec3, wish: Vec3, cfg: PhysicsConfig, dt: number): Vec3 {
  const moving = wish.x !== 0 || wish.z !== 0;
  const tx = wish.x * cfg.runMax;
  const tz = wish.z * cfg.runMax;
  const dx = tx - vel.x;
  const dz = tz - vel.z;
  const dLen = Math.sqrt(dx * dx + dz * dz);
  const maxDelta = (moving ? cfg.runAccel : cfg.runDecel) * dt;
  const k = dLen > maxDelta ? maxDelta / dLen : 1;
  return { x: vel.x + dx * k, y: vel.y, z: vel.z + dz * k };
}

/** Controle aéreo estilo "air strafe": só acelera enquanto a velocidade na direção desejada < airMaxSpeed. */
export function airControl(vel: Vec3, wish: Vec3, cfg: PhysicsConfig, dt: number): Vec3 {
  if (wish.x === 0 && wish.z === 0) return vel;
  const along = vel.x * wish.x + vel.z * wish.z;
  const room = cfg.airMaxSpeed - along;
  if (room <= 0) return vel;
  const add = Math.min(cfg.airAccel * dt, room);
  return { x: vel.x + wish.x * add, y: vel.y, z: vel.z + wish.z * add };
}

export function applyGravity(vel: Vec3, cfg: PhysicsConfig, dt: number): Vec3 {
  return { x: vel.x, y: vel.y - cfg.gravity * dt, z: vel.z };
}

/** Arrasto quadrático a = −k·|v|·v (limitado para nunca inverter a velocidade). */
export function applyDrag(vel: Vec3, cfg: PhysicsConfig, dt: number): Vec3 {
  const speed = length(vel);
  if (speed === 0 || cfg.airDragQuad === 0) return vel;
  const f = Math.max(0, 1 - cfg.airDragQuad * speed * dt);
  return scale(vel, f);
}

export function limitFall(vel: Vec3, cfg: PhysicsConfig): Vec3 {
  return vel.y < -cfg.terminalFall ? { x: vel.x, y: -cfg.terminalFall, z: vel.z } : vel;
}

export function clampSpeed(vel: Vec3, max: number): Vec3 {
  const speed = length(vel);
  return speed > max ? scale(vel, max / speed) : vel;
}
