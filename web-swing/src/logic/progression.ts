/**
 * Progressão da campanha contra o relógio (redesenho da Etapa 2) — pura.
 *
 *   countdown ─► playing ─┬─► respawning ─► playing   (caiu num vão; o relógio continua)
 *                         └─► level_complete          (cruzou a chegada)
 *   level_complete ─(advanceAfterLevel)─► countdown do próximo nível | victory
 *
 * Sem vidas nem game over: o castigo de qualquer erro é TEMPO. O objetivo é
 * terminar cada nível no menor tempo (estrelas por tempo). As fases
 * terminais só saem pela cola (main), como no snake-duel (ADR-007).
 *
 * Tick da fase playing:
 *   impulso → config efetiva → física do jogador → queda no vão →
 *   mísseis (acerto → empurrão + atordoamento) → impulso → checkpoints → chegada
 */

import type { GameConfig, GameEvent, GamePhase, GameState, InputFrame, Level, LevelResult, Player, SessionStats } from './types';
import type { Vec3 } from './math/vec3';
import { normalize } from './math/vec3';
import { DEFAULT_GAME_CONFIG, secondsToTicks } from './config';
import { computeAim, NO_AIM } from './aim';
import { clampPitch } from './camera-rig';
import { createPlayer, simulatePlayer } from './player/simulate';
import { applyMomentum, createMomentum, momentumOnFall, updateMomentum } from './momentum';
import { createThreats, resetThreats, stepThreats } from './threats';
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
  readonly runTicks: number;
  readonly results: readonly LevelResult[];
  readonly ranked: boolean;
  readonly god: boolean;
  readonly seedOverride: number | null;
  readonly startLevel: number;
  readonly stats: SessionStats;
}

export const TERMINAL_PHASES: readonly GamePhase[] = ['level_complete', 'victory'];

