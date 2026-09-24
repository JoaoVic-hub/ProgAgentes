import { describe, it, expect } from 'vitest';
import { createStyle, multiplierFor, ringPoints, speedBonusFor, updateStyle } from './scoring';
import { step } from './engine';
import { DEFAULT_GAME_CONFIG } from './config';
import { createPlayer } from './player/simulate';
import { input, makeTestLevel, ropeAt, runTicks, stateWith } from './testing';
import type { GameEvent, GameState, Player, Ring, StyleState } from './types';

const cfg = DEFAULT_GAME_CONFIG;
const sc = cfg.scoring;
const eventsOf = (s: GameState, type: string) => s.events.filter((e) => e.type === type);

const RING: Ring = { id: 0, center: { x: 0, y: 10, z: 50 }, normal: { x: 0, y: 0, z: 1 }, radius: 3, gold: false, risky: false };
const level = makeTestLevel([], { rings: [RING] });

function airborne(over: Partial<Player> = {}): Player {
  return { ...createPlayer({ x: 0, y: 30, z: 0 }), grounded: false, groundKind: null, mode: 'air', ...over };
}

function released(over: Partial<Extract<GameEvent, { type: 'web_released' }>> = {}): GameEvent {
  return { type: 'web_released', quality: 0.5, perfect: false, speed: 20, reason: 'manual', auto: false, fullSwing: true, ...over };
}

function upd(style: StyleState, player: Player, events: GameEvent[] = [], rings: number[] = []) {
  return updateStyle(style, player, events, rings, level, cfg);
}

/** Pés posicionados para o CENTRO do corpo ficar na altura y. */
const feetFor = (y: number, z: number) => ({ x: 0, y: y - cfg.physics.height / 2, z });

describe('Anéis (2A)', () => {
  it('anel é coletado mesmo quando cruzado entre dois ticks a 60 m/s', () => {
    let s = stateWith(level, { pos: feetFor(10, 49.5), vel: { x: 0, y: 0, z: 60 }, grounded: false, mode: 'air' });
    s = step(s, input());
    expect(s.player.pos.z).toBeGreaterThan(50);
    expect(eventsOf(s, 'ring_collected')).toHaveLength(1);
    expect(s.ringsCollected[0]).toBe(true);
  });

  it('cada anel conta uma única vez (atravessar de volta não conta de novo)', () => {
    let s = stateWith(level, { pos: feetFor(10, 49), vel: { x: 0, y: 0, z: 20 }, grounded: false, mode: 'air' });
    let total = 0;
    s = runTicks(s, 6, input(), (st) => (total += eventsOf(st, 'ring_collected').length));
    s = { ...s, player: { ...s.player, pos: feetFor(10, 51), vel: { x: 0, y: 0, z: -20 } } };
    runTicks(s, 6, input(), (st) => (total += eventsOf(st, 'ring_collected').length));
    expect(total).toBe(1);
  });

  it('passar por fora do raio (+ folga) não coleta', () => {
    let s = stateWith(level, { pos: feetFor(10 + RING.radius + sc.ringSlack + 0.3, 49), vel: { x: 0, y: 0, z: 20 }, grounded: false, mode: 'air' });
    s = runTicks(s, 5, input());
    expect(s.ringsCollected[0]).toBe(false);
  });

  it('faixas de bônus de velocidade: 0, +50% e +100%', () => {
    expect(speedBonusFor(sc.speedBonusHalf - 0.1, sc)).toBe(0);
    expect(speedBonusFor(sc.speedBonusHalf, sc)).toBe(0.5);
    expect(speedBonusFor(sc.speedBonusFull, sc)).toBe(1);
    expect(ringPoints(false, 10, 0, sc)).toBe(100);
    expect(ringPoints(false, sc.speedBonusFull, 0, sc)).toBe(200);
    expect(ringPoints(true, sc.speedBonusHalf, 0, sc)).toBe(600);
  });

  it('anel não soma no chain, mas renova o timer do combo e usa o multiplicador', () => {
    const style = { ...createStyle(), chain: 5, comboTimerTicks: 3 };
    const r = upd(style, airborne({ vel: { x: 0, y: 0, z: 10 } }), [], [0]);
    expect(r.style.chain).toBe(5);
    expect(r.style.comboTimerTicks).toBe(Math.round(sc.comboTimeout * cfg.tickHz));
    expect(r.ringPoints).toBe(Math.round(100 * multiplierFor(5, sc)));
  });
});

