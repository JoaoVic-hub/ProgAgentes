/**
 * main.ts — Bootstrap do Duelo da Cobrinha
 *
 * Único arquivo que conhece as três camadas ao mesmo tempo (logic, render,
 * input). As três camadas continuam sem se conhecer entre si diretamente
 * (Constitution Principle I).
 */

import { createGame, step, startNextRound, evaluateMatchResult, computeTickMs } from './logic/engine';
import { DEFAULT_GAME_CONFIG, DEFAULT_RENDER_CONFIG } from './logic/types';
import type { GameState } from './logic/types';
import { createRenderer } from './render/renderer';
import { createKeyboardController } from './input/keyboard';

const canvas = document.getElementById('arena') as HTMLCanvasElement;
if (!canvas) throw new Error('Elemento <canvas id="arena"> não encontrado em index.html');

const config = DEFAULT_GAME_CONFIG;
const renderConfig = DEFAULT_RENDER_CONFIG;

const renderer = createRenderer(canvas, renderConfig, config.cols, config.rows);
const keyboard = createKeyboardController();

// Seed inicial derivada do relógio — só o PONTO DE PARTIDA não é determinístico;
// a partir daqui, toda a simulação é 100% determinística dado esse seed
// (Constitution Principle III).
let state: GameState = createGame(config, Date.now() & 0xffffffff);

let roundEndAt: number | null = null;
let accumulatorMs = 0;
let lastFrameTime: number | null = null;

// Loop de acumulador com timestep fixo (mas dinâmico entre rodadas de jogo):
// cada chamada de step() representa exatamente um tick da simulação, e o
// número de ticks por segundo varia conforme computeTickMs(state) — mas
// dentro de um mesmo tick a lógica é sempre avançada em incrementos fixos,
// nunca "escalada" pela variação de FPS do navegador (Principle III).
function loop(now: number) {
  if (lastFrameTime === null) lastFrameTime = now;
  const deltaMs = now - lastFrameTime;
  lastFrameTime = now;

  if (state.phase === 'match_end') {
    if (keyboard.consumeRestartPressed()) {
      state = createGame(config, Date.now() & 0xffffffff);
      roundEndAt = null;
      accumulatorMs = 0;
    }
  } else if (state.phase === 'round_end') {
    if (roundEndAt === null) roundEndAt = now + config.roundEndDelayMs;
    if (now >= roundEndAt) {
      roundEndAt = null;
      accumulatorMs = 0;
      const matchWinner = evaluateMatchResult(state.roundScores);
      if (matchWinner !== null) {
        state = { ...state, phase: 'match_end', matchWinner };
      } else {
        state = startNextRound(state);
      }
    }
  } else {
    accumulatorMs += deltaMs;
    // FR-023 pede ~1s por número do 3-2-1; countdown usa cadência própria,
    // independente da velocidade de jogo (computeTickMs), que só se aplica
    // durante a fase 'play'.
    const tickMs = state.phase === 'countdown' ? 1000 : computeTickMs(state);
    // proteção contra "espiral da morte" se a aba ficar em segundo plano
    const maxCatchUpTicks = 5;
    let ticksThisFrame = 0;
    while (accumulatorMs >= tickMs && ticksThisFrame < maxCatchUpTicks) {
      const inputs = keyboard.consumeInputs();
      state = step(state, inputs);
      accumulatorMs -= tickMs;
      ticksThisFrame++;
      if (state.phase !== 'play' && state.phase !== 'countdown') break; // round_end/match_end mudam de laço
    }
  }

  renderer.render(state);
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => renderer.resize());

document.fonts.ready.then(() => {
  requestAnimationFrame(loop);
});
