/**
 * Aplica a pose calculada em app/camera-follow.ts à câmera do three.
 * Nenhuma decisão aqui: só posição, direção e FOV.
 */

import type { PerspectiveCamera } from 'three';
import type { Vec3 } from '../logic/types';

export interface CameraPoseLike {
  readonly position: Vec3;
  readonly dir: Vec3;
  readonly fov: number;
}

export function applyCameraPose(camera: PerspectiveCamera, pose: CameraPoseLike): void {
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.position.x + pose.dir.x, pose.position.y + pose.dir.y, pose.position.z + pose.dir.z);
  if (Math.abs(camera.fov - pose.fov) > 0.01) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}
