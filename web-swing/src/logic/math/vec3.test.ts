import { describe, it, expect } from 'vitest';
import { vec3, add, sub, scale, addScaled, dot, cross, length, distance, normalize, lerp, ZERO } from './vec3';

describe('Vec3 (matemática pura da lógica)', () => {
  it('normalizar vetor nulo retorna vetor nulo, sem NaN', () => {
    expect(normalize(ZERO)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('normalizar retorna comprimento 1 na mesma direção', () => {
    const n = normalize(vec3(3, 0, 4));
    expect(length(n)).toBeCloseTo(1, 12);
    expect(n.x).toBeCloseTo(0.6, 12);
    expect(n.z).toBeCloseTo(0.8, 12);
  });

  it('produto vetorial segue a regra da mão direita (X × Y = Z)', () => {
    expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('operações básicas batem com o esperado', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, -5, 6);
    expect(add(a, b)).toEqual({ x: 5, y: -3, z: 9 });
    expect(sub(a, b)).toEqual({ x: -3, y: 7, z: -3 });
    expect(scale(a, 2)).toEqual({ x: 2, y: 4, z: 6 });
    expect(addScaled(a, b, 0.5)).toEqual({ x: 3, y: -0.5, z: 6 });
    expect(dot(a, b)).toBe(4 - 10 + 18);
    expect(distance(vec3(0, 0, 0), vec3(0, 3, 4))).toBe(5);
    expect(lerp(a, b, 0.5)).toEqual({ x: 2.5, y: -1.5, z: 4.5 });
  });

  it('nenhuma operação muta os argumentos', () => {
    const a = Object.freeze(vec3(1, 2, 3));
    const b = Object.freeze(vec3(4, 5, 6));
    expect(() => {
      add(a, b); sub(a, b); scale(a, 3); addScaled(a, b, 2);
      cross(a, b); normalize(a); lerp(a, b, 0.3);
    }).not.toThrow();
    expect(a).toEqual({ x: 1, y: 2, z: 3 });
    expect(b).toEqual({ x: 4, y: 5, z: 6 });
  });
});
