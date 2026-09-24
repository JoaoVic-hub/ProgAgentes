/**
 * Anéis coletáveis: um InstancedMesh de toros (uma draw call), orientados
 * pela normal do disco, com pulso suave. Coletado → a instância some e um
 * anel de "estouro" (malha única reaproveitada) cresce e desaparece.
 * Só lê o estado; a coleta é decidida em logic/scoring.ts.
 */

import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import type { Level } from '../logic/types';
import { PALETTE } from './palette';

const POP_TIME = 0.35;
const Z_AXIS = new Vector3(0, 0, 1);

export interface RingsView {
  readonly group: Group;
  /** collected[i] = anel i já coletado. timeSec anima o pulso. */
  update(collected: readonly boolean[], timeSec: number, dtSec: number): void;
  dispose(): void;
}

export function createRingsView(level: Level): RingsView {
  const group = new Group();
  group.name = 'rings';
  const rings = level.rings;

  const geometry = new TorusGeometry(1, 0.1, 10, 40);
  const material = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.55 });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, rings.length));
  mesh.count = rings.length;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const color = new Color();
  rings.forEach((r, i) => mesh.setColorAt(i, color.setHex(r.gold ? PALETTE.ringGold : r.risky ? PALETTE.ringRisky : PALETTE.ring)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  group.add(mesh);

  const popGeo = new TorusGeometry(1, 0.06, 8, 40);
  const popMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false });
  const pop = new Mesh(popGeo, popMat);
  pop.visible = false;
  group.add(pop);

  // orientação fixa de cada anel (a normal do disco vira o eixo Z do toro)
  const orient = rings.map((r) => new Quaternion().setFromUnitVectors(Z_AXIS, new Vector3(r.normal.x, r.normal.y, r.normal.z).normalize()));
  const m = new Matrix4();
  const pos = new Vector3();
  const scl = new Vector3();
  const wasCollected = rings.map(() => false);
  let popT = POP_TIME;

  return {
    group,
    update(collected, timeSec, dtSec) {
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        if (collected[i] && !wasCollected[i]) {
          wasCollected[i] = true;
          popT = 0;
          pop.position.set(r.center.x, r.center.y, r.center.z);
          pop.quaternion.copy(orient[i]);
          popMat.color.setHex(r.gold ? PALETTE.ringGold : PALETTE.ring);
        } else if (!collected[i]) {
          wasCollected[i] = false; // reinício do nível
        }
        const pulse = collected[i] ? 0 : r.radius * (1 + 0.04 * Math.sin(timeSec * 3 + i));
        pos.set(r.center.x, r.center.y, r.center.z);
        scl.setScalar(pulse);
        m.compose(pos, orient[i], scl);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;

      popT += dtSec;
      pop.visible = popT < POP_TIME;
      if (pop.visible) {
        const k = popT / POP_TIME;
        pop.scale.setScalar(3 * (1 + 1.2 * k));
        popMat.opacity = 1 - k;
      }
    },
    dispose() {
      group.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      popGeo.dispose();
      popMat.dispose();
    },
  };
}
