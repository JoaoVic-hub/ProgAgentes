import { describe, it, expect } from 'vitest';
import { parseFlags, DEFAULT_FLAGS, flagsAffectGameplay } from './flags';

describe('Flags de depuração (query string)', () => {
  it('?debug=1&level=3 é interpretado corretamente', () => {
    expect(parseFlags('?debug=1&level=3', true)).toEqual({ ...DEFAULT_FLAGS, debug: true, level: 3 });
  });

  it('?debug sem valor liga o debug; debug=0 desliga', () => {
    expect(parseFlags('?debug', true).debug).toBe(true);
    expect(parseFlags('?debug=0', true).debug).toBe(false);
  });

  it('valores inválidos caem no padrão', () => {
    expect(parseFlags('?level=0&seed=abc&slowmo=-1&hz=90&cam=x&view=y', true)).toEqual(DEFAULT_FLAGS);
    expect(parseFlags('?level=-2&seed=1.5', true)).toEqual(DEFAULT_FLAGS);
    expect(parseFlags('?level=2.7', true).level).toBeNull();
  });

  it('seed é normalizada para uint32', () => {
    expect(parseFlags('?seed=42', true).seed).toBe(42);
    expect(parseFlags('?seed=4294967297', true).seed).toBe(1);
  });

  it('flags de câmera, câmera lenta, gravação, frequência e visualizador', () => {
    const f = parseFlags('?cam=free&slowmo=0.25&record=1&hz=120&view=pose', true);
    expect(f).toMatchObject({ cam: 'free', slowmo: 0.25, record: true, hz: 120, view: 'pose' });
    expect(parseFlags('?god=1&resetScores=1', true)).toMatchObject({ god: true, resetScores: true });
    expect(parseFlags('?slowmo=0.001', true).slowmo).toBe(0.05);
    expect(parseFlags('?slowmo=4', true).slowmo).toBe(1);
  });

  it('fora do modo de desenvolvimento as flags são ignoradas', () => {
    expect(parseFlags('?debug=1&level=3&seed=9&cam=free', false)).toEqual(DEFAULT_FLAGS);
  });

  it('flags que mudam o jogo são detectadas; debug visual não conta', () => {
    expect(flagsAffectGameplay(parseFlags('?debug=1', true))).toBe(false);
    expect(flagsAffectGameplay(parseFlags('?level=2', true))).toBe(true);
    expect(flagsAffectGameplay(parseFlags('?slowmo=0.5', true))).toBe(true);
    expect(flagsAffectGameplay(parseFlags('?god=1', true))).toBe(true);
    expect(flagsAffectGameplay(parseFlags('?resetScores=1', true))).toBe(false);
  });
});
