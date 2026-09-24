/**
 * Utilidades de determinismo: hash do estado (FNV-1a sobre o JSON) para
 * comparar execuções e detectar divergências em replays gravados.
 * JSON.stringify reproduz doubles com exatidão, então dois estados com o
 * mesmo hash são idênticos (a menos de colisão, desprezível aqui).
 */

import type { GameConfig, GameState, InputFrame } from './types';
import { createGame, runInputs } from './engine';
import { generateLevel } from './level/generator';
import { getLevelSpec } from './level/specs';

export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Hash do que muda por tick (o nível e a config são fixos e ficam de fora). */
export function hashState(state: GameState): string {
  return fnv1a(JSON.stringify({ tick: state.tick, player: state.player, aim: state.aim, stats: state.stats }));
}

export function configHash(config: GameConfig): string {
  return fnv1a(JSON.stringify(config));
}

/** Gravação de inputs (?record=1 + F9). Começa sempre no tick 0 do nível. */
export interface InputRecording {
  readonly version: 1;
  readonly levelIndex: number;
  readonly seed: number;
  readonly tickHz: number;
  /** Hash da config usada no INÍCIO da gravação. */
  readonly configHash: string;
  /** false se o tuning mudou (F2) durante a gravação: os inputs não reproduzem o run. */
  readonly reproducible: boolean;
  readonly inputs: readonly InputFrame[];
}

export interface ReplayResult {
  readonly state: GameState;
  readonly hash: string;
  /** A config atual é a mesma da gravação? Se não, o resultado pode divergir. */
  readonly configMatches: boolean;
}

/** Regera o nível, roda os inputs desde o tick 0 e devolve o estado final e seu hash. */
export function replayRecording(rec: InputRecording, config: GameConfig): ReplayResult {
  const cfg: GameConfig = { ...config, tickHz: rec.tickHz };
  const level = generateLevel(getLevelSpec(rec.levelIndex), rec.seed);
  const state = runInputs(createGame(level, cfg), rec.inputs);
  return { state, hash: hashState(state), configMatches: configHash(cfg) === rec.configHash };
}
