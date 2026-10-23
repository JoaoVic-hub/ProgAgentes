/**
 * Boneco de primitivas (cápsulas, esferas e caixas) montado como hierarquia
 * de Groups — uma "junta" por Group. Recebe a pose pura (pose.ts) e aplica:
 *  - orientação do corpo inteiro (calculada pura em orientation.ts);
 *  - braço direito apontando para o ponto de contato da teia, entrando e
 *    saindo com peso suavizado (~70 ms) para não estalar no anexo/soltura;
 *  - rotação do corpo inteiro no flip (em torno do quadril).
 * Altura ~1,8 m, olhando para +Z no espaço local.
 */

import {
  BoxGeometry,
  Euler,
  CapsuleGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import type { Vec3 } from '../../logic/types';
import type { JointName, Pose } from './pose';
import type { Quat } from './orientation';
import { PALETTE } from '../palette';

export interface CharacterRig {
  readonly root: Group;
  update(feet: Vec3, pose: Pose, orientation: Quat, ropeContact: Vec3 | null, dtSec: number): void;
  /** Posição de mundo da mão direita (de onde sai a teia). */
  handWorld(out: Vector3): Vector3;
  dispose(): void;
}

const HIPS_HEIGHT = 0.95;
const DOWN = new Vector3(0, -1, 0);
/** Rapidez com que o braço entra/sai da mira da teia (1/s): ~70 ms. */
const ARM_AIM_SHARPNESS = 35;

export function createCharacterRig(): CharacterRig {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const geo = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const red = new MeshStandardMaterial({ color: PALETTE.hero, roughness: 0.55 });
  const blue = new MeshStandardMaterial({ color: PALETTE.heroAccent, roughness: 0.6 });
  const white = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 });
  materials.push(red, blue, white);

  /** castShadow só nas peças grandes: as pequenas quase não aparecem na sombra e custam uma draw call cada. */
  function part(g: BufferGeometry, m: Material, x: number, y: number, z: number, shadow = true): Mesh {
    const mesh = new Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    return mesh;
  }
  function joint(x: number, y: number, z: number, ...children: Group['children']): Group {
    const g = new Group();
    g.position.set(x, y, z);
    for (const c of children) g.add(c);
    return g;
  }

  const upperArm = geo(new CapsuleGeometry(0.05, 0.2, 4, 8));
  const forearm = geo(new CapsuleGeometry(0.045, 0.18, 4, 8));
  const hand = geo(new SphereGeometry(0.05, 10, 8));
  const thigh = geo(new CapsuleGeometry(0.07, 0.28, 4, 8));
  const shin = geo(new CapsuleGeometry(0.06, 0.28, 4, 8));
  const foot = geo(new BoxGeometry(0.1, 0.07, 0.22));

  function arm(side: 1 | -1): { shoulder: Group; elbow: Group; hand: Group } {
    const handMarker = joint(0, -0.29, 0, part(hand, red, 0, 0, 0, false));
    const elbow = joint(0, -0.29, 0, part(forearm, red, 0, -0.14, 0, false), handMarker);
    const shoulder = joint(0.21 * side, 0.46, 0, part(upperArm, blue, 0, -0.14, 0), elbow);
    return { shoulder, elbow, hand: handMarker };
  }
  function leg(side: 1 | -1): { hip: Group; knee: Group } {
    const knee = joint(0, -0.42, 0, part(shin, blue, 0, -0.2, 0), part(foot, red, 0, -0.4, 0.05, false));
    const hip = joint(0.1 * side, -0.06, 0, part(thigh, blue, 0, -0.21, 0), knee);
    return { hip, knee };
  }

  // o lado esquerdo do boneco (olhando para +Z) é +X
  const armL = arm(1);
  const armR = arm(-1);
  const legL = leg(1);
  const legR = leg(-1);

  const head = part(geo(new SphereGeometry(0.13, 16, 12)), red, 0, 0.14, 0);
  const eyeGeo = geo(new BoxGeometry(0.06, 0.035, 0.02));
  const eyeL = part(eyeGeo, white, 0.05, 0.16, 0.118, false);
  const eyeR = part(eyeGeo, white, -0.05, 0.16, 0.118, false);
  eyeL.rotation.z = -0.35;
  eyeR.rotation.z = 0.35;
  const neck = joint(0, 0.52, 0, head, eyeL, eyeR);

  const torso = part(geo(new CapsuleGeometry(0.16, 0.3, 6, 12)), red, 0, 0.27, 0);
  torso.scale.set(1, 1, 0.75);
  const spine = joint(0, 0.08, 0, torso, neck, armL.shoulder, armR.shoulder);
  const pelvis = part(geo(new BoxGeometry(0.3, 0.16, 0.2)), blue, 0, 0, 0);
  const body = joint(0, HIPS_HEIGHT, 0, pelvis, spine, legL.hip, legR.hip);
  const root = new Group();
  root.name = 'character';
  root.add(body);

  const joints: Record<JointName, Group> = {
    spine,
    neck,
    shoulderL: armL.shoulder,
    elbowL: armL.elbow,
    shoulderR: armR.shoulder,
    elbowR: armR.elbow,
    hipL: legL.hip,
    kneeL: legL.knee,
    hipR: legR.hip,
    kneeR: legR.knee,
  };

  const tmpV = new Vector3();
  const invParent = new Matrix4();
  const shoulderWorld = new Vector3();
  const poseQ = new Quaternion();
  const aimQ = new Quaternion();
  const euler = new Euler();
  const lastContact = new Vector3();
  let aimWeight = 0;

  return {
    root,
    update(feet, pose, orientation, ropeContact, dtSec) {
      root.position.set(feet.x, feet.y, feet.z);
      root.quaternion.set(orientation[0], orientation[1], orientation[2], orientation[3]);

      // pose
      body.position.y = HIPS_HEIGHT + pose.hipsOffsetY;
      body.rotation.set(pose.bodyPitch, 0, 0);
      for (const name of Object.keys(joints) as JointName[]) {
        const [x, y, z] = pose.joints[name];
        joints[name].rotation.set(x, y, z);
      }

      // braço direito apontando para o contato da teia, com peso suavizado
      const wantAim = ropeContact ? 1 : 0;
      aimWeight += (wantAim - aimWeight) * (1 - Math.exp(-ARM_AIM_SHARPNESS * dtSec));
      if (ropeContact) lastContact.set(ropeContact.x, ropeContact.y, ropeContact.z);
      root.updateMatrixWorld(true);
      if (aimWeight > 0.001) {
        armR.shoulder.getWorldPosition(shoulderWorld);
        tmpV.copy(lastContact).sub(shoulderWorld).normalize();
        invParent.copy(spine.matrixWorld).invert();
        tmpV.transformDirection(invParent); // direção no espaço local da coluna
        aimQ.setFromUnitVectors(DOWN, tmpV);
        const [sx, sy, sz] = pose.joints.shoulderR;
        poseQ.setFromEuler(euler.set(sx, sy, sz));
        armR.shoulder.quaternion.copy(poseQ).slerp(aimQ, aimWeight);
        const [ex, ey, ez] = pose.joints.elbowR;
        const keep = 1 - aimWeight;
        armR.elbow.rotation.set(ex * keep, ey * keep, ez * keep);
        armR.shoulder.updateMatrixWorld(true);
      }
    },
    handWorld(out) {
      return armR.hand.getWorldPosition(out);
    },
    dispose() {
      root.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
