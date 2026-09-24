/**
 * Câmera em 3ª pessoa que segue o jogador — cola pura e testável.
 *
 * - Rotação: usa o look AO VIVO do mouse (sem latência de tick).
 * - Pivô sobre o ombro: o mesmo da câmera lógica (safeCameraPivot, que nunca
 *   entra num sólido), suavizado com feed-forward da velocidade: sem ele, o
 *   filtro exponencial fica v/k atrás do alvo (≈2,7 m a 20 m/s) e o centro da
 *   tela desalinha 4–6° do raio da mira.
 * - Distância e FOV crescem com a velocidade (sensação de rapidez).
 * - Braço da câmera colide com os prédios: a câmera é puxada para a frente
 *   da parede em vez de atravessá-la (nunca é empurrada de volta para dentro).
 * Suavização independente de FPS: fator 1 − e^(−k·dt).
 */

import type { CameraRigConfig, Level } from '../logic/types';
import type { Vec3 } from '../logic/math/vec3';
import { add, length, scale, sub } from '../logic/math/vec3';
import { rayVsBox } from '../logic/math/geom';
import { querySolidIds } from '../logic/level/broadphase';
import { lookDir, safeCameraPivot } from '../logic/camera-rig';

export interface CameraFollowConfig {
  readonly distanceMin: number;
  readonly distanceMax: number;
  /** Faixa de velocidade (m/s) em que a distância vai do mínimo ao máximo. */
  readonly distanceSpeed: readonly [number, number];
  readonly pivotSharpnessXZ: number;
  readonly pivotSharpnessY: number;
  readonly distanceSharpness: number;
  readonly fovBase: number;
  readonly fovBoost: number;
  readonly fovSpeed: readonly [number, number];
  readonly fovSharpness: number;
  /** Folga entre a câmera e a parede que a bloqueia. */
  readonly collisionMargin: number;
  /** Distância mínima do braço quando há uma parede logo atrás. */
  readonly nearLimit: number;
}

export const DEFAULT_CAMERA_FOLLOW: CameraFollowConfig = {
  distanceMin: 5.5,
  distanceMax: 8,
  distanceSpeed: [10, 45],
  pivotSharpnessXZ: 12,
  pivotSharpnessY: 10,
  distanceSharpness: 5,
  fovBase: 70,
  fovBoost: 15,
  fovSpeed: [12, 45],
  fovSharpness: 5,
  collisionMargin: 0.3,
  nearLimit: 0.15,
};

export interface CameraFollowState {
  readonly pivot: Vec3;
  readonly distance: number;
  readonly fov: number;
}

export interface CameraFollowInput {
  readonly feet: Vec3;
  readonly vel: Vec3;
  readonly yaw: number;
  readonly pitch: number;
}

export interface CameraPose {
  readonly position: Vec3;
  readonly dir: Vec3;
  readonly fov: number;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function approach(current: number, target: number, sharpness: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-sharpness * dt));
}

export function createCameraFollow(level: Level, input: CameraFollowInput, rig: CameraRigConfig, cfg = DEFAULT_CAMERA_FOLLOW): CameraFollowState {
  return { pivot: safeCameraPivot(level, input.feet, input.yaw, rig), distance: cfg.distanceMin, fov: cfg.fovBase };
}

/** Distância livre ao longo do braço da câmera (do pivô para trás), limitada pela parede mais próxima. */
export function cameraArmLength(level: Level, pivot: Vec3, backDir: Vec3, desired: number, cfg: CameraFollowConfig): number {
  const reach = desired + cfg.collisionMargin;
  const end = add(pivot, scale(backDir, reach));
  const ids = querySolidIds(level.broadphase, Math.min(pivot.z, end.z) - 1, Math.max(pivot.z, end.z) + 1);
  let t = reach;
  for (const id of ids) {
    const hit = rayVsBox(pivot, backDir, level.solids[id].box, reach);
    if (hit && hit.t < t) t = hit.t;
  }
  if (t >= reach) return desired;
  // parede perto: encosta a câmera na frente dela (nunca a empurra para dentro)
  return Math.max(cfg.nearLimit, Math.min(desired, t - cfg.collisionMargin));
}

export function updateCameraFollow(
  state: CameraFollowState,
  input: CameraFollowInput,
  level: Level,
  rig: CameraRigConfig,
  dtSec: number,
  cfg = DEFAULT_CAMERA_FOLLOW,
): { state: CameraFollowState; pose: CameraPose } {
  const target = safeCameraPivot(level, input.feet, input.yaw, rig);
  // feed-forward exato do filtro discreto: com velocidade constante o atraso em regime é
  // v·dt·e^(−k·dt)/(1 − e^(−k·dt)); mirar esse tanto à frente zera o atraso em qualquer FPS
  const lead = (v: number, k: number) => {
    if (dtSec <= 0) return 0;
    const e = Math.exp(-k * dtSec);
    return (v * dtSec * e) / (1 - e);
  };
  const pivot = {
    x: approach(state.pivot.x, target.x + lead(input.vel.x, cfg.pivotSharpnessXZ), cfg.pivotSharpnessXZ, dtSec),
    y: approach(state.pivot.y, target.y + lead(input.vel.y, cfg.pivotSharpnessY), cfg.pivotSharpnessY, dtSec),
    z: approach(state.pivot.z, target.z + lead(input.vel.z, cfg.pivotSharpnessXZ), cfg.pivotSharpnessXZ, dtSec),
  };
  const speed = length(input.vel);
  const wantDistance = cfg.distanceMin + (cfg.distanceMax - cfg.distanceMin) * smoothstep(cfg.distanceSpeed[0], cfg.distanceSpeed[1], speed);
  const distance = approach(state.distance, wantDistance, cfg.distanceSharpness, dtSec);
  const wantFov = cfg.fovBase + cfg.fovBoost * smoothstep(cfg.fovSpeed[0], cfg.fovSpeed[1], speed);
  const fov = approach(state.fov, wantFov, cfg.fovSharpness, dtSec);

  const dir = lookDir(input.yaw, input.pitch);
  const back = scale(dir, -1);
  const arm = cameraArmLength(level, pivot, back, distance, cfg);
  return {
    state: { pivot, distance, fov },
    pose: { position: add(pivot, scale(back, arm)), dir, fov },
  };
}

/** Distância real entre câmera e pivô (para o debug). */
export function poseArm(pose: CameraPose, state: CameraFollowState): number {
  return length(sub(pose.position, state.pivot));
}
