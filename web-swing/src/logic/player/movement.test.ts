import { describe, it, expect } from 'vitest';
import { createGame, step } from '../engine';
import { DEFAULT_GAME_CONFIG } from '../config';
import { generateLevel } from '../level/generator';
import { LEVEL_SPECS } from '../level/specs';
import { hashState } from '../replay';
import { nextInt } from '../rng';
import { overlapsAnySolid } from './collision';
import { input, makeTestLevel, runTicks, stateWith } from '../testing';
import type { GameState, InputFrame } from '../types';

const cfg = DEFAULT_GAME_CONFIG;
const hSpeed = (s: GameState) => Math.hypot(s.player.vel.x, s.player.vel.z);
const eventsOf = (s: GameState, type: string) => s.events.filter((e) => e.type === type);

describe('Movimento no chão e gravidade (1B)', () => {
  it('sem input, cai e para com os pés em y = 0', () => {
    const level = makeTestLevel([]);
    let s = stateWith(level, { pos: { x: 0, y: 5, z: 0 }, grounded: false, mode: 'air' });
    s = runTicks(s, 120, input());
    expect(s.player.pos.y).toBe(0);
    expect(s.player.vel.y).toBe(0);
    expect(s.player.grounded).toBe(true);
    expect(s.player.mode).toBe('ground');
    expect(s.player.groundKind).toBe('street');
  });

  it('W acelera até 11 m/s e a diagonal não é mais rápida', () => {
    const level = makeTestLevel([]);
    const straight = runTicks(createGame(level), 90, input({ moveZ: 1 }));
    const diagonal = runTicks(createGame(level), 90, input({ moveZ: 1, moveX: 1 }));
    expect(hSpeed(straight)).toBeCloseTo(cfg.physics.runMax, 9);
    expect(hSpeed(diagonal)).toBeCloseTo(cfg.physics.runMax, 9);
    expect(straight.player.vel.z).toBeGreaterThan(0);
  });

  it('W segue o yaw: olhando para +X, W anda em +X e D (direita = frente × cima) anda em +Z', () => {
    const level = makeTestLevel([]);
    const yaw = Math.PI / 2;
    const w = runTicks(createGame(level), 60, input({ moveZ: 1, yaw }));
    const d = runTicks(createGame(level), 60, input({ moveX: 1, yaw }));
    expect(w.player.vel.x).toBeGreaterThan(10);
    expect(d.player.vel.z).toBeGreaterThan(10);
  });

  it('olhando para +Z (yaw 0), D anda em −X', () => {
    const d = runTicks(createGame(makeTestLevel([])), 60, input({ moveX: 1 }));
    expect(d.player.vel.x).toBeLessThan(-10);
  });

  it('pulo só funciona no chão (ou no tempo de coyote)', () => {
    const level = makeTestLevel([]);
    const onGround = step(createGame(level), input({ jumpPressed: true }));
    expect(eventsOf(onGround, 'jumped')).toHaveLength(1);
    expect(onGround.player.vel.y).toBeGreaterThan(10);

    const midAir = stateWith(level, { pos: { x: 0, y: 20, z: 0 }, grounded: false, mode: 'air', airTicks: 30 });
    const tried = step(midAir, input({ jumpPressed: true }));
    expect(eventsOf(tried, 'jumped')).toHaveLength(0);
    expect(tried.player.vel.y).toBeLessThan(0);
  });

  it('coyote: pular logo depois de sair da beira do telhado ainda vale', () => {
    const level = makeTestLevel([{ min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 10, z: 5 } }]);
    let s = stateWith(level, { pos: { x: 0, y: 10, z: 4.6 }, vel: { x: 0, y: 0, z: 11 }, groundKind: 'roof' });
    for (let i = 0; i < 20 && s.player.grounded; i++) s = step(s, input({ moveZ: 1 }));
    expect(s.player.grounded).toBe(false);
    s = runTicks(s, 2, input({ moveZ: 1 }));
    expect(s.player.grounded).toBe(false);
    s = step(s, input({ moveZ: 1, jumpPressed: true }));
    expect(eventsOf(s, 'jumped')).toHaveLength(1);
  });

  it('buffer: Espaço apertado pouco antes de pousar pula ao pousar', () => {
    const level = makeTestLevel([]);
    let s = stateWith(level, { pos: { x: 0, y: 0.6, z: 0 }, vel: { x: 0, y: -8, z: 0 }, grounded: false, mode: 'air', airTicks: 20 });
    s = step(s, input({ jumpPressed: true }));
    expect(eventsOf(s, 'jumped')).toHaveLength(0);
    let jumped = false;
    s = runTicks(s, 8, input(), (st) => {
      if (eventsOf(st, 'jumped').length) jumped = true;
    });
    expect(jumped).toBe(true);
  });
});

