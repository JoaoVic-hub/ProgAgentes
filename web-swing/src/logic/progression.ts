/**
 * Progressão da campanha (plano §1 "Vitória e derrota", Etapa 2B) — pura.
 *
 *   countdown ─► playing ─┬─► respawning ─► playing        (caiu num vão; −1 vida)
 *                         ├─► level_complete                (chegada com a cota)
 *                         ├─► level_failed                  (chegada sem a cota; −1 vida)
 *                         └─► game_over                     (0 vidas)
 *   level_complete ─(advanceAfterLevel)─► countdown do próximo nível | victory
 *   level_failed   ─(restartLevel)──────► countdown do mesmo nível (pontos do nível zerados)
 *
 * As fases terminais só saem pela cola (main), como no snake-duel (ADR-007):
 * step() nunca as avança sozinho. A campanha soma só os níveis concluídos.
 */

import type {
  GameConfig,
  GameEvent,
  GamePhase,
  GameState,
  InputFrame,
  Level,
  LevelResult,
  LifeLossReason,
  SessionStats,
} from './types';
import { DEFAULT_GAME_CONFIG, secondsToTicks } from './config';
import { computeAim, NO_AIM } from './aim';
import { clampPitch } from './camera-rig';
import { createPlayer, simulatePlayer } from './player/simulate';
import { bodyCenter, breakStyle, createStyle, crossedRings, updateStyle } from './scoring';
import { generateLevel } from './level/generator';
import { getLevelSpec, LEVEL_SPECS } from './level/specs';

export interface RunOptions {
  readonly startLevel?: number;
  /** Seed do nível inicial (?seed=N); os seguintes usam a seed da spec. */
  readonly seedOverride?: number | null;
  readonly ranked?: boolean;
  readonly god?: boolean;
}

/** O que passa de um nível para o outro na campanha. */
interface Carry {
  readonly tick: number;
  readonly runScore: number;
  readonly lives: number;
  readonly results: readonly LevelResult[];
  readonly ranked: boolean;
  readonly god: boolean;
  readonly seedOverride: number | null;
  readonly stats: SessionStats;
}

export const TERMINAL_PHASES: readonly GamePhase[] = ['level_complete', 'level_failed', 'game_over', 'victory'];

