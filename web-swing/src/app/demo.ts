/**
 * Demonstração do título (Etapa 3): reproduz uma gravação de inputs (o
 * replay dourado do L1) atrás dos menus. Cola pura: cria o run, pula o
 * countdown e entrega um input por tick; ao acabar, recomeça.
 *
 * Se a config atual não for a da gravação (tuning pelo F2), a partida
 * diverge — tudo bem: é só vitrine, e ela recomeça ao terminar ou empacar.
 */

import type { InputRecording } from '../logic/replay';
import { decodeInputs } from '../logic/replay';
import { createRun, step } from '../logic/engine';
import type { GameConfig, GameState, InputFrame } from '../logic/types';

export interface DemoPlayback {
  readonly frames: readonly InputFrame[];
  readonly cursor: number;
}

export interface DemoStart {
  readonly state: GameState;
  readonly playback: DemoPlayback;
}

/** Run de demonstração (fora do ranking), já depois do countdown. */
export function startDemo(recording: InputRecording, config: GameConfig, frames: readonly InputFrame[] = decodeInputs(recording.inputs)): DemoStart {
  let state = createRun(config, { startLevel: recording.levelIndex, ranked: false, god: recording.god });
  let cursor = 0;
  while (state.phase === 'countdown' && cursor < frames.length) state = step(state, frames[cursor++]);
  return { state, playback: { frames, cursor } };
}

/** Próximo input da gravação; null quando acabou (hora de recomeçar). */
export function nextDemoInput(playback: DemoPlayback): { input: InputFrame | null; playback: DemoPlayback } {
  if (playback.cursor >= playback.frames.length) return { input: null, playback };
  return { input: playback.frames[playback.cursor], playback: { ...playback, cursor: playback.cursor + 1 } };
}
