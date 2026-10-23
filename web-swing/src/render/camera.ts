/**
 * Aplica a pose calculada em app/camera-follow.ts à câmera do three.
 * Nenhuma decisão aqui: só posição, direção e FOV — e, por cima, o "juice"
 * já calculado em app/juice.ts (tremor e roll), que é só visual: a mira
 * continua sendo o raio da câmera lógica (ADR-007).
 */

import { Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { Vec3 } from '../logic/types';

export interface CameraPoseLike {
  readonly position: Vec3;
  readonly dir: Vec3;
  readonly fov: number;
}

export interface CameraJuice {
  /** Deslocamento no plano da câmera (m). */
  readonly right: number;
  readonly up: number;
  /** Rotações extras (rad): tremor + roll de inclinação. */
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
}

const WORLD_UP = new Vector3(0, 1, 0);
const dir = new Vector3();
const right = new Vector3();
const up = new Vector3();

export function applyCameraPose(camera: PerspectiveCamera, pose: CameraPoseLike, juice?: CameraJuice): void {
  let { x, y, z } = pose.position;
  if (juice && (juice.right !== 0 || juice.up !== 0)) {
    dir.set(pose.dir.x, pose.dir.y, pose.dir.z).normalize();
    right.crossVectors(dir, WORLD_UP);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    up.crossVectors(right, dir);
    x += right.x * juice.right + up.x * juice.up;
    y += right.y * juice.right + up.y * juice.up;
    z += right.z * juice.right + up.z * juice.up;
  }
  camera.position.set(x, y, z);
  camera.lookAt(x + pose.dir.x, y + pose.dir.y, z + pose.dir.z);
  if (juice) {
    if (juice.yaw !== 0) camera.rotateY(juice.yaw);
    if (juice.pitch !== 0) camera.rotateX(juice.pitch);
    if (juice.roll !== 0) camera.rotateZ(juice.roll);
  }
  if (Math.abs(camera.fov - pose.fov) > 0.01) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}
