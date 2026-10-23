/**
 * Relógio de timestep fixo — derivado do loop de snake-duel/src/main.ts.
 *
 * Função pura: recebe o acumulador e o delta do frame, devolve quantos ticks
 * de simulação rodar e o alpha para interpolar o render entre o estado
 * anterior e o atual. Duas correções em relação ao snake-duel:
 *  1. o delta é limitado (maxDeltaMs) antes de entrar no acumulador;
 *  2. se o limite de catch-up estourar, o resto do acumulador é DESCARTADO —
 *     senão o jogo "acelera" por vários frames ao voltar de uma aba em
 *     segundo plano.
 */

export interface ClockConfig {
  readonly tickMs: number;
  readonly maxCatchUpTicks: number;
  readonly maxDeltaMs: number;
}

export interface ClockState {
  readonly accumulatorMs: number;
}

export interface ClockAdvance {
  readonly clock: ClockState;
  /** Quantos ticks de simulação rodar neste frame. */
  readonly ticks: number;
  /** Fração do próximo tick já decorrida, em [0, 1), para interpolar o render. */
  readonly alpha: number;
  /** Tempo descartado por estouro do catch-up (0 no caso normal). */
  readonly droppedMs: number;
}

export const DEFAULT_CLOCK_CONFIG: ClockConfig = {
  tickMs: 1000 / 60,
  maxCatchUpTicks: 5,
  maxDeltaMs: 250,
} as const;

export function createClock(): ClockState {
  return { accumulatorMs: 0 };
}

export function advanceClock(
  clock: ClockState,
  deltaMs: number,
  config: ClockConfig = DEFAULT_CLOCK_CONFIG,
): ClockAdvance {
  const safeDelta = Number.isFinite(deltaMs) ? Math.min(Math.max(deltaMs, 0), config.maxDeltaMs) : 0;
  let acc = clock.accumulatorMs + safeDelta;
  let ticks = 0;
  while (acc >= config.tickMs && ticks < config.maxCatchUpTicks) {
    acc -= config.tickMs;
    ticks++;
  }
  let droppedMs = 0;
  if (acc >= config.tickMs) {
    droppedMs = acc;
    acc = 0;
  }
  return {
    clock: { accumulatorMs: acc },
    ticks,
    alpha: acc / config.tickMs,
    droppedMs,
  };
}
