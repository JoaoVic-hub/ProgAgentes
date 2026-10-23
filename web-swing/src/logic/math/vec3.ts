/**
 * Vetor 3D imutável próprio da lógica.
 *
 * logic/ não pode importar three.js (Princípio I), então a física usa este
 * tipo plain-object — serializável em JSON e comparável com toEqual nos
 * testes. Todas as funções são puras: nunca mutam os argumentos.
 * Convenção: Y para cima, a avenida corre em +Z, unidades em metros.
 */

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

export const ZERO: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
export const UP: Vec3 = Object.freeze({ x: 0, y: 1, z: 0 });

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

/** a + b·s, sem alocar o vetor intermediário. */
export function addScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthSq(a: Vec3): number {
  return dot(a, a);
}

export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

/** Vetor unitário na direção de a; vetor nulo continua nulo (nunca NaN). */
export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  if (len === 0) return ZERO;
  return scale(a, 1 / len);
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}