describe('Colisão com paredes e telhados (1B)', () => {
  it('a 60 m/s não atravessa uma parede de 1 m', () => {
    const level = makeTestLevel([{ min: { x: -20, y: 0, z: 10 }, max: { x: 20, y: 50, z: 11 } }]);
    let s = stateWith(level, { pos: { x: 0, y: 5, z: 0 }, vel: { x: 0, y: 0, z: 60 }, grounded: false, mode: 'air' });
    s = runTicks(s, 30, input());
    expect(s.player.pos.z + cfg.physics.halfWidth).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('pousa no telhado e fica apoiado (groundKind = roof)', () => {
    const level = makeTestLevel([{ min: { x: -10, y: 0, z: -10 }, max: { x: 10, y: 30, z: 10 } }]);
    let s = stateWith(level, { pos: { x: 0, y: 40, z: 0 }, grounded: false, mode: 'air' });
    s = runTicks(s, 120, input());
    expect(s.player.pos.y).toBe(30);
    expect(s.player.grounded).toBe(true);
    expect(s.player.groundKind).toBe('roof');
  });

  it('abaixo de 22 m/s desliza na parede; acima dá bonk e atordoa', () => {
    const wall = makeTestLevel([{ min: { x: 5, y: 0, z: -100 }, max: { x: 6, y: 50, z: 100 } }]);
    // diagonal lenta: perde só a componente contra a parede
    let slow = stateWith(wall, { pos: { x: 4.6, y: 10, z: 0 }, vel: { x: 12, y: 0, z: 12 }, grounded: false, mode: 'air' });
    slow = step(slow, input());
    expect(eventsOf(slow, 'bonk')).toHaveLength(0);
    expect(slow.player.vel.x).toBe(0);
    expect(slow.player.vel.z).toBeGreaterThan(10);

    let fast = stateWith(wall, { pos: { x: 4.6, y: 10, z: 0 }, vel: { x: 30, y: 0, z: 10 }, grounded: false, mode: 'air' });
    fast = step(fast, input());
    expect(eventsOf(fast, 'bonk')).toHaveLength(1);
    expect(fast.player.stunTicks).toBeGreaterThan(0);
  });

  it('sobe sozinho um beiral baixo (≤ 1,2 m) ao bater nele', () => {
    const level = makeTestLevel([{ min: { x: -10, y: 0, z: 5 }, max: { x: 10, y: 1, z: 20 } }]);
    const s = runTicks(createGame(level), 90, input({ moveZ: 1 }));
    expect(s.player.pos.y).toBe(1);
    expect(s.player.pos.z).toBeGreaterThan(6);
  });

  it('fuzz: com inputs pseudoaleatórios o jogador nunca termina um tick dentro de um sólido', () => {
    const level = generateLevel(LEVEL_SPECS[0]);
    for (const seed of [1, 2, 3]) {
      let rng = seed;
      let s = createGame(level);
      let current: InputFrame = input();
      for (let t = 0; t < 900; t++) {
        if (t % 20 === 0) {
          let a: number, b: number, c: number, d: number, e: number;
          [rng, a] = nextInt(rng, 3);
          [rng, b] = nextInt(rng, 3);
          [rng, c] = nextInt(rng, 628);
          [rng, d] = nextInt(rng, 100);
          [rng, e] = nextInt(rng, 4);
          current = input({
            moveX: (a - 1) as -1 | 0 | 1,
            moveZ: (b - 1) as -1 | 0 | 1,
            yaw: c / 100 - Math.PI,
            pitch: (d / 100) * 1.2 - 0.2,
            webHeld: e > 0,
            jumpPressed: e === 3,
          });
        }
        s = step(s, t % 20 === 0 ? current : { ...current, jumpPressed: false });
        expect(overlapsAnySolid(level, s.player.pos, cfg.physics)).toBe(false);
      }
    }
  });
});

describe('Determinismo da simulação (Princípio III)', () => {
  it('600 ticks com os mesmos inputs produzem o mesmo hashState', () => {
    const level = generateLevel(LEVEL_SPECS[0]);
    const script = (t: number): InputFrame =>
      input({ moveZ: 1, yaw: Math.sin(t / 40) * 0.6, pitch: 0.5, webHeld: t % 90 < 60, jumpPressed: t % 90 === 0 });
    const a = runTicks(createGame(level), 600, script);
    const b = runTicks(createGame(level), 600, script);
    expect(hashState(a)).toBe(hashState(b));
    expect(a).toEqual(b);
  });
});
