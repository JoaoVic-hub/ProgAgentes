import { describe, it, expect } from 'vitest';
import { createParticlePool } from './particle-pool';
import type { ParticleSpec } from './particle-pool';

const spec = (over: Partial<ParticleSpec> = {}): ParticleSpec => ({
  x: 0, y: 10, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 1, r: 1, g: 1, b: 1, gravity: 0, drag: 0, ...over,
});

describe('Pool de partículas (Etapa 4)', () => {
  it('tamanho fixo: passar da capacidade substitui as mais antigas, nunca cresce', () => {
    const pool = createParticlePool(8);
    for (let i = 0; i < 20; i++) pool.spawn(spec({ x: i }));
    expect(pool.capacity).toBe(8);
    expect(pool.alive()).toBe(8);
    const xs: number[] = [];
    pool.forEachAlive((_i, x) => xs.push(x));
    expect(xs.sort((a, b) => a - b)).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('partícula morre ao fim da vida e libera a vaga', () => {
    const pool = createParticlePool(4);
    pool.spawn(spec({ life: 0.5 }));
    pool.spawn(spec({ life: 2 }));
    pool.step(0.6);
    expect(pool.alive()).toBe(1);
    pool.step(2);
    expect(pool.alive()).toBe(0);
    pool.spawn(spec({ life: 0 })); // vida inválida: ignorada
    expect(pool.alive()).toBe(0);
  });

  it('gravidade puxa para baixo, arrasto freia, tamanho encolhe até sumir', () => {
    const pool = createParticlePool(2);
    pool.spawn(spec({ vx: 10, gravity: 20, drag: 3 }));
    let first: { x: number; y: number; size: number } | null = null;
    pool.forEachAlive((_i, x, y, _z, size) => (first = { x, y, size }));
    for (let i = 0; i < 30; i++) pool.step(1 / 60);
    let now: { x: number; y: number; size: number } | null = null;
    pool.forEachAlive((_i, x, y, _z, size) => (now = { x, y, size }));
    expect(now!.y).toBeLessThan(first!.y);
    expect(now!.x).toBeGreaterThan(0);
    expect(now!.x).toBeLessThan(10 * 0.5); // sem arrasto andaria 5 m em 0,5 s
    expect(now!.size).toBeLessThan(first!.size);
  });

  it('clear some com tudo', () => {
    const pool = createParticlePool(4);
    pool.spawn(spec());
    pool.clear();
    expect(pool.alive()).toBe(0);
  });
});
