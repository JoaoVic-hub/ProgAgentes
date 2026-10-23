/**
 * Replay dourado do L1 (Etapa 2B): uma partida gravada pelo piloto
 * automático (tools/golden.gen.ts) precisa concluir o L1 com EXATAMENTE o
 * mesmo tempo e o mesmo estado final. Pega qualquer mudança acidental de
 * física, impulso, mísseis ou progressão — e de determinismo.
 *
 * Mudou tuning/regras de propósito? Rode `npm run golden` para regravar.
 */

import { describe, it, expect } from 'vitest';
import fixture from './__fixtures__/replay-l1.json';
import { configHash, replayRecording } from './replay';
import type { InputRecording } from './replay';
import { DEFAULT_GAME_CONFIG } from './config';

interface GoldenFixture {
  readonly recording: InputRecording;
  readonly expected: {
    readonly phase: string;
    readonly tick: number;
    readonly timeTicks: number;
    readonly runTicks: number;
    readonly stars: number;
    readonly hits: number;
    readonly flips: number;
    readonly bestMomentum: number;
    readonly hash: string;
  };
}

const golden = fixture as unknown as GoldenFixture;

describe('Replay dourado do L1', () => {
  it('a config atual é a mesma da gravação (senão: npm run golden)', () => {
    if (golden.recording.configHash !== configHash(DEFAULT_GAME_CONFIG)) {
      throw new Error(
        'A config do jogo mudou desde a gravação do replay dourado. Se a mudança foi de propósito ' +
          '(tuning/regras), rode `npm run golden` para regravar src/logic/__fixtures__/replay-l1.json.',
      );
    }
  });

  it('reproduz a partida: conclui o L1 com o tempo exato e o mesmo estado final', () => {
    const r = replayRecording(golden.recording, DEFAULT_GAME_CONFIG);
    const last = r.state.results[r.state.results.length - 1];
    expect({
      phase: r.state.phase,
      tick: r.state.tick,
      timeTicks: last?.timeTicks,
      runTicks: r.state.runTicks,
      stars: last?.stars,
      hits: last?.hits,
      flips: last?.flips,
      bestMomentum: last?.bestMomentum,
      hash: r.hash,
    }).toEqual(golden.expected);
    expect(r.state.phase).toBe('level_complete');
  });
});
