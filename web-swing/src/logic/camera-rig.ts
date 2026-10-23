/**
 * Câmera lógica: direção do olhar e pivô sobre o ombro, sem suavização.
 *
 * A mira é o raio desta câmera, então o centro da tela coincide com o que a
 * física considera "mirado" (o render só suaviza o pivô, ver
 * app/camera-follow.ts). Convenção: yaw = 0 olha para +Z; yaw positivo gira
 * em direção a +X; pitch positivo olha para cima.
 */

import type { CameraRigConfig, Level } from './types';
import type { Vec3 } from './math/vec3';
import { rayVsBox } from './math/geom';
import { querySolidIds } from './level/broadphase';

const DEG = Math.PI / 180;

export function lookDir(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp };
}

/** Frente no plano horizontal. */
export function flatForward(yaw: number): Vec3 {
  return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
}

/** Direita da tela no plano horizontal (olhando para +Z, a direita é −X). */
export function flatRight(yaw: number): Vec3 {
  return { x: -Math.cos(yaw), y: 0, z: Math.sin(yaw) };
}

export function clampPitch(pitch: number, rig: CameraRigConfig): number {
  return Math.min(Math.max(pitch, rig.pitchMinDeg * DEG), rig.pitchMaxDeg * DEG);
}

/** Pivô da câmera: acima dos pés e deslocado para o ombro direito. */
export function cameraPivot(feet: Vec3, yaw: number, rig: CameraRigConfig): Vec3 {
  const r = flatRight(yaw);
  return {
    x: feet.x + r.x * rig.shoulderOffset,
    y: feet.y + rig.pivotHeight,
    z: feet.z + r.z * rig.shoulderOffset,
  };
}

/**
 * Pivô sobre o ombro que nunca entra num sólido: o ombro fica 0,6 m à
 * direita, mas o corpo só tem 0,35 m de meia-largura — encostado numa
 * fachada à direita, o pivô ingênuo ficaria dentro do prédio (câmera dentro
 * da parede e mira atravessando-a). Sonda da cabeça até o ombro e encurta o
 * deslocamento até a parede, menos uma margem. Mira e câmera usam este pivô.
 */
export function safeCameraPivot(level: Level, feet: Vec3, yaw: number, rig: CameraRigConfig, margin = 0.15): Vec3 {
  const head = { x: feet.x, y: feet.y + rig.pivotHeight, z: feet.z };
  const right = flatRight(yaw);
  const reach = rig.shoulderOffset + margin;
  let t = reach;
  for (const id of querySolidIds(level.broadphase, head.z - reach - 1, head.z + reach + 1)) {
    const hit = rayVsBox(head, right, level.solids[id].box, reach);
    if (hit && hit.t < t) t = hit.t;
  }
  const offset = t >= reach ? rig.shoulderOffset : Math.max(0, t - margin);
  return { x: head.x + right.x * offset, y: head.y, z: head.z + right.z * offset };
}
