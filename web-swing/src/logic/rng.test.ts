import { describe, it, expect } from 'vitest';
import { nextRandom, nextInt, nextRange } from './rng';

function sequence(seed: number, n: number): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    const [ns, v] = nextRandom(s);
    s = ns;
    out.push(v);
  }
  return out;
}

describe('PRNG Mulberry32 (Princípio III)', () => {
  it('a mesma seed produz a mesma sequência', () => {
    expect(sequence(42, 100)).toEqual(sequence(42, 100));
  });

  it('seeds diferentes produzem sequências diferentes', () => {
    expect(sequence(1, 10)).not.toEqual(sequence(2, 10));
  });

  it('valores ficam sempre em [0, 1)', () => {
    for (const v of sequence(7, 1000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt fica em [0, max) e nextRange em [min, max)', () => {
    let s = 123;
    for (let i = 0; i < 1000; i++) {
      const [s1, n] = nextInt(s, 6);
      const [s2, r] = nextRange(s1, -3, 5);
      s = s2;
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThan(5);
    }
  });
});
