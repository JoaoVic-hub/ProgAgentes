import { describe, it, expect } from 'vitest';
import { countdownValue, cuesFor, distanceGain, gainFrequency, GAIN_BASE_HZ, impactIntensity, MAX_GAIN, MAX_TONE_HZ, proximityInterval, windParams } from './mapping';
import type { Cue, CueContext } from './mapping';
import type { GameEvent } from '../logic/types';

const ctx: CueContext = {
  listener: { x: 0, y: 10, z: 0 },
  launcherPos: (id) => (id === 0 ? { x: 0, y: 10, z: 10 } : id === 1 ? { x: 0, y: 10, z: 500 } : null),
  momentumMax: 5,
};

/** Todo ganho que sai do mapeamento. */
function gains(cues: Cue[]): number[] {
  return cues.flatMap((c) => ('gain' in c ? [c.gain] : 'intensity' in c ? [c.intensity] : 'amount' in c ? [c.amount] : []));
}

describe('Áudio: mapeamentos puros (Etapa 4)', () => {
  it('o tom do ganho de impulso sobe com o nível e nunca passa do teto', () => {
    expect(gainFrequency(0)).toBe(GAIN_BASE_HZ);
    let prev = 0;
    for (let v = 0.5; v <= 5; v += 0.5) {
      const f = gainFrequency(v);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
    expect(gainFrequency(1e6)).toBe(MAX_TONE_HZ);
    expect(gainFrequency(-3)).toBe(GAIN_BASE_HZ);
  });

  it('ganhos sempre em [0, 1]: distância, impacto, vento', () => {
    for (const d of [-5, 0, 12, 40, 80, 129, 130, 1e9, NaN]) {
      const g = distanceGain(d);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(MAX_GAIN);
    }
    expect(distanceGain(10)).toBe(1);
    expect(distanceGain(40)).toBeGreaterThan(distanceGain(80));
    expect(distanceGain(200)).toBe(0);
    for (const s of [-10, 0, 5, 30, 60, 1e5]) {
      expect(impactIntensity(s, 4, 26)).toBeGreaterThanOrEqual(0);
      expect(impactIntensity(s, 4, 26)).toBeLessThanOrEqual(1);
      const w = windParams(s);
      expect(w.gain).toBeGreaterThanOrEqual(0);
      expect(w.gain).toBeLessThanOrEqual(0.35);
    }
    expect(windParams(0).gain).toBe(0);
    expect(windParams(40).gain).toBeGreaterThan(windParams(20).gain);
    expect(windParams(40).cutoff).toBeGreaterThan(windParams(20).cutoff);
  });

  it('bipe de proximidade: nenhum longe; cada vez mais rápido perto', () => {
    expect(proximityInterval(0.2)).toBeNull();
    expect(proximityInterval(Number.NaN)).toBeNull();
    const far = proximityInterval(0.5) as number;
    const near = proximityInterval(1) as number;
    expect(near).toBeLessThan(far);
    expect(near).toBeGreaterThan(0.05);
  });

  it('countdown: 3, 2, 1 a partir dos ticks restantes', () => {
    expect([180, 121, 120, 61, 60, 1].map((t) => countdownValue(t, 60))).toEqual([3, 3, 2, 2, 1, 1]);
  });

  it('eventos viram sons; ameaças atenuam com a distância; o aviso nunca some', () => {
    const events: GameEvent[] = [
      { type: 'web_attached', anchor: { x: 0, y: 0, z: 0 }, source: 'direct' },
      { type: 'web_released', quality: 0.9, perfect: true, speed: 30, reason: 'manual', auto: false, fullSwing: true },
      { type: 'web_released', quality: 0.9, perfect: false, speed: 5, reason: 'manual', auto: false, fullSwing: false },
      { type: 'momentum_gain', kind: 'swing', gain: 0.5, value: 2.0 },
      { type: 'momentum_loss', reason: 'street', from: 4, to: 2 },
      { type: 'momentum_loss', reason: 'hit', from: 4, to: 1 },
      { type: 'launcher_aiming', launcherId: 1 },
      { type: 'missile_launched', missileId: 0, launcherId: 0 },
      { type: 'missile_launched', missileId: 1, launcherId: 1 },
      { type: 'missile_exploded', missileId: 0, pos: { x: 0, y: 10, z: 30 }, hitPlayer: false },
      { type: 'missile_exploded', missileId: 1, pos: { x: 0, y: 10, z: 1 }, hitPlayer: true },
      { type: 'player_hit', missileId: 1 },
    ];
    const cues = cuesFor(events, ctx);
    expect(cues.map((c) => c.kind)).toEqual(['thwip', 'release', 'gain', 'loss', 'warn', 'launch', 'explosion', 'hit']);
    expect(cues[1]).toEqual({ kind: 'release', perfect: true });
    expect(cues[2]).toMatchObject({ kind: 'gain', levelUp: true });
    expect(cues[4]).toEqual({ kind: 'warn', gain: 0.35 }); // lançador a 500 m: mínimo audível
    expect((cues[5] as { gain: number }).gain).toBe(1); // lançador a 10 m
    for (const g of gains(cues)) {
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(MAX_GAIN);
    }
  });

  it('pouso fraquinho não faz som; bonk forte é mais intenso que fraco', () => {
    expect(cuesFor([{ type: 'landed', speed: 3, kind: 'roof' }], ctx)).toEqual([]);
    const [weak] = cuesFor([{ type: 'bonk', speed: 23 }], ctx) as { intensity: number }[];
    const [hard] = cuesFor([{ type: 'bonk', speed: 40 }], ctx) as { intensity: number }[];
    expect(hard.intensity).toBeGreaterThan(weak.intensity);
  });
});
