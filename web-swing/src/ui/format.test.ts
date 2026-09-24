import { describe, it, expect } from 'vitest';
import { formatDelta, formatTime } from './format';

describe('Formatação de tempos', () => {
  it('m:ss.cc com centésimos truncados', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(28_559)).toBe('0:28.55');
    expect(formatTime(83_004)).toBe('1:23.00');
    expect(formatTime(599_999)).toBe('9:59.99');
    expect(formatTime(-50)).toBe('0:00.00');
  });

  it('diferença com sinal: + pior, − melhor', () => {
    expect(formatDelta(1234)).toBe('+1.23');
    expect(formatDelta(-450)).toBe('−0.45');
    expect(formatDelta(0)).toBe('+0.00');
    expect(formatDelta(-61_000)).toBe('−61.00');
  });
});
