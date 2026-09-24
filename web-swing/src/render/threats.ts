/**
 * Visual das ameaças (só leitura do estado lógico, via ThreatFrame):
 *
 * - Lançadores: base fixa no telhado + cabeça com cano (instanciadas) que
 *   varre a avenida parada e segue o jogador quando mira/dispara.
 * - Aviso de mira: laser do cano até o peito do jogador e uma lâmpada
 *   vermelha na cabeça (visível de longe), piscando cada vez mais rápido
 *   até o disparo (a "hora de desviar").
 * - Mísseis: corpo + brilho do motor (instanciados, orientados pela
 *   velocidade) e rastro de fumaça em pool fixo.
 * - Explosões: esferas aditivas que crescem e apagam + fumaça.
 *
 * Tudo em InstancedMesh com capacidade fixa: 8 draw calls, sem alocação por
 * frame. Aleatoriedade aqui é só cosmética (render não é lógica).
 */

import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Level, LauncherState } from '../logic/types';
import type { Vec3 } from '../logic/math/vec3';
import { PALETTE } from './palette';

export interface LauncherFrame {
  readonly phase: LauncherState['phase'];
  /** Progresso do aviso de mira em [0, 1] (1 = disparando). */
  readonly warn: number;
}

export interface MissileFrame {
  readonly id: number;
  readonly pos: Vec3;
  readonly vel: Vec3;
}

export interface ThreatFrame {
  /** Na mesma ordem de level.launchers. */
  readonly launchers: readonly LauncherFrame[];
  /** Peito do jogador (interpolado): para onde os lançadores olham. */
  readonly target: Vec3;
  readonly missiles: readonly MissileFrame[];
}

export interface ThreatsView {
  readonly group: Group;
  update(frame: ThreatFrame, timeSec: number, dtSec: number): void;
  /** Explosão no ponto (hitPlayer = maior e mais quente). */
  explode(pos: Vec3, hitPlayer: boolean): void;
  /** Some com rastros e explosões (respawn/troca de nível). */
  reset(): void;
  dispose(): void;
}

const MAX_MISSILES = 32;
const MAX_PUFFS = 640;
const MAX_BLASTS = 16;
/** Distância percorrida entre dois "puffs" de fumaça (m). */
const PUFF_SPACING = 1.1;
const PUFF_LIFE = 0.65;
const BLAST_LIFE = 0.5;
const BARREL_LENGTH = 1.7;
/** Meia altura da cabeça: a base vai da laje até logo abaixo dela. */
const HEAD_HALF = 0.4;

const FORWARD = new Vector3(0, 0, 1);
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

function missileGeometry(): BufferGeometry {
  const body = new CylinderGeometry(0.14, 0.14, 1.1, 8);
  body.rotateX(Math.PI / 2);
  const nose = new ConeGeometry(0.14, 0.38, 8);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 0, 0.74);
  const finA = new BoxGeometry(0.62, 0.04, 0.26);
  finA.translate(0, 0, -0.45);
  const finB = new BoxGeometry(0.04, 0.62, 0.26);
  finB.translate(0, 0, -0.45);
  const merged = mergeGeometries([body.toNonIndexed(), nose.toNonIndexed(), finA.toNonIndexed(), finB.toNonIndexed()]);
  for (const g of [body, nose, finA, finB]) g.dispose();
  return merged;
}

function headGeometry(): BufferGeometry {
  const head = new BoxGeometry(1.1, 0.8, 1.1);
  const barrel = new CylinderGeometry(0.17, 0.2, BARREL_LENGTH, 10);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 0.05, BARREL_LENGTH / 2 + 0.2);
  const merged = mergeGeometries([head.toNonIndexed(), barrel.toNonIndexed()]);
  head.dispose();
  barrel.dispose();
  return merged;
}

