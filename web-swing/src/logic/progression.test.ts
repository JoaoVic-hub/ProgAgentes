import { describe, it, expect } from 'vitest';
import { advanceAfterLevel, createRun, restartLevel, step, isTerminal } from './engine';
import { applyHit, debugHit, debugJumpToFinish, debugRespawn, debugWarpAhead, sandboxState, starsFor } from './progression';
import { DEFAULT_GAME_CONFIG } from './config';
import { LEVEL_SPECS } from './level/specs';
import { input, makeTestLevel, runTicks } from './testing';
import type { GameState, Launcher, Level, Missile } from './types';

const cfg = DEFAULT_GAME_CONFIG;
const T = (s: number) => Math.round(s * cfg.tickHz);
const eventsOf = (s: GameState, type: string) => s.events.filter((e) => e.type === type);

/** Nível curto: checkpoint em z = 50, vão em 60–75, chegada em 100. */
const LEVEL: Level = makeTestLevel([], {
  start: { x: 0, y: 0, z: 0 },
  finishZ: 100,
  checkpoints: [{ index: 1, z: 50, spawn: { x: 0, y: 0, z: 50 } }],
  voids: [{ start: 60, end: 75 }],
});

function playing(over: Partial<GameState> = {}): GameState {
  return { ...sandboxState(LEVEL, cfg), ...over };
}

/** Coloca o jogador voando logo antes da chegada. */
function nearFinish(s: GameState): GameState {
  return { ...s, player: { ...s.player, pos: { x: 0, y: 30, z: 99.8 }, vel: { x: 0, y: 0, z: 20 }, grounded: false, groundKind: null, mode: 'air' } };
}

/** Jogador sobre o vão, caindo. */
function overVoid(s: GameState): GameState {
  return { ...s, player: { ...s.player, pos: { x: 0, y: -24.8, z: 67 }, vel: { x: 0, y: -20, z: 0 }, grounded: false, groundKind: null, mode: 'air' } };
}

/** Míssil armado 0,5 m atrás do peito, vindo reto (acerta no próximo tick). */
function incoming(s: GameState): GameState {
  const chest = { x: s.player.pos.x, y: s.player.pos.y + 1.2, z: s.player.pos.z };
  const m: Missile = { id: 7, pos: { x: chest.x, y: chest.y, z: chest.z - 0.5 }, vel: { x: 0, y: 0, z: 40 }, ageTicks: 100, launcherId: 0 };
  return { ...s, threats: { ...s.threats, missiles: [m] } };
}

