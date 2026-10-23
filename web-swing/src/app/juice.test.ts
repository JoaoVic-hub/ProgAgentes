import { describe, it, expect } from 'vitest';
import { addTrauma, lateralSpeed, MAX_ROLL, NO_SHAKE, shakeOffsets, SHAKE_MAX_ANGLE, SHAKE_MAX_OFFSET, smoothNoise, speedLinesIntensity, stepRoll, stepShake, targetRoll, traumaFor } from './juice';

describe('Juice da câmera (Etapa 4)', () => {
  it('trauma soma limitado a 1 e decai até 0 (e fica em 0)', () => {
    let s = addTrauma(addTrauma(NO_SHAKE, 0.8), 0.8);
    expect(s.trauma).toBe(1);
    for (let i = 0; i < 60; i++) s = stepShake(s, 1 / 60);
    expect(s.trauma).toBe(0);
    s = stepShake(s, 1);
    expect(s.trauma).toBe(0);
    expect(shakeOffsets(s)).toEqual({ right: 0, up: 0, yaw: 0, pitch: 0, roll: 0 });
  });

  it('o tremor usa trauma²: forte treme muito mais que fraco, sempre dentro dos limites', () => {
    let maxWeak = 0;
    let maxStrong = 0;
    for (let t = 0; t < 3; t += 0.01) {
      const weak = shakeOffsets({ trauma: 0.3, time: t });
      const strong = shakeOffsets({ trauma: 1, time: t });
      maxWeak = Math.max(maxWeak, Math.abs(weak.right));
      maxStrong = Math.max(maxStrong, Math.abs(strong.right));
      for (const v of [strong.right, strong.up]) expect(Math.abs(v)).toBeLessThanOrEqual(SHAKE_MAX_OFFSET + 1e-12);
      for (const v of [strong.yaw, strong.pitch, strong.roll]) expect(Math.abs(v)).toBeLessThanOrEqual(SHAKE_MAX_ANGLE + 1e-12);
    }
    expect(maxStrong).toBeGreaterThan(maxWeak * 5);
  });

  it('ruído determinístico e suave (sem saltos entre frames)', () => {
    expect(smoothNoise(1.234, 3)).toBe(smoothNoise(1.234, 3));
    for (let t = 0; t < 2; t += 1 / 144) {
      expect(Math.abs(smoothNoise(t + 1 / 144, 1) - smoothNoise(t, 1))).toBeLessThan(0.3);
      expect(Math.abs(smoothNoise(t, 1))).toBeLessThanOrEqual(1);
    }
  });

  it('eventos dão trauma: míssil > bonk > pouso duro; explosão longe não treme', () => {
    const feet = { x: 0, y: 0, z: 0 };
    const hit = traumaFor({ type: 'player_hit', missileId: 0 }, feet);
    const bonk = traumaFor({ type: 'bonk', speed: 25 }, feet);
    const land = traumaFor({ type: 'landed', speed: 20, kind: 'street' }, feet);
    expect(hit).toBeGreaterThan(bonk);
    expect(bonk).toBeGreaterThan(land);
    expect(traumaFor({ type: 'landed', speed: 6, kind: 'street' }, feet)).toBe(0);
    expect(traumaFor({ type: 'missile_exploded', missileId: 0, pos: { x: 0, y: 0, z: 10 }, hitPlayer: false }, feet)).toBeGreaterThan(0);
    expect(traumaFor({ type: 'missile_exploded', missileId: 0, pos: { x: 0, y: 0, z: 90 }, hitPlayer: false }, feet)).toBe(0);
  });

  it('roll: inclina para dentro da curva, nunca passa de 3°, e converge sem depender do FPS', () => {
    expect(targetRoll(1000)).toBe(-MAX_ROLL);
    expect(targetRoll(-1000)).toBe(MAX_ROLL);
    expect(targetRoll(0)).toBeCloseTo(0, 12);
    let a = 0;
    let b = 0;
    for (let i = 0; i < 60; i++) a = stepRoll(a, 30, 1 / 60);
    for (let i = 0; i < 144; i++) b = stepRoll(b, 30, 1 / 144);
    expect(a).toBeCloseTo(b, 6);
    expect(Math.abs(a)).toBeLessThanOrEqual(MAX_ROLL);
    // direita da tela com yaw 0 é −x
    expect(lateralSpeed({ x: -10, y: 0, z: 0 }, 0)).toBeCloseTo(10, 12);
  });

  it('speed lines: zero devagar, crescem com a velocidade, cheias no máximo', () => {
    expect(speedLinesIntensity(20)).toBe(0);
    expect(speedLinesIntensity(40)).toBeGreaterThan(speedLinesIntensity(35));
    expect(speedLinesIntensity(60)).toBe(1);
  });
});
