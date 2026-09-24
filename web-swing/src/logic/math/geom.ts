/**
 * Geometria pura: raycast contra AABB (método slab), sobreposição de caixas
 * e ponto mais próximo entre segmento e raio. Usado pela física, pela mira
 * e pela colisão da câmera — nenhuma dependência de three.js.
 */

import type { Vec3 } from './vec3';
import { add, dot, scale, sub } from './vec3';

export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface RayHit {
  /** Distância ao longo do raio (raio com direção unitária → metros). */
  readonly t: number;
  readonly point: Vec3;
  /** Normal da face atingida (eixo-alinhada). */
  readonly normal: Vec3;
}

const AXES = ['x', 'y', 'z'] as const;

/**
 * Interseção raio × AABB pelo método slab. Retorna o primeiro contato com
 * t ∈ [0, maxT]; raio que começa dentro da caixa não conta como acerto
 * (a mira e a câmera nunca devem "acertar" o volume onde já estão).
 */
export function rayVsBox(origin: Vec3, dir: Vec3, box: Box, maxT: number): RayHit | null {
  let tNear = -Infinity;
  let tFar = Infinity;
  let nearAxis = -1;
  let nearSign = 0;
  for (let i = 0; i < 3; i++) {
    const a = AXES[i];
    const o = origin[a];
    const d = dir[a];
    const lo = box.min[a];
    const hi = box.max[a];
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null; // paralelo e fora do slab
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    let sign = -1; // entrando pela face mínima → normal aponta para -eixo
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tNear) {
      tNear = t1;
      nearAxis = i;
      nearSign = sign;
    }
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return null;
  }
  if (nearAxis < 0 || tNear < 0 || tNear > maxT) return null;
  const normal = {
    x: nearAxis === 0 ? nearSign : 0,
    y: nearAxis === 1 ? nearSign : 0,
    z: nearAxis === 2 ? nearSign : 0,
  };
  return { t: tNear, point: add(origin, scale(dir, tNear)), normal };
}

/** Sobreposição estrita de caixas, com folga eps para absorver erro de ponto flutuante. */
export function boxesOverlap(a: Box, b: Box, eps = 1e-6): boolean {
  return (
    a.min.x < b.max.x - eps && a.max.x > b.min.x + eps &&
    a.min.y < b.max.y - eps && a.max.y > b.min.y + eps &&
    a.min.z < b.max.z - eps && a.max.z > b.min.z + eps
  );
}

export function pointInBox(p: Vec3, box: Box): boolean {
  return (
    p.x >= box.min.x && p.x <= box.max.x &&
    p.y >= box.min.y && p.y <= box.max.y &&
    p.z >= box.min.z && p.z <= box.max.z
  );
}

/**
 * Ponto do segmento [a, b] mais próximo de um raio (origin, dir unitário,
 * t ≥ 0). Usado pela assistência de mira para achar o melhor ponto de uma
 * aresta de telhado perto da linha de visada.
 */
export function closestPointOnSegmentToRay(a: Vec3, b: Vec3, origin: Vec3, dir: Vec3): Vec3 {
  const u = sub(b, a);
  const w = sub(a, origin);
  const uu = dot(u, u);
  if (uu < 1e-12) return a;
  const ud = dot(u, dir);
  const uw = dot(u, w);
  const dw = dot(dir, w);
  const denom = uu - ud * ud; // |dir| = 1
  let s: number;
  if (denom < 1e-9) {
    s = 0; // segmento paralelo ao raio: qualquer ponto serve
  } else {
    s = (ud * dw - uw) / denom;
  }
  s = Math.min(Math.max(s, 0), 1);
  // se o ponto cair "atrás" da origem do raio, projeta no início do raio
  let p = add(a, scale(u, s));
  const tRay = dot(sub(p, origin), dir);
  if (tRay < 0) {
    s = Math.min(Math.max(-uw / uu, 0), 1);
    p = add(a, scale(u, s));
  }
  return p;
}

/**
 * O segmento [a, b] atravessa o disco (centro, normal unitária, raio)?
 * Usado na coleta de anéis: o corpo do jogador vai de a (tick anterior) a b
 * (tick atual), então nenhum anel é "pulado" mesmo a 60 m/s.
 */
export function segmentCrossesDisc(a: Vec3, b: Vec3, center: Vec3, normal: Vec3, radius: number): boolean {
  const da = dot(sub(a, center), normal);
  const db = dot(sub(b, center), normal);
  if (da === db) return false; // paralelo ao plano (ou parado)
  if (da * db > 0) return false; // os dois do mesmo lado
  const t = da / (da - db);
  const p = add(a, scale(sub(b, a), t));
  const off = sub(p, center);
  return dot(off, off) <= radius * radius;
}

/** Distância de um ponto a uma caixa (0 se estiver dentro). */
export function pointBoxDistance(p: Vec3, box: Box): number {
  const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x);
  const dy = Math.max(box.min.y - p.y, 0, p.y - box.max.y);
  const dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
