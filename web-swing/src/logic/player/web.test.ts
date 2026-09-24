import { describe, it, expect } from 'vitest';
import { step } from '../engine';
import { DEFAULT_GAME_CONFIG } from '../config';
import { attachPoint, createRope, releaseBoost } from './web';
import { overlapsAnySolid } from './collision';
import { input, lookAtFrom, makeTestLevel, ropeAt, runTicks, stateWith } from '../testing';
import { length, sub } from '../math/vec3';
import type { GameConfig, GameState } from '../types';

const cfg = DEFAULT_GAME_CONFIG;
const DEG = Math.PI / 180;
const eventsOf = (s: GameState, type: string) => s.events.filter((e) => e.type === type);
const ropeDist = (s: GameState) => length(sub(attachPoint(s.player.pos, cfg.web), s.player.rope!.anchor));

/** Prédio à esquerda da avenida com a quina do telhado em x = −14, y = 40. */
const LEFT_BUILDING = { min: { x: -34, y: 0, z: 20 }, max: { x: -14, y: 40, z: 60 }, side: -1 as const };

describe('Teia — corda (1C.1)', () => {
  it('a corda nunca passa do comprimento L em 600 ticks', () => {
    const level = makeTestLevel([]);
    const anchor = { x: 0, y: 60, z: 20 };
    const feet = { x: 0, y: 30, z: 0 };
    const rope = createRope(anchor, 0, feet, cfg.web);
    let s = stateWith(level, { pos: feet, vel: { x: 0, y: 0, z: 15 }, rope, mode: 'swing', grounded: false, prevWebHeld: true });
    let checked = 0;
    s = runTicks(s, 600, input({ webHeld: true, moveZ: 1 }), (st) => {
      if (st.player.rope) {
        expect(ropeDist(st)).toBeLessThanOrEqual(st.player.rope.length + 1e-6);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(300);
  });

  it('pêndulo sem arrasto nem assistência conserva ≥ 95% da energia em meio período', () => {
    const level = makeTestLevel([]);
    const noAssist: GameConfig = {
      ...cfg,
      physics: { ...cfg.physics, airDragQuad: 0 },
      web: { ...cfg.web, swingAssist: 0, pump: 0, autoReel: 0 },
    };
    const anchor = { x: 0, y: 100, z: 0 };
    const L = 20;
    const theta = 60 * DEG;
    const attach = { x: 0, y: anchor.y - L * Math.cos(theta), z: L * Math.sin(theta) };
    const feet = { x: 0, y: attach.y - cfg.web.attachHeight, z: attach.z };
    const rope = ropeAt(anchor, L);
    let s = stateWith(level, { pos: feet, rope, mode: 'swing', grounded: false, prevWebHeld: true }, noAssist);
    const bottom = anchor.y - L - cfg.web.attachHeight;
    const energy = (st: GameState) => cfg.physics.gravity * (st.player.pos.y - bottom) + 0.5 * length(st.player.vel) ** 2;
    const e0 = energy(s);
    let minE = e0;
    let maxE = e0;
    let crossed = false;
    s = runTicks(s, 180, input({ webHeld: true }), (st) => {
      minE = Math.min(minE, energy(st));
      maxE = Math.max(maxE, energy(st));
      if (st.player.pos.z < -10) crossed = true;
    });
    expect(crossed).toBe(true); // chegou ao outro lado do arco
    expect(minE).toBeGreaterThanOrEqual(0.95 * e0);
    expect(maxE).toBeLessThanOrEqual(1.02 * e0);
  });

  it('o anexo não teleporta o jogador (L = distância no instante do anexo)', () => {
    const level = makeTestLevel([LEFT_BUILDING]);
    const feet = { x: 0, y: 12, z: 0 };
    const look = lookAtFrom(feet, { x: -14, y: 40, z: 35 });
    const base = stateWith(level, { pos: feet, vel: { x: 0, y: 0, z: 20 }, grounded: false, mode: 'air', ...look });
    const withWeb = step(base, input({ ...look, webHeld: true }));
    const without = step(base, input({ ...look }));
    expect(eventsOf(withWeb, 'web_attached')).toHaveLength(1);
    expect(length(sub(withWeb.player.pos, without.player.pos))).toBeLessThan(0.05);
  });

  it('auto-reel mantém o fundo do arco ≥ 2 m acima da rua', () => {
    const level = makeTestLevel([LEFT_BUILDING]);
    const feet = { x: 0, y: 8, z: 0 };
    const look = lookAtFrom(feet, { x: -14, y: 40, z: 30 });
    let s = stateWith(level, { pos: feet, vel: { x: 0, y: 0, z: 22 }, grounded: false, mode: 'air', ...look });
    s = step(s, input({ ...look, webHeld: true }));
    expect(s.player.rope).not.toBeNull();
    let minY = Infinity;
    runTicks(s, 150, input({ ...look, webHeld: true }), (st) => {
      if (st.player.rope) minY = Math.min(minY, st.player.pos.y);
    });
    expect(minY).toBeGreaterThanOrEqual(2);
  });

  it('anexar a partir da rua dá um pulinho: o primeiro arco não arrasta o jogador no asfalto', () => {
    const level = makeTestLevel([LEFT_BUILDING]);
    const feet = { x: 0, y: 0, z: 0 };
    const look = lookAtFrom(feet, { x: -14, y: 30, z: 30 });
    let s = stateWith(level, { pos: feet, ...look });
    s = step(s, input({ ...look, webHeld: true, moveZ: 1 }));
    expect(s.player.rope).not.toBeNull();
    let groundedWhileSwinging = 0;
    runTicks(s, 90, input({ ...look, webHeld: true, moveZ: 1 }), (st) => {
      if (st.player.rope && st.player.grounded) groundedWhileSwinging++;
    });
    expect(groundedWhileSwinging).toBe(0);
  });

  it('a colisão vence a corda: puxado contra a fachada por vários ticks, nunca termina dentro do prédio', () => {
    const level = makeTestLevel([LEFT_BUILDING]);
    // apoio além da fachada (x = −14): o pêndulo empurra o jogador contra a parede
    const anchor = { x: -17, y: 45, z: 40 };
    const feet = { x: -11, y: 22, z: 40 };
    const rope = ropeAt(anchor, length(sub(attachPoint(feet, cfg.web), anchor)));
    let s = stateWith(level, { pos: feet, vel: { x: -6, y: 0, z: 0 }, rope, mode: 'swing', grounded: false, prevWebHeld: true });
    let roped = 0;
    let pressed = 0;
    s = runTicks(s, 90, input({ webHeld: true, moveX: 1 }), (st) => {
      expect(overlapsAnySolid(level, st.player.pos, cfg.physics)).toBe(false);
      if (st.player.rope) roped++;
      if (st.player.rope && st.player.wallTicks > 0) pressed++;
    });
    expect(roped).toBeGreaterThanOrEqual(20);
    expect(pressed).toBeGreaterThanOrEqual(15);
  });

  it('corda de verdade não fica frouxa nem dá trancos: |Δv| ≤ 3 m/s por tick num swing a partir da rua', () => {
    const level = makeTestLevel([{ min: { x: -34, y: 0, z: 20 }, max: { x: -14, y: 40, z: 90 }, side: -1 }]);
    const feet = { x: 0, y: 0, z: 20 };
    const look = lookAtFrom(feet, { x: -14, y: 40, z: 45 });
    let s = stateWith(level, { pos: feet, ...look });
    s = step(s, input({ ...look, webHeld: true, moveZ: 1 }));
    expect(s.player.rope).not.toBeNull();
    let prev = s;
    let maxJump = 0;
    let maxSlack = 0;
    let roped = 0;
    runTicks(s, 150, input({ ...look, webHeld: true, moveZ: 1 }), (st) => {
      if (st.player.rope && prev.player.rope && st.events.length === 0) {
        roped++;
        maxJump = Math.max(maxJump, length(sub(st.player.vel, prev.player.vel)));
        const dist = length(sub(attachPoint(st.player.pos, cfg.web), st.player.rope.anchor));
        maxSlack = Math.max(maxSlack, st.player.rope.length - dist);
      }
      prev = st;
    });
    expect(roped).toBeGreaterThan(60);
    expect(maxJump).toBeLessThanOrEqual(3);
    expect(maxSlack).toBeLessThanOrEqual(0.05);
  });

  it('se a colisão impediu o jogador de acompanhar a corda, ela cede em vez de dar um tranco', () => {
    const level = makeTestLevel([]);
    const anchor = { x: 0, y: 60, z: 0 };
    const feet = { x: 0, y: 30, z: 0 };
    // déficit de 3 m (distância real maior que L), como depois de uma parede segurar o jogador
    const dist = length(sub(attachPoint(feet, cfg.web), anchor));
    const rope = ropeAt(anchor, dist - 3);
    const s = step(stateWith(level, { pos: feet, rope, mode: 'swing', grounded: false, prevWebHeld: true }), input({ webHeld: true }));
    expect(length(s.player.vel)).toBeLessThan(2);
    expect(s.player.rope!.length).toBeCloseTo(length(sub(attachPoint(s.player.pos, cfg.web), anchor)), 3);
  });
});

describe('Teia — soltura e impulso (1C.1)', () => {
  it('soltura a 35° acima do horizonte dá o boost máximo e é "perfeita"', () => {
    const v = { x: 0, y: 20 * Math.sin(35 * DEG), z: 20 * Math.cos(35 * DEG) };
    const r = releaseBoost(v, cfg.web);
    expect(r.quality).toBeCloseTo(1, 9);
    expect(r.perfect).toBe(true);
    const gained = length({ x: r.vel.x, y: r.vel.y - cfg.web.releaseUpBoost, z: r.vel.z }) - 20;
    expect(gained).toBeCloseTo(cfg.web.releaseBoostMax, 9);
  });

  it('soltura na horizontal dá o boost mínimo; devagar demais não dá boost', () => {
    const flat = releaseBoost({ x: 0, y: 0, z: 20 }, cfg.web);
    expect(flat.quality).toBe(0);
    expect(flat.vel.z).toBeCloseTo(20 + cfg.web.releaseBoostMin, 9);
    const slow = releaseBoost({ x: 0, y: 1, z: 3 }, cfg.web);
    expect(slow.vel).toEqual({ x: 0, y: 1, z: 3 });
  });

  it('soltar o botão emite web_released e abre a janela de flip', () => {
    const level = makeTestLevel([]);
    const rope = { ...createRope({ x: 0, y: 60, z: 20 }, 0, { x: 0, y: 30, z: 0 }, cfg.web), heldTicks: 30 };
    let s = stateWith(level, { pos: { x: 0, y: 30, z: 0 }, vel: { x: 0, y: 8, z: 18 }, rope, mode: 'swing', grounded: false, prevWebHeld: true });
    s = step(s, input({ webHeld: false }));
    const released = eventsOf(s, 'web_released');
    expect(released).toHaveLength(1);
    expect(released[0]).toMatchObject({ reason: 'manual', auto: false, fullSwing: true });
    expect(s.player.rope).toBeNull();
    expect(s.player.flipWindowTicks).toBeGreaterThan(0);
  });

  it('impulso (Espaço com teia presa) só funciona 1× por teia', () => {
    const level = makeTestLevel([]);
    const rope = { ...createRope({ x: 0, y: 60, z: 20 }, 0, { x: 0, y: 30, z: 0 }, cfg.web), heldTicks: 30 };
    let s = stateWith(level, { pos: { x: 0, y: 30, z: 0 }, vel: { x: 0, y: 0, z: 15 }, rope, mode: 'swing', grounded: false, prevWebHeld: true });
    const hold = input({ webHeld: true });
    let impulses = 0;
    s = step(s, { ...hold, jumpPressed: true });
    impulses += eventsOf(s, 'web_impulse').length;
    s = step(s, hold);
    s = step(s, { ...hold, jumpPressed: true });
    impulses += eventsOf(s, 'web_impulse').length;
    expect(impulses).toBe(1);
  });
});

describe('Teia — anti-spam de cliques (revisão)', () => {
  it('teia presa por menos de 0,35 s: soltura sem boost, sem janela de flip e sem impulso', () => {
    const level = makeTestLevel([]);
    const rope = createRope({ x: 0, y: 60, z: 20 }, 0, { x: 0, y: 30, z: 0 }, cfg.web);
    let s = stateWith(level, { pos: { x: 0, y: 30, z: 0 }, vel: { x: 0, y: 8, z: 18 }, rope, mode: 'swing', grounded: false, prevWebHeld: true });
    s = step(s, input({ webHeld: true, jumpPressed: true }));
    expect(eventsOf(s, 'web_impulse')).toHaveLength(0);
    const before = length(s.player.vel);
    s = step(s, input({ webHeld: false }));
    const released = eventsOf(s, 'web_released');
    expect(released[0]).toMatchObject({ fullSwing: false, perfect: false });
    expect(length(s.player.vel)).toBeLessThan(before + 1);
    expect(s.player.flipWindowTicks).toBe(0);
  });

  it('3 s de cliques de 1 tick + Espaço não fazem o jogador subir nem passar do teto de velocidade', () => {
    const level = makeTestLevel([{ min: { x: -60, y: 0, z: -50 }, max: { x: -14, y: 150, z: 400 }, side: -1 }]);
    let s = stateWith(level, { pos: { x: 0, y: 10, z: 0 }, vel: { x: 0, y: 0, z: 12 }, grounded: false, mode: 'air', yaw: -0.6, pitch: 0.5 });
    let maxY = 0;
    let maxSpeed = 0;
    s = runTicks(s, 180, (t) => input({ yaw: -0.6, pitch: 0.5, webHeld: t % 8 === 0, jumpPressed: t % 8 === 1 || t % 8 === 0 }), (st) => {
      maxY = Math.max(maxY, st.player.pos.y);
      maxSpeed = Math.max(maxSpeed, length(st.player.vel));
    });
    expect(maxY).toBeLessThan(25);
    expect(maxSpeed).toBeLessThanOrEqual(cfg.web.swingMaxSpeed);
  });
});

describe('Teia — mira (1C.1)', () => {
  it('olhar para o céu vazio e clicar resulta em web_missed', () => {
    const level = makeTestLevel([]);
    let s = stateWith(level, { pitch: 1.2 });
    let missed = 0;
    s = runTicks(s, 20, input({ pitch: 1.2, webHeld: true }), (st) => {
      missed += eventsOf(st, 'web_missed').length;
    });
    expect(s.aim.fail).toBe('sky');
    expect(missed).toBe(1);
    expect(s.stats).toEqual({ webShots: 1, webMisses: 1 });
  });

  it('prédio além de 60 m é inválido (fail = range)', () => {
    const level = makeTestLevel([{ min: { x: -10, y: 0, z: 80 }, max: { x: 10, y: 40, z: 100 } }]);
    const look = lookAtFrom({ x: 0, y: 0, z: 0 }, { x: 0, y: 30, z: 80 });
    const s = step(stateWith(level, look), input(look));
    expect(s.aim.point).toBeNull();
    expect(s.aim.fail).toBe('range');
  });

  it('âncora abaixo de peito + 2,5 m é inválida (fail = low)', () => {
    const level = makeTestLevel([{ min: { x: -10, y: 0, z: 10 }, max: { x: 10, y: 3, z: 20 } }]);
    const look = lookAtFrom({ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 10 });
    const s = step(stateWith(level, look), input(look));
    expect(s.aim.point).toBeNull();
    expect(s.aim.fail).toBe('low');
  });

  it('vidro bloqueia a mira e não ancora (fail = glass)', () => {
    const level = makeTestLevel([
      { min: { x: -10, y: 0, z: 15 }, max: { x: 10, y: 50, z: 18 }, kind: 'glass' },
      { min: { x: -10, y: 0, z: 25 }, max: { x: 10, y: 60, z: 40 } },
    ]);
    const look = lookAtFrom({ x: 0, y: 0, z: 0 }, { x: 0, y: 30, z: 25 });
    const s = step(stateWith(level, look), input(look));
    expect(s.aim.point).toBeNull();
    expect(s.aim.fail).toBe('glass');
  });

  it('acerto na fachada perto do topo sobe para a quina do telhado (snap)', () => {
    const level = makeTestLevel([LEFT_BUILDING]);
    const look = lookAtFrom({ x: 0, y: 0, z: 0 }, { x: -14, y: 34, z: 40 });
    const s = step(stateWith(level, look), input(look));
    expect(s.aim.source).toBe('snap');
    expect(s.aim.point!.y).toBe(40);
  });
});
