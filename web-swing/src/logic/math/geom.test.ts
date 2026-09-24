import { describe, it, expect } from 'vitest';
import { rayVsBox, boxesOverlap, closestPointOnSegmentToRay } from './geom';
import { vec3, normalize } from './vec3';

const BOX = { min: vec3(10, 0, -5), max: vec3(20, 30, 5) };

describe('Raycast slab (raio × AABB)', () => {
  it('acerta a face mais próxima com a normal correta', () => {
    const hit = rayVsBox(vec3(0, 10, 0), vec3(1, 0, 0), BOX, 100);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(10, 12);
    expect(hit!.point).toEqual({ x: 10, y: 10, z: 0 });
    expect(hit!.normal).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('vindo de cima acerta o telhado com normal +Y', () => {
    const hit = rayVsBox(vec3(15, 50, 0), vec3(0, -1, 0), BOX, 100);
    expect(hit!.t).toBeCloseTo(20, 12);
    expect(hit!.normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('raio diagonal retorna o t mínimo de entrada', () => {
    const dir = normalize(vec3(1, 1, 0));
    const hit = rayVsBox(vec3(0, 0, 0), dir, BOX, 100);
    expect(hit!.point.x).toBeCloseTo(10, 9);
    expect(hit!.point.y).toBeCloseTo(10, 9);
    expect(hit!.normal).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('raio paralelo fora do slab não acerta', () => {
    expect(rayVsBox(vec3(0, 40, 0), vec3(1, 0, 0), BOX, 100)).toBeNull();
  });

  it('raio apontando para trás não acerta', () => {
    expect(rayVsBox(vec3(0, 10, 0), vec3(-1, 0, 0), BOX, 100)).toBeNull();
  });

  it('respeita o alcance máximo', () => {
    expect(rayVsBox(vec3(0, 10, 0), vec3(1, 0, 0), BOX, 9.99)).toBeNull();
  });

  it('origem dentro da caixa não conta como acerto', () => {
    expect(rayVsBox(vec3(15, 10, 0), vec3(1, 0, 0), BOX, 100)).toBeNull();
  });
});

describe('Sobreposição de caixas', () => {
  it('caixas encostadas não se sobrepõem; interpenetradas sim', () => {
    const a = { min: vec3(0, 0, 0), max: vec3(1, 1, 1) };
    expect(boxesOverlap(a, { min: vec3(1, 0, 0), max: vec3(2, 1, 1) })).toBe(false);
    expect(boxesOverlap(a, { min: vec3(0.5, 0.5, 0.5), max: vec3(2, 2, 2) })).toBe(true);
  });
});

describe('Ponto do segmento mais próximo de um raio', () => {
  it('acha o ponto da aresta que cruza a linha de visada', () => {
    const p = closestPointOnSegmentToRay(vec3(10, 30, -50), vec3(10, 30, 50), vec3(0, 30, 0), vec3(1, 0, 0));
    expect(p).toEqual({ x: 10, y: 30, z: 0 });
  });

  it('limita o resultado às pontas do segmento', () => {
    const p = closestPointOnSegmentToRay(vec3(10, 30, 5), vec3(10, 30, 20), vec3(0, 30, 0), vec3(1, 0, 0));
    expect(p).toEqual({ x: 10, y: 30, z: 5 });
  });
});
