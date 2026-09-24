import { describe, it, expect } from 'vitest';
import { configHash, decodeInputs, encodeInputs, hashState, replayRecording } from './replay';
import type { InputRecording } from './replay';
import { createRun, runInputs } from './engine';
import { DEFAULT_GAME_CONFIG } from './config';
import { input } from './testing';
import type { InputFrame } from './types';

describe('Gravação e replay (Princípio III)', () => {
  const inputs: InputFrame[] = [
    ...Array.from({ length: 200 }, () => input({ pitch: 0.55 })), // countdown
    ...Array.from({ length: 400 }, (_, t) =>
      input({ moveZ: 1, yaw: Math.sin(t / 50) * 0.5, pitch: 0.55, webHeld: t % 80 < 55, jumpPressed: t % 80 === 60 }),
    ),
  ];

  it('reexecutar a gravação reproduz exatamente o mesmo estado (hash igual)', () => {
    const live = runInputs(createRun(DEFAULT_GAME_CONFIG), inputs);
    const rec: InputRecording = {
      version: 2,
      levelIndex: 1,
      seed: 1101,
      tickHz: DEFAULT_GAME_CONFIG.tickHz,
      god: false,
      configHash: configHash(DEFAULT_GAME_CONFIG),
      reproducible: true,
      inputs: encodeInputs(inputs),
    };
    const replay = replayRecording(JSON.parse(JSON.stringify(rec)) as InputRecording, DEFAULT_GAME_CONFIG);
    expect(replay.configMatches).toBe(true);
    expect(replay.hash).toBe(hashState(live));
    expect(replay.state.levelScore).toBe(live.levelScore);
  });

  it('a compressão RLE dos inputs é sem perdas e junta frames repetidos', () => {
    const runs = encodeInputs(inputs);
    expect(runs.length).toBeLessThan(inputs.length);
    expect(decodeInputs(runs)).toEqual(inputs);
  });

  it('config diferente da gravada é denunciada (configMatches = false)', () => {
    const rec: InputRecording = { version: 2, levelIndex: 1, seed: 1101, tickHz: 60, god: false, configHash: 'deadbeef', reproducible: true, inputs: [] };
    expect(replayRecording(rec, DEFAULT_GAME_CONFIG).configMatches).toBe(false);
  });
});