export function isTerminal(phase: GamePhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

export function loadLevel(levelNumber: number, seedOverride: number | null): Level {
  return generateLevel(getLevelSpec(levelNumber), seedOverride);
}

function carryOf(state: GameState): Carry {
  return {
    tick: state.tick,
    runScore: state.runScore,
    lives: state.lives,
    results: state.results,
    ranked: state.ranked,
    god: state.god,
    seedOverride: state.seedOverride,
    stats: state.stats,
  };
}

/** Estado limpo de um nível (anéis, combo e pontos do nível zerados). */
function levelState(level: Level, config: GameConfig, carry: Carry, phase: GamePhase): GameState {
  const player = createPlayer(level.start, 0, 0.15);
  return {
    config,
    level,
    tick: carry.tick,
    player,
    aim: computeAim(level, player, NO_AIM, config),
    events: [],
    stats: carry.stats,
    phase,
    phaseTicks: phase === 'countdown' ? secondsToTicks(config.progression.countdownTime, config.tickHz) : 0,
    ringsCollected: level.rings.map(() => false),
    style: createStyle(),
    progress: { ticks: 0, ringPoints: 0, stylePoints: 0, touchedStreet: false, falls: 0 },
    levelScore: 0,
    runScore: carry.runScore,
    lives: carry.lives,
    checkpointIndex: 0,
    ranked: carry.ranked,
    god: carry.god,
    seedOverride: carry.seedOverride,
    results: carry.results,
  };
}

/** Nova campanha, começando no countdown do nível inicial. */
export function createRun(config: GameConfig = DEFAULT_GAME_CONFIG, opts: RunOptions = {}): GameState {
  const seedOverride = opts.seedOverride ?? null;
  const level = loadLevel(opts.startLevel ?? 1, seedOverride);
  return levelState(
    level,
    config,
    {
      tick: 0,
      runScore: 0,
      lives: config.progression.lives,
      results: [],
      ranked: opts.ranked ?? true,
      god: opts.god ?? false,
      seedOverride,
      stats: { webShots: 0, webMisses: 0 },
    },
    'countdown',
  );
}

/** Estado jogável direto num nível (sem countdown): testes e ferramentas. */
export function sandboxState(level: Level, config: GameConfig = DEFAULT_GAME_CONFIG): GameState {
  return levelState(
    level,
    config,
    { tick: 0, runScore: 0, lives: config.progression.lives, results: [], ranked: false, god: false, seedOverride: null, stats: { webShots: 0, webMisses: 0 } },
    'playing',
  );
}

/** Depois de level_failed: o mesmo nível de novo, com os pontos do nível zerados. */
export function restartLevel(state: GameState): GameState {
  return levelState(state.level, state.config, carryOf(state), 'countdown');
}

/** Depois de level_complete: próximo nível (countdown) ou vitória. */
export function advanceAfterLevel(state: GameState): GameState {
  if (state.phase !== 'level_complete') return state;
  const next = state.level.spec.index + 1;
  if (next > LEVEL_SPECS.length) return { ...state, phase: 'victory', phaseTicks: 0, events: [{ type: 'victory' }] };
  return levelState(loadLevel(next, null), state.config, carryOf(state), 'countdown');
}

export function starsFor(rings: number, total: number, score: number, par: number, config: GameConfig): 1 | 2 | 3 {
  if (total === 0 || rings / total < config.scoring.twoStarRingRatio) return 1;
  return score >= par ? 3 : 2;
}

function spawnFor(state: GameState) {
  const cp = state.checkpointIndex;
  return cp === 0 ? state.level.start : state.level.checkpoints[cp - 1].spawn;
}

/** Perde uma vida: respawn (queda), nível falhado (cota) ou game over. */
function loseLife(state: GameState, reason: LifeLossReason, events: GameEvent[]): GameState {
  const cfg = state.config;
  const lives = state.god ? state.lives : state.lives - 1;
  const broken = breakStyle(state.style, 'respawn');
  const ev: GameEvent[] = [...events, { type: 'life_lost', reason, livesLeft: lives }, ...broken.events];
  const progress = { ...state.progress, falls: state.progress.falls + (reason === 'quota' ? 0 : 1) };
  const base = { ...state, lives: Math.max(0, lives), style: broken.style, progress };
  if (lives <= 0) return { ...base, phase: 'game_over', phaseTicks: 0, events: [...ev, { type: 'game_over' }] };
  if (reason === 'quota') return { ...base, phase: 'level_failed', phaseTicks: 0, events: ev };
  return { ...base, phase: 'respawning', phaseTicks: secondsToTicks(cfg.progression.respawnTime, cfg.tickHz), events: ev };
}

/** Cruzou a chegada: conclui (com bônus e estrelas) ou falha pela cota. */
function finishLevel(state: GameState): GameState {
  const cfg = state.config;
  const level = state.level;
  const rings = state.ringsCollected.filter(Boolean).length;
  const total = level.rings.length;
  if (rings < level.ringQuota && !state.god) {
    return loseLife(state, 'quota', [...state.events, { type: 'level_failed', rings, quota: level.ringQuota }]);
  }
  const allRingsBonus = total > 0 && rings === total ? cfg.scoring.allRingsBonus : 0;
  const noStreetBonus = state.progress.touchedStreet ? 0 : cfg.scoring.noStreetBonus;
  const score = state.levelScore + allRingsBonus + noStreetBonus;
  const result: LevelResult = {
    levelIndex: level.spec.index,
    levelName: level.spec.name,
    score,
    ringPoints: state.progress.ringPoints,
    stylePoints: state.progress.stylePoints,
    allRingsBonus,
    noStreetBonus,
    rings,
    ringsTotal: total,
    stars: starsFor(rings, total, score, level.spec.parScore, cfg),
    timeTicks: state.progress.ticks,
    bestMultiplier: state.style.bestMultiplier,
  };
  return {
    ...state,
    phase: 'level_complete',
    phaseTicks: 0,
    levelScore: score,
    runScore: state.runScore + score,
    results: [...state.results, result],
    events: [...state.events, { type: 'level_complete', result }],
  };
}

export function stepCountdown(state: GameState, input: InputFrame): GameState {
  // só o olhar é livre; o botão da teia é lembrado para não anexar sozinho no "Já!"
  const player = { ...state.player, yaw: input.yaw, pitch: clampPitch(input.pitch, state.config.rig), prevWebHeld: input.webHeld };
  const aim = computeAim(state.level, player, state.aim, state.config);
  const left = state.phaseTicks - 1;
  if (left > 0) return { ...state, tick: state.tick + 1, player, aim, phaseTicks: left, events: [] };
  return { ...state, tick: state.tick + 1, player, aim, phase: 'playing', phaseTicks: 0, events: [{ type: 'go' }] };
}

export function stepPlaying(state: GameState, input: InputFrame): GameState {
  const cfg = state.config;
  const level = state.level;
  const sim = simulatePlayer(state, input);
  const player = sim.player;
  const events: GameEvent[] = [...sim.events];
  const moved = { ...state, tick: state.tick + 1, player, aim: sim.aim, stats: sim.stats };

  if (player.pos.y < level.killY) {
    return loseLife({ ...moved, progress: { ...state.progress, ticks: state.progress.ticks + 1 } }, 'fall', events);
  }

  const h = cfg.physics.height;
  const hits = crossedRings(level, state.ringsCollected, bodyCenter(state.player.pos, h), bodyCenter(player.pos, h), cfg.scoring);
  const ringsCollected = hits.length > 0 ? state.ringsCollected.map((c, i) => c || hits.includes(i)) : state.ringsCollected;
  const su = updateStyle(state.style, player, sim.events, hits, level, cfg);
  events.push(...su.events);

  let checkpointIndex = state.checkpointIndex;
  while (checkpointIndex < level.checkpoints.length && player.pos.z >= level.checkpoints[checkpointIndex].z) {
    checkpointIndex += 1;
    events.push({ type: 'checkpoint', index: checkpointIndex });
  }

  const next: GameState = {
    ...moved,
    ringsCollected,
    style: su.style,
    progress: {
      ...state.progress,
      ticks: state.progress.ticks + 1,
      ringPoints: state.progress.ringPoints + su.ringPoints,
      stylePoints: state.progress.stylePoints + su.stylePoints,
      touchedStreet: state.progress.touchedStreet || su.landedOnStreet,
    },
    levelScore: state.levelScore + su.ringPoints + su.stylePoints,
    checkpointIndex,
    events,
  };
  return player.pos.z >= level.finishZ ? finishLevel(next) : next;
}

/** Reaparece parado no último checkpoint (anéis e pontos do nível mantidos). */
function respawn(state: GameState): GameState {
  const checkpoint = state.checkpointIndex;
  // botão "já apertado": precisa de um clique novo para lançar teia
  const player = { ...createPlayer(spawnFor(state), state.player.yaw, state.player.pitch), prevWebHeld: true };
  return {
    ...state,
    player,
    aim: computeAim(state.level, player, NO_AIM, state.config),
    phase: 'playing',
    phaseTicks: 0,
    events: [{ type: 'respawned', checkpoint }],
  };
}

export function stepRespawning(state: GameState, input: InputFrame): GameState {
  const left = state.phaseTicks - 1;
  const player = { ...state.player, yaw: input.yaw, pitch: clampPitch(input.pitch, state.config.rig) };
  if (left > 0) return { ...state, tick: state.tick + 1, player, phaseTicks: left, events: [] };
  return respawn({ ...state, tick: state.tick + 1, player });
}

// ------------------------------------------------------------ atalhos de debug (N / K / R)
// Qualquer um deles marca o run como não ranqueado.

/** N: coloca o jogador logo antes da chegada, indo para a frente. */
export function debugJumpToFinish(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  const p = createPlayer({ x: 0, y: 12, z: state.level.finishZ - 0.2 }, state.player.yaw, state.player.pitch);
  return { ...state, ranked: false, player: { ...p, vel: { x: 0, y: 0, z: 20 }, grounded: false, groundKind: null, mode: 'air' } };
}

/** K: perde uma vida como numa queda. */
export function debugLoseLife(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  return loseLife({ ...state, ranked: false }, 'debug', []);
}

/** R: volta ao último checkpoint sem perder vida. */
export function debugRespawn(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  const broken = breakStyle(state.style, 'respawn');
  const r = respawn({ ...state, ranked: false, style: broken.style });
  return { ...r, events: [...broken.events, ...r.events] };
}