describe('Campanha contra o relógio', () => {
  it('começa no countdown 3-2-1 (relógio parado); só no "Já!" o jogador anda e o relógio corre', () => {
    let s = createRun(cfg);
    expect(s.phase).toBe('countdown');
    const start = s.player.pos;
    s = runTicks(s, T(cfg.progression.countdownTime) - 1, input({ moveZ: 1, yaw: 0.3 }));
    expect(s.phase).toBe('countdown');
    expect(s.player.pos).toEqual(start);
    expect(s.player.yaw).toBe(0.3); // o olhar é livre
    expect(s.progress.ticks).toBe(0);
    s = step(s, input({ moveZ: 1 }));
    expect(s.phase).toBe('playing');
    expect(eventsOf(s, 'go')).toHaveLength(1);
    s = runTicks(s, 10, input({ moveZ: 1 }));
    expect(s.progress.ticks).toBe(10);
  });

  it('cruzar a chegada → level_complete com o tempo do nível somado ao tempo da campanha', () => {
    let s = nearFinish(playing({ progress: { ...playing().progress, ticks: 1000 }, runTicks: 5000 }));
    s = step(s, input());
    expect(s.phase).toBe('level_complete');
    const done = eventsOf(s, 'level_complete')[0];
    expect(done && done.type === 'level_complete' && done.result.timeTicks).toBe(1001);
    expect(s.results).toHaveLength(1);
    expect(s.runTicks).toBe(5000 + 1001);
  });

  it('estrelas por tempo: ★★★ até o ouro, ★★ até a prata, ★ só concluindo', () => {
    const { goldTime, silverTime } = LEVEL.spec;
    expect(starsFor(T(goldTime), LEVEL, cfg)).toBe(3);
    expect(starsFor(T(goldTime) + 1, LEVEL, cfg)).toBe(2);
    expect(starsFor(T(silverTime), LEVEL, cfg)).toBe(2);
    expect(starsFor(T(silverTime) + 1, LEVEL, cfg)).toBe(1);
  });

  it('o resultado traz quedas, acertos, perfeitas, flips e o impulso máximo', () => {
    const base = playing();
    let s = nearFinish({ ...base, progress: { ticks: 60, falls: 2, hits: 1, perfects: 5, flips: 3 }, momentum: { ...base.momentum, best: 4.5 } });
    s = step(s, input());
    expect(s.results[0]).toMatchObject({ levelIndex: 1, falls: 2, hits: 1, perfects: 5, flips: 3, bestMomentum: 4.5 });
  });

  it('cair no vão → respawn no último checkpoint, impulso zerado e o relógio NÃO para', () => {
    const base = playing();
    let s = overVoid({ ...base, checkpointIndex: 1, momentum: { ...base.momentum, value: 3, chain: 7 }, progress: { ...base.progress, ticks: 500 } });
    s = step(s, input());
    expect(s.phase).toBe('respawning');
    expect(eventsOf(s, 'fell')).toHaveLength(1);
    expect(eventsOf(s, 'momentum_loss')[0]).toMatchObject({ reason: 'fall', from: 3, to: 0 });
    expect(s.momentum.value).toBe(0);
    expect(s.progress.falls).toBe(1);
    s = runTicks(s, T(cfg.progression.respawnTime), input());
    expect(s.phase).toBe('playing');
    expect(eventsOf(s, 'respawned')[0]).toMatchObject({ checkpoint: 1 });
    expect(s.player.pos).toEqual({ x: 0, y: 0, z: 50 });
    expect(s.player.vel).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.progress.ticks).toBe(500 + 1 + T(cfg.progression.respawnTime));
  });

  it('no respawn os mísseis somem e os lançadores recarregam (não há tiro na cara ao reaparecer)', () => {
    const launcher: Launcher = { id: 0, pos: { x: -20, y: 41.5, z: 60 }, side: -1, solidId: 0 };
    const level = { ...LEVEL, launchers: [launcher] };
    const base = sandboxState(level, cfg);
    let s = overVoid(incoming({ ...base, threats: { ...base.threats, launchers: [{ phase: 'aiming', ticks: 20, shotsLeft: 0 }] } }));
    s = runTicks(step(s, input()), T(cfg.progression.respawnTime), input());
    expect(s.threats.missiles).toEqual([]);
    expect(s.threats.launchers[0].phase).toBe('cooldown');
  });

  it('passar pelo checkpoint emite o evento (com o tempo parcial) e define o ponto de respawn', () => {
    let s = playing({ progress: { ...playing().progress, ticks: 299 } });
    s = { ...s, player: { ...s.player, pos: { x: 0, y: 20, z: 49.8 }, vel: { x: 0, y: 0, z: 20 }, grounded: false, mode: 'air' } };
    s = step(s, input());
    expect(s.checkpointIndex).toBe(1);
    expect(eventsOf(s, 'checkpoint')).toEqual([{ type: 'checkpoint', index: 1, timeTicks: 300 }]);
  });

  it('concluir um nível leva ao próximo (countdown, relógio do nível zerado) e o último leva à vitória', () => {
    const l1done = { ...createRun(cfg), phase: 'level_complete' as const, runTicks: 3000 };
    const l2 = advanceAfterLevel(l1done);
    expect(l2.phase).toBe('countdown');
    expect(l2.level.spec.index).toBe(2);
    expect(l2.runTicks).toBe(3000);
    expect(l2.progress.ticks).toBe(0);
    const last = { ...createRun(cfg, { startLevel: LEVEL_SPECS.length }), phase: 'level_complete' as const };
    const won = advanceAfterLevel(last);
    expect(won.phase).toBe('victory');
    expect(eventsOf(won, 'victory')).toHaveLength(1);
  });

  it('restartLevel refaz o nível do zero (relógio, impulso, mísseis) e mantém a campanha', () => {
    const base = playing();
    const s = { ...base, runTicks: 800, momentum: { ...base.momentum, value: 4 }, progress: { ...base.progress, ticks: 900 } };
    const again = restartLevel(incoming(s));
    expect(again.phase).toBe('countdown');
    expect(again.level).toBe(s.level);
    expect(again.progress.ticks).toBe(0);
    expect(again.momentum.value).toBe(0);
    expect(again.threats.missiles).toEqual([]);
    expect(again.runTicks).toBe(800);
  });

  it('fases terminais não avançam com step()', () => {
    for (const phase of ['level_complete', 'victory'] as const) {
      expect(isTerminal(phase)).toBe(true);
      let s = playing({ phase });
      const pos = s.player.pos;
      s = runTicks(s, 120, input({ moveZ: 1, jumpPressed: true, webHeld: true }));
      expect(s.phase).toBe(phase);
      expect(s.player.pos).toEqual(pos);
    }
  });
});

