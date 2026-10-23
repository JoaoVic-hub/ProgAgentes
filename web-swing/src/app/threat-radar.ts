/**
 * Radar de ameaças (cola pura, testável): transforma mísseis e lançadores
 * em "blips" para o indicador em volta do retículo (ui/threat-indicator.ts).
 *
 * - angle: ângulo na tela, horário a partir de "para cima" = à frente da
 *   câmera (0), direita = +π/2, atrás = ±π. Usa o yaw da câmera ao vivo.
 * - urgency ∈ [0, 1]: mísseis por distância (mais perto = mais urgente, e
 *   mais ainda se estiver se aproximando); lançadores pelo progresso do
 *   aviso de mira (1 = disparando).
 */

import type { GameConfig, GameState } from '../logic/types';
import type { Vec3 } from '../logic/math/vec3';
import { chestOf } from '../logic/threats';

export type BlipKind = 'missile' | 'launcher';

export interface RadarBlip {
  /** Estável entre frames (para reaproveitar o elemento na UI). */
  readonly key: string;
  readonly kind: BlipKind;
  readonly angle: number;
  readonly distance: number;
  readonly urgency: number;
}

/** Mísseis mais longe que isto não aparecem no radar. */
export const RADAR_MISSILE_RANGE = 90;
/** Distância em que a urgência de um míssil chega a 1. */
const MISSILE_CRITICAL = 8;

function wrapAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x <= -Math.PI) x += 2 * Math.PI;
  return x;
}

/** Ângulo na tela (horário a partir do "à frente") de `target` visto de `from` com a câmera em `yaw`. */
export function screenBearing(from: Vec3, target: Vec3, yaw: number): number {
  // yaw = atan2(dx, dz) e a direita da tela é (−cos yaw, 0, sin yaw): +x fica à ESQUERDA com yaw 0
  return wrapAngle(-(Math.atan2(target.x - from.x, target.z - from.z) - yaw));
}

export function threatRadar(state: GameState, viewYaw: number, config: GameConfig): RadarBlip[] {
  if (state.phase !== 'playing') return [];
  const chest = chestOf(state.player.pos);
  const pv = state.player.vel;
  const blips: RadarBlip[] = [];

  for (const m of state.threats.missiles) {
    const d = { x: m.pos.x - chest.x, y: m.pos.y - chest.y, z: m.pos.z - chest.z };
    const dist = Math.hypot(d.x, d.y, d.z);
    if (dist > RADAR_MISSILE_RANGE) continue;
    const closing = d.x * (m.vel.x - pv.x) + d.y * (m.vel.y - pv.y) + d.z * (m.vel.z - pv.z) < 0;
    const near = Math.min(1, Math.max(0, 1 - (dist - MISSILE_CRITICAL) / (RADAR_MISSILE_RANGE - MISSILE_CRITICAL)));
    blips.push({ key: `m${m.id}`, kind: 'missile', angle: screenBearing(chest, m.pos, viewYaw), distance: dist, urgency: closing ? near : near * 0.5 });
  }

  const warnTicks = Math.max(1, Math.round(config.missiles.warnTime * config.tickHz));
  state.threats.launchers.forEach((ls, i) => {
    if (ls.phase !== 'aiming' && ls.phase !== 'firing') return;
    const L = state.level.launchers[i];
    if (!L) return;
    const dist = Math.hypot(L.pos.x - chest.x, L.pos.y - chest.y, L.pos.z - chest.z);
    const urgency = ls.phase === 'firing' ? 1 : Math.min(1, (ls.ticks + 1) / warnTicks);
    blips.push({ key: `l${L.id}`, kind: 'launcher', angle: screenBearing(chest, L.pos, viewYaw), distance: dist, urgency });
  });

  return blips;
}