describe('Combo e eventos de estilo (2A)', () => {
  it('multiplicador sobe 0,5 a cada 4 eventos, até ×5', () => {
    expect([0, 3, 4, 7, 8, 12].map((c) => multiplierFor(c, sc))).toEqual([1, 1, 1.5, 1.5, 2, 2.5]);
    expect(multiplierFor(32, sc)).toBe(5);
    expect(multiplierFor(400, sc)).toBe(5);
  });

  it('swing válido vale 10 × mult e soma 1 no chain; soltura perfeita soma mais 50', () => {
    const r = upd(createStyle(), airborne(), [released({ perfect: true })]);
    const kinds = r.events.flatMap((e) => (e.type === 'style' ? [e.kind] : []));
    expect(kinds).toEqual(['swing', 'perfect']);
    expect(r.stylePoints).toBe(10 + 50);
    expect(r.style.chain).toBe(2);
  });

  it('swing com menos de 0,35 s de teia (ou lento demais) não conta', () => {
    expect(upd(createStyle(), airborne(), [released({ fullSwing: false })]).style.chain).toBe(0);
    expect(upd(createStyle(), airborne(), [released({ speed: 5 })]).style.chain).toBe(0);
  });

  it('flip vale 100, ou 200 depois de uma soltura perfeita', () => {
    expect(upd(createStyle(), airborne(), [{ type: 'flip', afterPerfect: false }]).stylePoints).toBe(100);
    expect(upd(createStyle(), airborne(), [{ type: 'flip', afterPerfect: true }]).stylePoints).toBe(200);
  });

  it('sequência de velocidade: um evento a cada 2 s contínuos acima do limiar (não pontos por tempo)', () => {
    let style = createStyle();
    const fast = airborne({ vel: { x: 0, y: 0, z: sc.speedStreakSpeed + 1 } });
    let streaks = 0;
    for (let i = 0; i < Math.round(4.2 * cfg.tickHz); i++) {
      const r = upd(style, fast);
      streaks += r.events.filter((e) => e.type === 'style' && e.kind === 'speed').length;
      style = r.style;
    }
    expect(streaks).toBe(2);
  });

  it('mais de 150 ms na rua quebra o combo; um raspão menor não', () => {
    const onStreet: Player = { ...createPlayer({ x: 0, y: 0, z: 0 }), grounded: true, groundKind: 'street' };
    const grace = Math.round(sc.streetGrace * cfg.tickHz);
    let style: StyleState = { ...createStyle(), chain: 6, comboTimerTicks: 999 };
    for (let i = 0; i < grace; i++) style = upd(style, onStreet).style;
    expect(style.chain).toBe(6);
    const r = upd(style, onStreet);
    expect(r.style.chain).toBe(0);
    expect(r.events).toContainEqual({ type: 'combo_lost', reason: 'street', chain: 6 });
  });

  it('mais de 1,2 s parado num teto quebra o combo', () => {
    const onRoof: Player = { ...createPlayer({ x: 0, y: 30, z: 0 }), grounded: true, groundKind: 'roof' };
    let style: StyleState = { ...createStyle(), chain: 4, comboTimerTicks: 9999 };
    let lostAt = -1;
    for (let i = 0; i < Math.round(1.3 * cfg.tickHz); i++) {
      const r = upd(style, onRoof);
      if (lostAt < 0 && r.events.some((e) => e.type === 'combo_lost' && e.reason === 'roof')) lostAt = i;
      style = r.style;
    }
    expect(lostAt).toBeGreaterThan(Math.round(1.1 * cfg.tickHz));
  });

  it('3 s sem evento quebram o combo (timeout)', () => {
    let style: StyleState = { ...createStyle(), chain: 3, comboTimerTicks: Math.round(sc.comboTimeout * cfg.tickHz) };
    let reason: string | null = null;
    for (let i = 0; i < Math.round(3.1 * cfg.tickHz); i++) {
      const r = upd(style, airborne());
      for (const e of r.events) if (e.type === 'combo_lost') reason = e.reason;
      style = r.style;
    }
    expect(reason).toBe('timeout');
  });

  it('bonk quebra o combo', () => {
    const r = upd({ ...createStyle(), chain: 2, comboTimerTicks: 50 }, airborne(), [{ type: 'bonk', speed: 30 }]);
    expect(r.style.chain).toBe(0);
  });

  it('no jogo, soltar a teia depois de um swing de verdade gera pontos no nível', () => {
    const rope = { ...ropeAt({ x: 0, y: 60, z: 20 }, 30), heldTicks: 30 };
    let s = stateWith(makeTestLevel([]), { pos: { x: 0, y: 30, z: 0 }, vel: { x: 0, y: 6, z: 20 }, rope, mode: 'swing', grounded: false, prevWebHeld: true });
    s = step(s, input());
    expect(eventsOf(s, 'style').length).toBeGreaterThanOrEqual(1);
    expect(s.levelScore).toBeGreaterThan(0);
    expect(s.progress.stylePoints).toBe(s.levelScore);
  });
});
