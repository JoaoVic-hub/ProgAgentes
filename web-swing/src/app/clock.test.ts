import { describe, it, expect } from 'vitest';
import { advanceClock, createClock, DEFAULT_CLOCK_CONFIG } from './clock';
import type { ClockState } from './clock';

const TICK = DEFAULT_CLOCK_CONFIG.tickMs;

describe('Relógio de timestep fixo', () => {
  it('delta de 10 000 ms roda só 5 ticks e zera o acumulador', () => {
    const r = advanceClock(createClock(), 10_000);
    expect(r.ticks).toBe(5);
    expect(r.clock.accumulatorMs).toBe(0);
    expect(r.alpha).toBe(0);
    expect(r.droppedMs).toBeGreaterThan(0);
  });

  it('frames curtos acumulam frações até completar um tick', () => {
    let clock: ClockState = createClock();
    const r1 = advanceClock(clock, 8);
    clock = r1.clock;
    const r2 = advanceClock(clock, 8);
    clock = r2.clock;
    const r3 = advanceClock(clock, 8);
    expect([r1.ticks, r2.ticks, r3.ticks]).toEqual([0, 0, 1]);
    expect(r3.clock.accumulatorMs).toBeCloseTo(24 - TICK, 9);
  });

  it('alpha fica sempre em [0, 1) para qualquer sequência de deltas', () => {
    let clock: ClockState = createClock();
    const deltas = [0, 1, 7, 16.6, 16.7, 33, 50, 90, 250, 1000, 3.3, 144, 6.94];
    for (let i = 0; i < 500; i++) {
      const r = advanceClock(clock, deltas[i % deltas.length]);
      expect(r.alpha).toBeGreaterThanOrEqual(0);
      expect(r.alpha).toBeLessThan(1);
      clock = r.clock;
    }
  });

  it('catch-up dentro do limite preserva o resto do acumulador', () => {
    const r = advanceClock(createClock(), 90);
    expect(r.ticks).toBe(5);
    expect(r.droppedMs).toBe(0);
    expect(r.clock.accumulatorMs).toBeCloseTo(90 - 5 * TICK, 9);
  });

  it('delta negativo ou inválido é tratado como zero', () => {
    for (const d of [-50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = advanceClock({ accumulatorMs: 3 }, d);
      expect(r.ticks).toBe(0);
      expect(r.clock.accumulatorMs).toBe(3);
    }
  });
});
