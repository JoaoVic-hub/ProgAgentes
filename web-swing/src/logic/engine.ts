/**
 * Motor do jogo: step(state, input) → novo estado (puro e determinístico).
 *
 * Despacha pela fase (logic/progression.ts). Na fase 'playing', o tick é:
 * física do jogador (logic/player/simulate.ts, com a config efetiva do
 * impulso) → queda no vão → mísseis (logic/threats.ts) → impulso
 * (logic/momentum.ts) → checkpoints → chegada.
 * Fases terminais não avançam aqui: a cola chama advanceAfterLevel /
 * restartLevel / createRun.
 */

import type { GameConfig, GameState, InputFrame, Level } from './types';
import { DEFAULT_GAME_CONFIG } from './config';
import { sandboxState, stepCountdown, stepPlaying, stepRespawning } from './progression';

export { createPlayer, NEUTRAL_INPUT } from './player/simulate';
export { advanceAfterLevel, createRun, isTerminal, restartLevel } from './progression';

/** Estado jogável num nível qualquer, já em 'playing' (testes e ferramentas). */
export function createGame(level: Level, config: GameConfig = DEFAULT_GAME_CONFIG): GameState {
  return sandboxState(level, config);
}

export function step(state: GameState, input: InputFrame): GameState {
  switch (state.phase) {
    case 'countdown':
      return stepCountdown(state, input);
    case 'playing':
      return stepPlaying(state, input);
    case 'respawning':
      return stepRespawning(state, input);
    default:
      // terminais: nada anda; só limpa os eventos já entregues
      return state.events.length > 0 ? { ...state, events: [] } : state;
  }
}

/** Roda uma sequência de inputs a partir de um estado (replays e testes). */
export function runInputs(state: GameState, inputs: readonly InputFrame[]): GameState {
  let s = state;
  for (const input of inputs) s = step(s, input);
  return s;
}