export function createThreatsView(level: Level): ThreatsView {
  const group = new Group();
  group.name = 'threats';
  const launchers = level.launchers;
  const n = Math.max(1, launchers.length);
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const track = <G extends BufferGeometry, M extends Material>(g: G, m: M): [G, M] => {
    geometries.push(g);
    materials.push(m);
    return [g, m];
  };

  // ---- lançadores: base (estática) e cabeça + cano (orientada por frame)
  // base unitária (altura 1), esticada da laje até a cabeça
  const [baseGeo, baseMat] = track(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x3a3d4a, roughness: 0.8, metalness: 0.3 }));
  const bases = new InstancedMesh(baseGeo, baseMat, n);
  const [headGeo, headMat] = track(headGeometry(), new MeshStandardMaterial({ color: 0x5c606e, roughness: 0.5, metalness: 0.6, emissive: 0x300808 }));
  const heads = new InstancedMesh(headGeo, headMat, n);
  heads.instanceMatrix.setUsage(DynamicDrawUsage);
  const m4 = new Matrix4();
  const q = new Quaternion();
  const v = new Vector3();
  const w = new Vector3();
  const s = new Vector3(1, 1, 1);
  launchers.forEach((L, i) => {
    const roofTop = level.solids[L.solidId]?.box.max.y ?? L.pos.y - 2;
    const h = Math.max(0.2, L.pos.y - HEAD_HALF - roofTop);
    m4.compose(v.set(L.pos.x, roofTop + h / 2, L.pos.z), q.identity(), s.set(0.9, h, 0.9));
    bases.setMatrixAt(i, m4);
  });
  bases.count = launchers.length;
  heads.count = launchers.length;

  // ---- laser de aviso (cilindro unitário de z = 0 a 1, escalado por instância)
  const laserGeo = new CylinderGeometry(1, 1, 1, 6, 1, true);
  laserGeo.rotateX(Math.PI / 2);
  laserGeo.translate(0, 0, 0.5);
  const [, laserMat] = track(laserGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
  const lasers = new InstancedMesh(laserGeo, laserMat, n);
  lasers.instanceMatrix.setUsage(DynamicDrawUsage);
  lasers.frustumCulled = false;
  const laserColor = new Color();
  for (let i = 0; i < n; i++) {
    lasers.setMatrixAt(i, HIDDEN);
    lasers.setColorAt(i, laserColor.setRGB(0, 0, 0));
  }
  lasers.count = launchers.length;
  const [lampGeo, lampMat] = track(new IcosahedronGeometry(0.5, 1), new MeshBasicMaterial({ color: PALETTE.laser, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
  const lamps = new InstancedMesh(lampGeo, lampMat, n);
  lamps.instanceMatrix.setUsage(DynamicDrawUsage);
  lamps.frustumCulled = false;
  for (let i = 0; i < n; i++) lamps.setMatrixAt(i, HIDDEN);
  lamps.count = launchers.length;

  // ---- mísseis e brilho do motor
  const [missileGeo, missileMat] = track(missileGeometry(), new MeshStandardMaterial({ color: 0xd9dce4, roughness: 0.45, metalness: 0.4, emissive: 0x220000 }));
  const missiles = new InstancedMesh(missileGeo, missileMat, MAX_MISSILES);
  missiles.instanceMatrix.setUsage(DynamicDrawUsage);
  missiles.frustumCulled = false;
  missiles.count = 0;
  const [glowGeo, glowMat] = track(new IcosahedronGeometry(0.34, 1), new MeshBasicMaterial({ color: PALETTE.missileGlow, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
  const glows = new InstancedMesh(glowGeo, glowMat, MAX_MISSILES);
  glows.instanceMatrix.setUsage(DynamicDrawUsage);
  glows.frustumCulled = false;
  glows.count = 0;

  // ---- fumaça (rastros e explosões), pool circular
  const [puffGeo, puffMat] = track(new IcosahedronGeometry(1, 0), new MeshBasicMaterial({ color: PALETTE.smoke, transparent: true, opacity: 0.38, depthWrite: false }));
  const puffs = new InstancedMesh(puffGeo, puffMat, MAX_PUFFS);
  puffs.instanceMatrix.setUsage(DynamicDrawUsage);
  puffs.frustumCulled = false;
  const puffPos = new Float32Array(MAX_PUFFS * 3);
  const puffAge = new Float32Array(MAX_PUFFS).fill(Infinity);
  const puffLife = new Float32Array(MAX_PUFFS).fill(1);
  const puffSize = new Float32Array(MAX_PUFFS);
  const puffRise = new Float32Array(MAX_PUFFS);
  let nextPuff = 0;
  for (let i = 0; i < MAX_PUFFS; i++) puffs.setMatrixAt(i, HIDDEN);

  // ---- explosões
  const [blastGeo, blastMat] = track(new IcosahedronGeometry(1, 2), new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
  const blasts = new InstancedMesh(blastGeo, blastMat, MAX_BLASTS);
  blasts.instanceMatrix.setUsage(DynamicDrawUsage);
  blasts.frustumCulled = false;
  const blastPos = new Float32Array(MAX_BLASTS * 3);
  const blastAge = new Float32Array(MAX_BLASTS).fill(Infinity);
  const blastSize = new Float32Array(MAX_BLASTS);
  let nextBlast = 0;
  const blastColor = new Color();
  const hot = new Color(PALETTE.blastHot);
  const cool = new Color(PALETTE.blastCool);
  for (let i = 0; i < MAX_BLASTS; i++) {
    blasts.setMatrixAt(i, HIDDEN);
    blasts.setColorAt(i, blastColor.setRGB(0, 0, 0));
  }

  for (const mesh of [bases, heads, lasers, lamps, missiles, glows, puffs, blasts]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }
  bases.receiveShadow = true;

  /** Último ponto onde cada míssil soltou fumaça. */
  const lastPuff = new Map<number, Vector3>();

  function puff(x: number, y: number, z: number, size: number, life: number, rise: number) {
    const i = nextPuff;
    nextPuff = (nextPuff + 1) % MAX_PUFFS;
    puffPos[i * 3] = x;
    puffPos[i * 3 + 1] = y;
    puffPos[i * 3 + 2] = z;
    puffAge[i] = 0;
    puffLife[i] = life;
    puffSize[i] = size;
    puffRise[i] = rise;
  }

  function aimHead(i: number, from: Vec3, dir: Vector3) {
    q.setFromUnitVectors(FORWARD, dir);
    m4.compose(v.set(from.x, from.y, from.z), q, s.set(1, 1, 1));
    heads.setMatrixAt(i, m4);
  }

  return {
    group,
    update(frame, timeSec, dtSec) {
      // lançadores e lasers
      launchers.forEach((L, i) => {
        const lf = frame.launchers[i];
        const tracking = lf && lf.phase !== 'idle';
        if (tracking) {
          w.set(frame.target.x - L.pos.x, frame.target.y - L.pos.y, frame.target.z - L.pos.z).normalize();
        } else {
          // parado: varre a avenida devagar (cada um num ritmo)
          const sweep = Math.sin(timeSec * 0.6 + i * 1.7) * 0.6;
          w.set(-L.side * Math.cos(sweep), 0.25, Math.sin(sweep)).normalize();
        }
        aimHead(i, L.pos, w);
        if (lf && (lf.phase === 'aiming' || lf.phase === 'firing')) {
          const muzzle = v.set(L.pos.x, L.pos.y + 0.05, L.pos.z).addScaledVector(w, BARREL_LENGTH + 0.2);
          const len = Math.max(0.1, Math.hypot(frame.target.x - muzzle.x, frame.target.y - muzzle.y, frame.target.z - muzzle.z) - 0.6);
          // mais grosso de longe: nunca some para menos de ~2–3 px na tela
          const width = Math.max(0.06, len * 0.0035);
          q.setFromUnitVectors(FORWARD, w);
          m4.compose(muzzle, q, s.set(width, width, len));
          lasers.setMatrixAt(i, m4);
          // pisca cada vez mais rápido; disparando fica aceso
          const p = lf.phase === 'firing' ? 1 : lf.warn;
          const blink = lf.phase === 'firing' ? 1 : Math.sin(timeSec * (8 + 30 * p)) > -0.2 ? 1 : 0.25;
          const k = (0.35 + 0.65 * p) * blink;
          lasers.setColorAt(i, laserColor.setHex(PALETTE.laser).multiplyScalar(k));
          const lamp = (0.6 + 1.4 * p) * (blink === 1 ? 1 : 0.55);
          m4.compose(v.set(L.pos.x, L.pos.y + 0.75, L.pos.z), q.identity(), s.set(lamp, lamp, lamp));
          lamps.setMatrixAt(i, m4);
        } else {
          lasers.setMatrixAt(i, HIDDEN);
          lamps.setMatrixAt(i, HIDDEN);
        }
      });
      heads.instanceMatrix.needsUpdate = true;
      lasers.instanceMatrix.needsUpdate = true;
      lamps.instanceMatrix.needsUpdate = true;
      if (lasers.instanceColor) lasers.instanceColor.needsUpdate = true;

      // mísseis, brilho e rastro
      const count = Math.min(MAX_MISSILES, frame.missiles.length);
      const alive = new Set<number>();
      for (let i = 0; i < count; i++) {
        const m = frame.missiles[i];
        alive.add(m.id);
        w.set(m.vel.x, m.vel.y, m.vel.z);
        if (w.lengthSq() < 1e-8) w.set(0, 0, 1);
        w.normalize();
        q.setFromUnitVectors(FORWARD, w);
        m4.compose(v.set(m.pos.x, m.pos.y, m.pos.z), q, s.set(1, 1, 1));
        missiles.setMatrixAt(i, m4);
        const flicker = 0.85 + Math.random() * 0.4;
        m4.compose(v.set(m.pos.x - w.x * 0.75, m.pos.y - w.y * 0.75, m.pos.z - w.z * 0.75), q, s.set(flicker, flicker, flicker * 1.6));
        glows.setMatrixAt(i, m4);
        const last = lastPuff.get(m.id);
        if (!last) {
          lastPuff.set(m.id, new Vector3(m.pos.x, m.pos.y, m.pos.z));
        } else {
          // um puff a cada PUFF_SPACING metros (independe do FPS)
          let d = last.distanceTo(v.set(m.pos.x, m.pos.y, m.pos.z));
          while (d >= PUFF_SPACING) {
            last.lerp(v, PUFF_SPACING / d);
            puff(last.x - w.x * 0.9, last.y - w.y * 0.9, last.z - w.z * 0.9, 0.22 + Math.random() * 0.1, PUFF_LIFE, 0.6);
            d -= PUFF_SPACING;
          }
        }
      }
      for (const id of lastPuff.keys()) if (!alive.has(id)) lastPuff.delete(id);
      missiles.count = count;
      glows.count = count;
      missiles.instanceMatrix.needsUpdate = true;
      glows.instanceMatrix.needsUpdate = true;

      // fumaça: cresce e some
      for (let i = 0; i < MAX_PUFFS; i++) {
        if (puffAge[i] === Infinity) continue;
        puffAge[i] += dtSec;
        const t = puffAge[i] / puffLife[i];
        if (t >= 1) {
          puffAge[i] = Infinity;
          puffs.setMatrixAt(i, HIDDEN);
          continue;
        }
        const size = puffSize[i] * (1 + 2.2 * t) * (1 - t * t);
        m4.makeScale(size, size, size);
        m4.setPosition(puffPos[i * 3], puffPos[i * 3 + 1] + puffRise[i] * puffAge[i], puffPos[i * 3 + 2]);
        puffs.setMatrixAt(i, m4);
      }
      puffs.instanceMatrix.needsUpdate = true;

      // explosões: crescem e esfriam (aditivo: escurecer = apagar)
      for (let i = 0; i < MAX_BLASTS; i++) {
        if (blastAge[i] === Infinity) continue;
        blastAge[i] += dtSec;
        const t = blastAge[i] / BLAST_LIFE;
        if (t >= 1) {
          blastAge[i] = Infinity;
          blasts.setMatrixAt(i, HIDDEN);
          continue;
        }
        const size = blastSize[i] * (0.35 + 0.65 * Math.sqrt(t));
        m4.makeScale(size, size, size);
        m4.setPosition(blastPos[i * 3], blastPos[i * 3 + 1], blastPos[i * 3 + 2]);
        blasts.setMatrixAt(i, m4);
        blasts.setColorAt(i, blastColor.copy(hot).lerp(cool, t).multiplyScalar(1 - t));
      }
      blasts.instanceMatrix.needsUpdate = true;
      if (blasts.instanceColor) blasts.instanceColor.needsUpdate = true;
    },
    explode(pos, hitPlayer) {
      const i = nextBlast;
      nextBlast = (nextBlast + 1) % MAX_BLASTS;
      blastPos[i * 3] = pos.x;
      blastPos[i * 3 + 1] = pos.y;
      blastPos[i * 3 + 2] = pos.z;
      blastAge[i] = 0;
      blastSize[i] = hitPlayer ? 4.5 : 3.2;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const r = 0.8 + Math.random() * 1.2;
        puff(pos.x + Math.cos(a) * r, pos.y + (Math.random() - 0.3) * 1.2, pos.z + Math.sin(a) * r, 0.7 + Math.random() * 0.6, 1.1 + Math.random() * 0.5, 1.4);
      }
    },
    reset() {
      lastPuff.clear();
      puffAge.fill(Infinity);
      blastAge.fill(Infinity);
      for (let i = 0; i < MAX_PUFFS; i++) puffs.setMatrixAt(i, HIDDEN);
      for (let i = 0; i < MAX_BLASTS; i++) blasts.setMatrixAt(i, HIDDEN);
      puffs.instanceMatrix.needsUpdate = true;
      blasts.instanceMatrix.needsUpdate = true;
      missiles.count = 0;
      glows.count = 0;
    },
    dispose() {
      group.removeFromParent();
      for (const mesh of [bases, heads, lasers, lamps, missiles, glows, puffs, blasts]) mesh.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
