/**
 * Partículas (Etapa 4): dois pools fixos desenhados como InstancedMesh —
 * "poeira" (mistura normal, some encolhendo) e "brilho" (aditivo, apaga
 * escurecendo). Os efeitos prontos traduzem momentos do jogo:
 *   teia agarrando · pouso · bonk · subida de nível do impulso ·
 *   soltura perfeita · acerto de míssil.
 * 2 draw calls; aleatoriedade só cosmética.
 */

import { AdditiveBlending, Color, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import type { Vec3 } from '../../logic/math/vec3';
import { createParticlePool } from './particle-pool';
import type { ParticlePool, ParticleSpec } from './particle-pool';

export interface ParticlesView {
  readonly group: Group;
  /** Teia agarrou: nuvenzinha branca no ponto da fachada. */
  anchorPuff(at: Vec3): void;
  /** Pouso: anel de poeira nos pés (intensidade 0–1). */
  landingDust(feet: Vec3, intensity: number): void;
  /** Bonk: faíscas no peito. */
  sparks(at: Vec3, count: number): void;
  /** Subiu um nível de impulso: anel de brilho na cor do nível. */
  levelUp(at: Vec3, level: number): void;
  /** Soltura perfeita: brilho dourado. */
  perfect(at: Vec3): void;
  /** Levou um míssil. */
  hit(at: Vec3): void;
  update(dtSec: number): void;
  clear(): void;
  dispose(): void;
}

const DUST_CAPACITY = 320;
const GLOW_CAPACITY = 320;
const HIDDEN = new Matrix4().makeScale(0, 0, 0);
/** Cores por nível de impulso (igual ao medidor do HUD: verde → amarelo → laranja). */
const LEVEL_COLORS = [0x7cffb2, 0x7cffb2, 0xffc93c, 0xffc93c, 0xff6b3d, 0xff6b3d];

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function createParticlesView(): ParticlesView {
  const group = new Group();
  group.name = 'particles';
  const geometry = new IcosahedronGeometry(1, 0);
  const dustMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
  const glowMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false });
  const dustMesh = new InstancedMesh(geometry, dustMat, DUST_CAPACITY);
  const glowMesh = new InstancedMesh(geometry, glowMat, GLOW_CAPACITY);
  const black = new Color(0, 0, 0);
  for (const [mesh, cap] of [[dustMesh, DUST_CAPACITY], [glowMesh, GLOW_CAPACITY]] as const) {
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    for (let i = 0; i < cap; i++) {
      mesh.setMatrixAt(i, HIDDEN);
      mesh.setColorAt(i, black);
    }
    group.add(mesh);
  }
  const dust = createParticlePool(DUST_CAPACITY);
  const glow = createParticlePool(GLOW_CAPACITY);
  const m4 = new Matrix4();
  const c = new Color();

  function emit(pool: ParticlePool, base: Omit<ParticleSpec, 'vx' | 'vy' | 'vz'>, v: { x: number; y: number; z: number }) {
    pool.spawn({ ...base, vx: v.x, vy: v.y, vz: v.z });
  }

  function burst(pool: ParticlePool, at: Vec3, count: number, color: number, o: { speed: [number, number]; up: number; flat?: boolean; life: [number, number]; size: [number, number]; gravity: number; drag: number }) {
    c.setHex(color);
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const el = o.flat ? rand(-0.15, 0.25) : rand(-0.9, 1);
      const s = rand(o.speed[0], o.speed[1]);
      const h = Math.cos(el);
      emit(
        pool,
        { x: at.x, y: at.y, z: at.z, life: rand(o.life[0], o.life[1]), size: rand(o.size[0], o.size[1]), r: c.r, g: c.g, b: c.b, gravity: o.gravity, drag: o.drag },
        { x: Math.cos(a) * h * s, y: Math.sin(el) * s + o.up, z: Math.sin(a) * h * s },
      );
    }
  }

  const seenDust = new Uint8Array(DUST_CAPACITY);
  const seenGlow = new Uint8Array(GLOW_CAPACITY);

  function draw(mesh: InstancedMesh, pool: ParticlePool, seen: Uint8Array, fade: boolean) {
    seen.fill(0);
    pool.forEachAlive((i, x, y, z, size, t, r, g, b) => {
      seen[i] = 1;
      const s = Math.max(0, size);
      m4.makeScale(s, s, s);
      m4.setPosition(x, y, z);
      mesh.setMatrixAt(i, m4);
      const k = fade ? 1 - t : 1;
      mesh.setColorAt(i, c.setRGB(r * k, g * k, b * k));
    });
    for (let i = 0; i < seen.length; i++) if (!seen[i]) mesh.setMatrixAt(i, HIDDEN);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  return {
    group,
    anchorPuff(at) {
      burst(dust, at, 8, 0xf4f4f8, { speed: [2, 5], up: 0, life: [0.25, 0.4], size: [0.12, 0.22], gravity: 0, drag: 6 });
    },
    landingDust(feet, intensity) {
      const n = Math.round(6 + 14 * intensity);
      burst(dust, { x: feet.x, y: feet.y + 0.15, z: feet.z }, n, 0xa39a8c, { speed: [3, 6 + 6 * intensity], up: 0.8, flat: true, life: [0.45, 0.8], size: [0.18, 0.35 + 0.2 * intensity], gravity: 2, drag: 4 });
    },
    sparks(at, count) {
      burst(glow, at, count, 0xffb347, { speed: [6, 14], up: 3, life: [0.3, 0.6], size: [0.05, 0.1], gravity: 22, drag: 1.5 });
    },
    levelUp(at, level) {
      const color = LEVEL_COLORS[Math.max(0, Math.min(LEVEL_COLORS.length - 1, level))];
      burst(glow, at, 26, color, { speed: [7, 10], up: 0, flat: true, life: [0.45, 0.6], size: [0.08, 0.14], gravity: 0, drag: 3 });
    },
    perfect(at) {
      burst(glow, at, 12, 0xffd766, { speed: [1.5, 4], up: 2, life: [0.35, 0.55], size: [0.05, 0.1], gravity: 0, drag: 2 });
    },
    hit(at) {
      burst(glow, at, 30, 0xff7a3d, { speed: [8, 16], up: 2, life: [0.3, 0.7], size: [0.06, 0.12], gravity: 18, drag: 1.5 });
      burst(dust, at, 6, 0x6a6a76, { speed: [2, 4], up: 1, life: [0.5, 0.8], size: [0.12, 0.25], gravity: -1, drag: 2 });
    },
    update(dtSec) {
      dust.step(dtSec);
      glow.step(dtSec);
      draw(dustMesh, dust, seenDust, false);
      draw(glowMesh, glow, seenGlow, true);
    },
    clear() {
      dust.clear();
      glow.clear();
    },
    dispose() {
      group.removeFromParent();
      dustMesh.dispose();
      glowMesh.dispose();
      geometry.dispose();
      dustMat.dispose();
      glowMat.dispose();
    },
  };
}
