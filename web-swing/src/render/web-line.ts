/**
 * Teia desenhada da mão até o ponto de contato no prédio (cilindro fino —
 * linhas do WebGL têm sempre 1 px). O "disparo" é só cosmético: nos
 * primeiros 60 ms após o anexo a teia cresce da mão até o contato; a física
 * já está presa desde o tick do anexo.
 * Também desenha o marcador 3D do ponto que a teia vai agarrar.
 */

import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import type { Camera } from 'three';
import type { Vec3 } from '../logic/types';

const SHOT_TIME = 0.06;
const UP = new Vector3(0, 1, 0);

export interface WebLineView {
  readonly group: Group;
  /** from = mão; to = contato (null = sem teia). */
  update(from: Vec3 | null, to: Vec3 | null, dtSec: number): void;
  /** Marcador do alvo da mira (null = esconde). */
  updateMarker(point: Vec3 | null, camera: Camera, assisted: boolean): void;
  dispose(): void;
}

export function createWebLine(): WebLineView {
  const group = new Group();
  group.name = 'web-line';

  const geometry = new CylinderGeometry(0.035, 0.035, 1, 6, 1, true);
  geometry.translate(0, 0.5, 0); // base na origem, cresce em +Y
  const material = new MeshBasicMaterial({ color: 0xf4f4f8 });
  const line = new Mesh(geometry, material);
  line.visible = false;
  line.frustumCulled = false;
  group.add(line);

  const markerGeo = new RingGeometry(0.45, 0.7, 24);
  const markerMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
  const marker = new Mesh(markerGeo, markerMat);
  marker.renderOrder = 998;
  marker.visible = false;
  group.add(marker);

  const a = new Vector3();
  const b = new Vector3();
  const d = new Vector3();
  const q = new Quaternion();
  let shotT = 0;
  let wasAttached = false;

  return {
    group,
    update(from, to, dtSec) {
      if (!from || !to) {
        line.visible = false;
        wasAttached = false;
        return;
      }
      if (!wasAttached) shotT = 0;
      wasAttached = true;
      shotT = Math.min(SHOT_TIME, shotT + dtSec);
      a.set(from.x, from.y, from.z);
      b.set(to.x, to.y, to.z);
      d.subVectors(b, a);
      const len = d.length();
      if (len < 1e-4) {
        line.visible = false;
        return;
      }
      q.setFromUnitVectors(UP, d.normalize());
      line.position.copy(a);
      line.quaternion.copy(q);
      line.scale.set(1, len * (shotT / SHOT_TIME), 1);
      line.visible = true;
    },
    updateMarker(point, camera, assisted) {
      if (!point) {
        marker.visible = false;
        return;
      }
      marker.visible = true;
      marker.position.set(point.x, point.y, point.z);
      marker.quaternion.copy(camera.quaternion); // sempre de frente para a câmera
      const dist = marker.position.distanceTo(camera.position);
      marker.scale.setScalar(Math.max(0.6, dist * 0.025));
      markerMat.color.setHex(assisted ? 0x9be7ff : 0xffffff);
    },
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      markerGeo.dispose();
      markerMat.dispose();
    },
  };
}
