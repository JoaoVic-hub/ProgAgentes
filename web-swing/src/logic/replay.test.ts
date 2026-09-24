import { describe, it, expect } from 'vitest';
import { configHash, hashState, replayRecording } from './replay';
import type { InputRecording } from './replay';
import { createGame, runInputs } from './engine';
import { DEFAULT_GAME_CONFIG } from './config';
import { generateLevel } from './level/generator';
import { LEVEL_SPECS } from './level/specs';
import { input } from './testing';
import type { InputFrame } from './types';

describe('Gravação e replay (Princípio III)', () => {
  const inputs: InputFrame[] = Array.from({ length: 400 }, (_, t) =>
    input({ moveZ: 1, yaw: Math.sin(t / 50) * 0.5, pitch: 0.55, webHeld: t % 80 < 55, jumpPressed: t % 80 === 60 }),
  );

  it('reexecutar a gravação reproduz exatamente o mesmo estado (hash igual)', () => {
    const level = generateLevel(LEVEL_SPECS[0]);
    const live = runInputs(createGame(level, DEFAULT_GAME_CONFIG), inputs);
    const rec: InputRecording = {
      version: 1,
      levelIndex: 1,
      seed: level.seed,
      tickHz: DEFAULT_GAME_CONFIG.tickHz,
      configHash: configHash(DEFAULT_GAME_CONFIG),
      reproducible: true,
      inputs,
    };
    const replay = replayRecording(JSON.parse(JSON.stringify(rec)) as InputRecording, DEFAULT_GAME_CONFIG);
    expect(replay.configMatches).toBe(true);
    expect(replay.hash).toBe(hashState(live));
  });

  it('config diferente da gravada é denunciada (configMatches = false)', () => {
    const rec: InputRecording = { version: 1, levelIndex: 1, seed: 1101, tickHz: 60, configHash: 'deadbeef', reproducible: true, inputs: [] };
    expect(replayRecording(rec, DEFAULT_GAME_CONFIG).configMatches).toBe(false);
  });
});