describe('Acerto de míssil', () => {
  it('solta a teia, atordoa, empurra na direção do míssil e tira 75% do impulso', () => {
    const base = playing();
    let s = { ...base, momentum: { ...base.momentum, value: 4 } };
    s = { ...s, player: { ...s.player, pos: { x: 0, y: 20, z: 10 }, vel: { x: 0, y: 0, z: 0 }, grounded: false, groundKind: null, mode: 'air' } };
    s = step(incoming(s), input());
    expect(eventsOf(s, 'player_hit')).toEqual([{ type: 'player_hit', missileId: 7 }]);
    expect(eventsOf(s, 'missile_exploded')[0]).toMatchObject({ hitPlayer: true });
    expect(s.player.rope).toBeNull();
    expect(s.player.stunTicks).toBeGreaterThan(0);
    expect(s.player.vel.z).toBeGreaterThan(10); // empurrão para a frente (míssil veio de trás)
    expect(s.momentum.value).toBeCloseTo(4 * cfg.momentum.keepOnHit, 9);
    expect(s.progress.hits).toBe(1);
    expect(s.threats.invulnerableTicks).toBe(T(cfg.missiles.invulnerableTime));
  });

  it('atordoado, o jogador não lança teia', () => {
    const p = applyHit(playing().player, { x: 0, y: 0, z: 1 }, cfg);
    let s: GameState = { ...playing(), player: { ...p, pos: { x: 0, y: 20, z: 10 }, grounded: false, groundKind: null, mode: 'air' } };
    s = step(s, input({ webHeld: true, pitch: 0.6 }));
    expect(s.player.rope).toBeNull();
  });

  it('?god=1: mísseis não acertam', () => {
    let s = playing({ god: true });
    s = { ...s, player: { ...s.player, pos: { x: 0, y: 20, z: 10 }, grounded: false, groundKind: null, mode: 'air' } };
    s = runTicks(incoming(s), 30, input());
    expect(s.progress.hits).toBe(0);
  });
});

describe('Atalhos de debug', () => {
  it('N (pular para a chegada), J (avançar), K (acerto simulado) e R (respawn) funcionam e tiram o run do ranking', () => {
    const base = playing({ ranked: true });
    const n = step(debugJumpToFinish(base), input());
    expect(n.ranked).toBe(false);
    expect(n.phase).toBe('level_complete');
    const j = debugWarpAhead({ ...base, player: { ...base.player, pos: { x: 3, y: 0, z: 10 } } });
    expect(j.ranked).toBe(false);
    expect(j.player.pos).toEqual({ x: 0, y: 25, z: 70 });
    expect(debugWarpAhead(base, 500).player.pos.z).toBe(LEVEL.finishZ - 1); // nunca passa da chegada
    const k = debugHit({ ...base, momentum: { ...base.momentum, value: 2 } });
    expect(k.ranked).toBe(false);
    expect(k.player.stunTicks).toBeGreaterThan(0);
    expect(k.momentum.value).toBeCloseTo(2 * cfg.momentum.keepOnHit, 9);
    const r = debugRespawn({ ...base, checkpointIndex: 1, player: { ...base.player, pos: { x: 3, y: 30, z: 58 } } });
    expect(r.ranked).toBe(false);
    expect(r.player.pos).toEqual({ x: 0, y: 0, z: 50 });
  });
});
