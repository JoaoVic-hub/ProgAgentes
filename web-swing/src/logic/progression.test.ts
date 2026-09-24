import { describe, it, expect } from 'vitest';
import { advanceAfterLevel, createRun, restartLevel, step, isTerminal } from './engine';
import { debugJumpToFinish, debugLoseLife, debugRespawn, sandboxState, starsFor } from './progression';
import { DEFAULT_GAME_CONFIG } from './config';
import { LEVEL_SPECS } from './level/specs';
import { input, makeTestLevel, runTicks } from './testing';
import type { GameState, Level, Ring } from './types';

const cfg = DEFAULT_GAME_CONFIG;
const eventsOf = (s: GameState, type: string) => s.events.filter((e) => e.type === type);

function ring(id: number, z: number): Ring {
  return { id, center: { x: 0, y: 10, z }, normal: { x: 0, y: 0, z: 1 }, radius: 3, gold: false, risky: false };
}

/** Nível curto: 4 anéis, cota 2, checkpoint em z = 50, vão em 60–75, chegada em 100. */
const LEVEL: Level = makeTestLevel([], {
  start: { x: 0, y: 0, z: 0 },
  finishZ: 100,
  rings: [ring(0, 20), ring(1, 40), ring(2, 80), ring(3, 90)],
  ringQuota: 2,
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

const collected = (n: number) => [0, 1, 2, 3].map((i) => i < n);

describe('Fases da campanha (2B)', () => {
  it('a campanha começa no countdown 3-2-1 com 3 vidas; só depois o jogador anda', () => {
    let s = createRun(cfg);
    expect(s.phase).toBe('countdown');
    expect(s.lives).toBe(cfg.progression.lives);
    const countdown = Math.round(cfg.progression.countdownTime * cfg.tickHz);
    const start = s.player.pos;
    s = runTicks(s, countdown - 1, input({ moveZ: 1, yaw: 0.3 }));
    expect(s.phase).toBe('countdown');
    expect(s.player.pos).toEqual(start);
    expect(s.player.yaw).toBe(0.3); // o olhar é livre
    s = step(s, input({ moveZ: 1 }));
    expect(s.phase).toBe('playing');
    expect(eventsOf(s, 'go')).toHaveLength(1);
  });

  it('cruzar a chegada com a cota → level_complete, com resultado e pontos somados na campanha', () => {
    let s = nearFinish(playing({ ringsCollected: collected(2), levelScore: 700, runScore: 1000 }));
    s = step(s, input());
    expect(s.phase).toBe('level_complete');
    const done = eventsOf(s, 'level_complete')[0];
    expect(done && done.type === 'level_complete' && done.result.rings).toBe(2);
    expect(s.results).toHaveLength(1);
    expect(s.runScore).toBe(1000 + s.results[0].score);
  });

  it('cruzar a chegada sem a cota → level_failed e −1 vida; restartLevel zera o nível e mantém a campanha', () => {
    let s = nearFinish(playing({ ringsCollected: collected(1), levelScore: 500, runScore: 800 }));
    s = step(s, input());
    expect(s.phase).toBe('level_failed');
    expect(s.lives).toBe(cfg.progression.lives - 1);
    expect(eventsOf(s, 'level_failed')[0]).toMatchObject({ rings: 1, quota: 2 });
    const again = restartLevel(s);
    expect(again.phase).toBe('countdown');
    expect(again.level).toBe(s.level);
    expect(again.levelScore).toBe(0);
    expect(again.ringsCollected.every((c) => !c)).toBe(true);
    expect(again.lives).toBe(s.lives);
    expect(again.runScore).toBe(800);
  });

  it('cair no vão → −1 vida, respawn no último checkpoint com o combo zerado e os anéis mantidos', () => {
    let s = overVoid(playing({ checkpointIndex: 1, ringsCollected: collected(2), style: { ...playing().style, chain: 7 } }));
    s = step(s, input());
    expect(s.phase).toBe('respawning');
    expect(s.lives).toBe(cfg.progression.lives - 1);
    expect(eventsOf(s, 'combo_lost')[0]).toMatchObject({ reason: 'respawn' });
    s = runTicks(s, Math.round(cfg.progression.respawnTime * cfg.tickHz), input());
    expect(s.phase).toBe('playing');
    expect(eventsOf(s, 'respawned')[0]).toMatchObject({ checkpoint: 1 });
    expect(s.player.pos).toEqual({ x: 0, y: 0, z: 50 });
    expect(s.player.vel).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.style.chain).toBe(0);
    expect(s.ringsCollected).toEqual(collected(2));
  });

  it('passar pelo checkpoint emite o evento e define o ponto de respawn', () => {
    let s = playing();
    s = { ...s, player: { ...s.player, pos: { x: 0, y: 20, z: 49.8 }, vel: { x: 0, y: 0, z: 20 }, grounded: false, mode: 'air' } };
    s = step(s, input());
    expect(s.checkpointIndex).toBe(1);
    expect(eventsOf(s, 'checkpoint')).toEqual([{ type: 'checkpoint', index: 1 }]);
  });

  it('perder a última vida → game_over (a queda não respawna)', () => {
    const s = step(overVoid(playing({ lives: 1 })), input());
    expect(s.phase).toBe('game_over');
    expect(s.lives).toBe(0);
    expect(eventsOf(s, 'game_over')).toHaveLength(1);
  });

  it('concluir um nível leva ao próximo (countdown) e concluir o último leva à vitória', () => {
    const l1done = { ...createRun(cfg), phase: 'level_complete' as const, runScore: 3000 };
    const l2 = advanceAfterLevel(l1done);
    expect(l2.phase).toBe('countdown');
    expect(l2.level.spec.index).toBe(2);
    expect(l2.runScore).toBe(3000);
    const last = { ...createRun(cfg, { startLevel: LEVEL_SPECS.length }), phase: 'level_complete' as const };
    const won = advanceAfterLevel(last);
    expect(won.phase).toBe('victory');
    expect(eventsOf(won, 'victory')).toHaveLength(1);
  });

  it('fases terminais não avançam com step()', () => {
    for (const phase of ['level_complete', 'level_failed', 'game_over', 'victory'] as const) {
      expect(isTerminal(phase)).toBe(true);
      let s = playing({ phase });
      const pos = s.player.pos;
      s = runTicks(s, 120, input({ moveZ: 1, jumpPressed: true, webHeld: true }));
      expect(s.phase).toBe(phase);
      expect(s.player.pos).toEqual(pos);
    }
  });
});

describe('Bônus e estrelas (2B)', () => {
  it('bônus de todos os anéis (+1000) e de nunca pousar na rua (+500)', () => {
    let s = step(nearFinish(playing({ ringsCollected: collected(4), levelScore: 600 })), input());
    expect(s.results[0]).toMatchObject({ allRingsBonus: 1000, noStreetBonus: 500, score: 2100 });
    s = step(nearFinish(playing({ ringsCollected: collected(3), levelScore: 600, progress: { ...playing().progress, touchedStreet: true } })), input());
    expect(s.results[0]).toMatchObject({ allRingsBonus: 0, noStreetBonus: 0, score: 600 });
  });

  it('pousar na rua durante o nível perde o bônus "sem tocar a rua"', () => {
    let s = playing();
    s = { ...s, player: { ...s.player, pos: { x: 0, y: 3, z: 10 }, vel: { x: 0, y: -5, z: 0 }, grounded: false, mode: 'air' } };
    s = runTicks(s, 30, input());
    expect(s.progress.touchedStreet).toBe(true);
  });

  it('estrelas: ★ concluiu; ★★ com ≥ 75% dos anéis; ★★★ com pontuação ≥ par', () => {
    expect(starsFor(2, 4, 99999, 4000, cfg)).toBe(1);
    expect(starsFor(3, 4, 3999, 4000, cfg)).toBe(2);
    expect(starsFor(3, 4, 4000, 4000, cfg)).toBe(3);
    expect(starsFor(0, 0, 99999, 4000, cfg)).toBe(1);
  });
});

describe('God mode e atalhos de debug (2B)', () => {
  it('?god=1: cair não custa vida e a cota não é exigida', () => {
    let s = step(overVoid(playing({ god: true })), input());
    expect(s.lives).toBe(cfg.progression.lives);
    expect(s.phase).toBe('respawning');
    s = step(nearFinish(playing({ god: true, ringsCollected: collected(0) })), input());
    expect(s.phase).toBe('level_complete');
  });

  it('N (pular para a chegada), K (perder vida) e R (respawn) funcionam e tiram o run do ranking', () => {
    const base = playing({ ranked: true });
    const n = step(debugJumpToFinish(base), input());
    expect(n.ranked).toBe(false);
    expect(['level_complete', 'level_failed']).toContain(n.phase);
    const k = debugLoseLife(base);
    expect(k.ranked).toBe(false);
    expect(k.lives).toBe(base.lives - 1);
    expect(k.phase).toBe('respawning');
    const r = debugRespawn({ ...base, checkpointIndex: 1, player: { ...base.player, pos: { x: 3, y: 30, z: 58 } } });
    expect(r.ranked).toBe(false);
    expect(r.player.pos).toEqual({ x: 0, y: 0, z: 50 });
    expect(r.lives).toBe(base.lives);
  });
});
