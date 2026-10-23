/**
 * Gera o replay dourado do L1 (npm run golden): o piloto automático joga o
 * L1 desde o countdown até concluir, e a gravação (inputs em RLE + config
 * hash + resultado esperado) vai para src/logic/__fixtures__/replay-l1.json.
 *
 * Rode de novo sempre que mudar tuning ou regras de propósito: o teste
 * src/logic/golden.test.ts falha com uma mensagem pedindo isso quando o
 * configHash não bate.
 */

import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createRun } from '../src/logic/engine';
import { DEFAULT_GAME_CONFIG } from '../src/logic/config';
import { configHash, encodeInputs, hashState } from '../src/logic/replay';
import type { InputRecording } from '../src/logic/replay';
import { fly } from './autopilot';

it('gera src/logic/__fixtures__/replay-l1.json', () => {
  const start = createRun(DEFAULT_GAME_CONFIG, { startLevel: 1 });
  // sem god: o L1 tem lançadores, então o replay também cobre mísseis e acertos
  const run = fly(start);
  expect(run.final.phase).toBe('level_complete');
  const recording: InputRecording = {
    version: 2,
    levelIndex: 1,
    seed: start.level.seed,
    tickHz: DEFAULT_GAME_CONFIG.tickHz,
    god: false,
    configHash: configHash(DEFAULT_GAME_CONFIG),
    reproducible: true,
    inputs: encodeInputs(run.frames),
  };
  const r = run.final.results[run.final.results.length - 1];
  const fixture = {
    recording,
    expected: {
      phase: run.final.phase,
      tick: run.final.tick,
      timeTicks: r.timeTicks,
      runTicks: run.final.runTicks,
      stars: r.stars,
      hits: r.hits,
      flips: r.flips,
      bestMomentum: r.bestMomentum,
      hash: hashState(run.final),
    },
  };
  writeFileSync('src/logic/__fixtures__/replay-l1.json', JSON.stringify(fixture) + '\n');
  console.log(`replay dourado: ${run.frames.length} ticks, ${recording.inputs.length} trechos RLE, L1 em ${(r.timeTicks / DEFAULT_GAME_CONFIG.tickHz).toFixed(2)} s, ${r.stars}★, ${run.metrics.missiles} mísseis, ${r.hits} acertos`);
});
