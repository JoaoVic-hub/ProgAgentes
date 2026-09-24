/**
 * Utilidades de determinismo: hash do estado (FNV-1a sobre o JSON) para
 * comparar execuções, e gravação/reprodução de inputs (?record=1 + F9,
 * replay dourado dos testes). JSON.stringify reproduz doubles com exatidão,
 * então dois estados com o mesmo hash são idênticos (a menos de colisão).
 */

import type { GameConfig, GameState, InputFrame } from './types';
import { createRun, runInputs } from './engine';
import { getLevelSpec } from './level/specs';

export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Hash de tudo que muda com o jogo (nível e config são fixos; flags de meta ficam de fora). */
export function hashState(state: GameState): string {
  return fnv1a(
    JSON.stringify({
      tick: state.tick,
      phase: state.phase,
      phaseTicks: state.phaseTicks,
      player: state.player,
      aim: state.aim,
      stats: state.stats,
      ringsCollected: state.ringsCollected,
      style: state.style,
      progress: state.progress,
      levelScore: state.levelScore,
      runScore: state.runScore,
      lives: state.lives,
      checkpointIndex: state.checkpointIndex,
      results: state.results,
    }),
  );
}

export function configHash(config: GameConfig): string {
  return fnv1a(JSON.stringify(config));
}

/** Sequência de inputs comprimida: [frame, quantas vezes seguidas]. */
export type InputRuns = readonly (readonly [InputFrame, number])[];

function sameFrame(a: InputFrame, b: InputFrame): boolean {
  return (
    a.moveX === b.moveX &&
    a.moveZ === b.moveZ &&
    a.yaw === b.yaw &&
    a.pitch === b.pitch &&
    a.webHeld === b.webHeld &&
    a.jumpPressed === b.jumpPressed
  );
}

export function encodeInputs(frames: readonly InputFrame[]): InputRuns {
  const runs: [InputFrame, number][] = [];
  for (const f of frames) {
    const last = runs[runs.length - 1];
    if (last && sameFrame(last[0], f)) last[1] += 1;
    else runs.push([f, 1]);
  }
  return runs;
}

export function decodeInputs(runs: InputRuns): InputFrame[] {
  const out: InputFrame[] = [];
  for (const [frame, count] of runs) for (let i = 0; i < count; i++) out.push(frame);
  return out;
}

/** Gravação de inputs de uma campanha, desde o tick 0 (countdown incluso). */
export interface InputRecording {
  readonly version: 2;
  readonly levelIndex: number;
  readonly seed: number;
  readonly tickHz: number;
  readonly god: boolean;
  /** Hash da config usada no INÍCIO da gravação. */
  readonly configHash: string;
  /** false se o tuning mudou (F2) durante a gravação: os inputs não reproduzem o run. */
  readonly reproducible: boolean;
  readonly inputs: InputRuns;
}

export interface ReplayResult {
  readonly state: GameState;
  readonly hash: string;
  /** A config atual é a mesma da gravação? Se não, o resultado pode divergir. */
  readonly configMatches: boolean;
}

/** Recria a campanha, roda os inputs desde o tick 0 e devolve o estado final e seu hash. */
export function replayRecording(rec: InputRecording, config: GameConfig): ReplayResult {
  const cfg: GameConfig = { ...config, tickHz: rec.tickHz };
  const spec = getLevelSpec(rec.levelIndex);
  const start = createRun(cfg, {
    startLevel: rec.levelIndex,
    seedOverride: rec.seed === spec.seed ? null : rec.seed,
    god: rec.god,
  });
  const state = runInputs(start, decodeInputs(rec.inputs));
  return { state, hash: hashState(state), configMatches: configHash(cfg) === rec.configHash };
}
