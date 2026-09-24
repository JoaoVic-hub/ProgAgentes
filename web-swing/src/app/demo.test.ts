import { describe, it, expect } from 'vitest';
import fixture from '../logic/__fixtures__/replay-l1.json';
import { nextDemoInput, startDemo } from './demo';
import { DEFAULT_GAME_CONFIG } from '../logic/config';
import { step } from '../logic/engine';
import type { InputRecording } from '../logic/replay';
import type { GameState } from '../logic/types';

const recording = (fixture as unknown as { recording: InputRecording }).recording;

describe('Demonstração do título', () => {
  it('começa já depois do countdown e fora do ranking', () => {
    const d = startDemo(recording, DEFAULT_GAME_CONFIG);
    expect(d.state.phase).toBe('playing');
    expect(d.state.ranked).toBe(false);
    expect(d.playback.cursor).toBe(Math.round(DEFAULT_GAME_CONFIG.progression.countdownTime * DEFAULT_GAME_CONFIG.tickHz));
  });

  it('tocada até o fim, conclui o L1 (é o replay dourado) e depois pede para recomeçar', () => {
    let { state, playback } = startDemo(recording, DEFAULT_GAME_CONFIG);
    let s: GameState = state;
    for (;;) {
      const n = nextDemoInput(playback);
      if (!n.input) break;
      playback = n.playback;
      s = step(s, n.input);
    }
    expect(s.phase).toBe('level_complete');
    expect(nextDemoInput(playback).input).toBeNull();
  });
});