export function isTerminal(phase: GamePhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

export function loadLevel(levelNumber: number, seedOverride: number | null): Level {
  return generateLevel(getLevelSpec(levelNumber), seedOverride);
}

function carryOf(state: GameState): Carry {
  return {
    tick: state.tick,
    runTicks: state.runTicks,
    results: state.results,
    ranked: state.ranked,
    god: state.god,
    seedOverride: state.seedOverride,
    startLevel: state.startLevel,
    stats: state.stats,
  };
}

/** Estado limpo de um nível (relógio, impulso e ameaças zerados). */
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
    momentum: createMomentum(),
    threats: createThreats(level),
    progress: { ticks: 0, falls: 0, hits: 0, perfects: 0, flips: 0 },
    runTicks: carry.runTicks,
    startLevel: carry.startLevel,
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
  const startLevel = getLevelSpec(opts.startLevel ?? 1).index;
  return levelState(
    loadLevel(startLevel, seedOverride),
    config,
    {
      tick: 0,
      runTicks: 0,
      results: [],
      ranked: opts.ranked ?? true,
      god: opts.god ?? false,
      seedOverride,
      startLevel,
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
    { tick: 0, runTicks: 0, results: [], ranked: false, god: false, seedOverride: null, startLevel: level.spec.index, stats: { webShots: 0, webMisses: 0 } },
    'playing',
  );
}

/**
 * O mesmo nível do zero ("Reiniciar" na pausa, "Tentar de novo" nos resultados).
 * O relógio da CAMPANHA nunca volta (ADR-025): o tempo da tentativa abandonada
 * entra no total; depois de concluído, o resultado sai da lista (vai ser
 * substituído), mas o tempo dele continua somado.
 */
export function restartLevel(state: GameState): GameState {
  const carry = carryOf(state);
  const next: Carry =
    state.phase === 'level_complete'
      ? { ...carry, results: state.results.slice(0, -1) }
      : { ...carry, runTicks: state.runTicks + state.progress.ticks };
  return levelState(state.level, state.config, next, 'countdown');
}

/** Depois de level_complete: próximo nível (countdown) ou vitória. */
export function advanceAfterLevel(state: GameState): GameState {
  if (state.phase !== 'level_complete') return state;
  const next = state.level.spec.index + 1;
  if (next > LEVEL_SPECS.length) return { ...state, phase: 'victory', phaseTicks: 0, events: [{ type: 'victory' }] };
  return levelState(loadLevel(next, null), state.config, carryOf(state), 'countdown');
}

/** Estrelas por tempo: ★★★ até goldTime, ★★ até silverTime, ★ concluindo. */
export function starsFor(timeTicks: number, level: Level, config: GameConfig): 1 | 2 | 3 {
  const seconds = timeTicks / config.tickHz;
  if (seconds <= level.spec.goldTime) return 3;
  if (seconds <= level.spec.silverTime) return 2;
  return 1;
}

function spawnFor(state: GameState): Vec3 {
  const cp = state.checkpointIndex;
  return cp === 0 ? state.level.start : state.level.checkpoints[cp - 1].spawn;
}

/** Míssil acertou: solta a teia, atordoa e empurra na direção do míssil (e um pouco para cima). */
export function applyHit(player: Player, missileDir: Vec3, config: GameConfig): Player {
  const mc = config.missiles;
  const h = normalize({ x: missileDir.x, y: 0, z: missileDir.z });
  return {
    ...player,
    vel: { x: player.vel.x + h.x * mc.knockback, y: player.vel.y + mc.knockUp, z: player.vel.z + h.z * mc.knockback },
    rope: null,
    mode: player.grounded ? 'ground' : 'air',
    stunTicks: secondsToTicks(mc.hitStun, config.tickHz),
    webBufferTicks: 0,
    flipWindowTicks: 0,
    flipAvailable: false,
    wallTicks: 0,
  };
}

/** Caiu num vão: impulso zerado e respawn (o relógio continua correndo). */
function fall(state: GameState, events: GameEvent[]): GameState {
  const cfg = state.config;
  const mf = momentumOnFall(state.momentum);
  return {
    ...state,
    momentum: mf.momentum,
    progress: { ...state.progress, falls: state.progress.falls + 1 },
    phase: 'respawning',
    phaseTicks: secondsToTicks(cfg.progression.respawnTime, cfg.tickHz),
    events: [...events, { type: 'fell' }, ...mf.events],
  };
}

/** Cruzou a chegada: resultado com o tempo, estrelas e estatísticas. */
function finishLevel(state: GameState): GameState {
  const level = state.level;
  const p = state.progress;
  const result: LevelResult = {
    levelIndex: level.spec.index,
    levelName: level.spec.name,
    timeTicks: p.ticks,
    stars: starsFor(p.ticks, level, state.config),
    falls: p.falls,
    hits: p.hits,
    perfects: p.perfects,
    flips: p.flips,
    bestMomentum: state.momentum.best,
  };
  return {
    ...state,
    phase: 'level_complete',
    phaseTicks: 0,
    runTicks: state.runTicks + p.ticks,
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
  // o impulso acelera o balanço: a física deste tick roda com a config efetiva
  const sim = simulatePlayer({ config: applyMomentum(cfg, state.momentum.value), level, player: state.player, aim: state.aim, stats: state.stats }, input);
  let player = sim.player;
  const events: GameEvent[] = [...sim.events];
  const progress = { ...state.progress, ticks: state.progress.ticks + 1 };
  const moved: GameState = { ...state, tick: state.tick + 1, player, aim: sim.aim, stats: sim.stats, progress };

  if (player.pos.y < level.killY) return fall(moved, events);

  const th = stepThreats(state.threats, level, player, state.player.pos, cfg, state.god);
  events.push(...th.events);
  if (th.hit) {
    player = applyHit(player, th.hit.dir, cfg);
    events.push({ type: 'player_hit', missileId: th.hit.missileId });
  }

  const mu = updateMomentum(state.momentum, player, state.player, sim.events, input, { hit: th.hit !== null }, cfg);
  events.push(...mu.events);

  let checkpointIndex = state.checkpointIndex;
  while (checkpointIndex < level.checkpoints.length && player.pos.z >= level.checkpoints[checkpointIndex].z) {
    checkpointIndex += 1;
    events.push({ type: 'checkpoint', index: checkpointIndex, timeTicks: progress.ticks });
  }

  const next: GameState = {
    ...moved,
    player,
    momentum: mu.momentum,
    threats: th.threats,
    progress: {
      ...progress,
      hits: progress.hits + (th.hit ? 1 : 0),
      perfects: progress.perfects + sim.events.filter((e) => e.type === 'web_released' && e.perfect).length,
      flips: progress.flips + sim.events.filter((e) => e.type === 'flip').length,
    },
    checkpointIndex,
    events,
  };
  return player.pos.z >= level.finishZ ? finishLevel(next) : next;
}

/** Reaparece parado no último checkpoint; mísseis somem e os lançadores recarregam. */
function respawn(state: GameState): GameState {
  const checkpoint = state.checkpointIndex;
  // botão "já apertado": precisa de um clique novo para lançar teia
  const player = { ...createPlayer(spawnFor(state), state.player.yaw, state.player.pitch), prevWebHeld: true };
  return {
    ...state,
    player,
    aim: computeAim(state.level, player, NO_AIM, state.config),
    threats: resetThreats(state.threats),
    phase: 'playing',
    phaseTicks: 0,
    events: [{ type: 'respawned', checkpoint }],
  };
}

export function stepRespawning(state: GameState, input: InputFrame): GameState {
  const player = { ...state.player, yaw: input.yaw, pitch: clampPitch(input.pitch, state.config.rig) };
  // o relógio continua correndo durante o respawn
  const base = { ...state, tick: state.tick + 1, player, progress: { ...state.progress, ticks: state.progress.ticks + 1 } };
  const left = state.phaseTicks - 1;
  if (left > 0) return { ...base, phaseTicks: left, events: [] };
  return respawn(base);
}

// ------------------------------------------------------------ atalhos de debug (N / J / K / R)
// Qualquer um deles marca o run como não ranqueado.

/** N: coloca o jogador logo antes da chegada, indo para a frente. */
export function debugJumpToFinish(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  const p = createPlayer({ x: 0, y: 12, z: state.level.finishZ - 0.2 }, state.player.yaw, state.player.pitch);
  return { ...state, ranked: false, player: { ...p, vel: { x: 0, y: 0, z: 20 }, grounded: false, groundKind: null, mode: 'air' } };
}

/** J: avança dz metros pelo meio da avenida, no ar (para testar trechos com lançadores e vãos). */
export function debugWarpAhead(state: GameState, dz = 60): GameState {
  if (state.phase !== 'playing') return state;
  const z = Math.min(state.player.pos.z + dz, state.level.finishZ - 1);
  const p = createPlayer({ x: 0, y: 25, z }, state.player.yaw, state.player.pitch);
  return { ...state, ranked: false, player: { ...p, vel: { x: 0, y: 0, z: 20 }, grounded: false, groundKind: null, mode: 'air', prevWebHeld: true } };
}

/** K: simula um acerto de míssil vindo de trás (para testar o impacto). */
export function debugHit(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  const cfg = state.config;
  const player = applyHit(state.player, { x: 0, y: 0, z: 1 }, cfg);
  const mu = updateMomentum(state.momentum, player, state.player, [], { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, webHeld: false, jumpPressed: false }, { hit: true }, cfg);
  return {
    ...state,
    ranked: false,
    player,
    momentum: mu.momentum,
    threats: { ...state.threats, invulnerableTicks: secondsToTicks(cfg.missiles.invulnerableTime, cfg.tickHz) },
    progress: { ...state.progress, hits: state.progress.hits + 1 },
    events: [...state.events, { type: 'player_hit', missileId: -1 }, ...mu.events],
  };
}

/** R: volta ao último checkpoint (o relógio não volta). */
export function debugRespawn(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  return respawn({ ...state, ranked: false });
}
