import { describe, it, expect } from 'vitest';
import { applyMomentum, createMomentum, momentumLevel, momentumOnFall, updateMomentum } from './momentum';
import { DEFAULT_GAME_CONFIG } from './config';
import { createPlayer } from './player/simulate';
import { step } from './engine';
import { input, makeTestLevel, ropeAt, runTicks, stateWith } from './testing';
import { length } from './math/vec3';
import type { GameEvent, InputFrame, MomentumState, Player } from './types';

const cfg = DEFAULT_GAME_CONFIG;
const m = cfg.momentum;
const T = (s: number) => Math.round(s * cfg.tickHz);

const air = (over: Partial<Player> = {}): Player => ({ ...createPlayer({ x: 0, y: 30, z: 0 }), grounded: false, groundKind: null, mode: 'air', ...over });
const released = (over: Partial<Extract<GameEvent, { type: 'web_released' }>> = {}): GameEvent => ({
  type: 'web_released', quality: 0.5, perfect: false, speed: 25, reason: 'manual', auto: false, fullSwing: true, ...over,
});
const at = (value: number, over: Partial<MomentumState> = {}): MomentumState => ({ ...createMomentum(), value, ...over });

function upd(state: MomentumState, events: GameEvent[] = [], player: Player = air(), prev: Player = air(), inp: InputFrame = input(), hit = false) {
  return updateMomentum(state, player, prev, events, inp, { hit }, cfg);
}

describe('Impulso: ganhos com execução precisa', () => {
  it('swing bem solto +0,5; soltura perfeita +1,0; flip +0,5 — e o combo conta os acertos', () => {
    let s = upd(createMomentum(), [released({ quality: 0.5 })]).momentum;
    expect(s.value).toBeCloseTo(m.gainSwing, 9);
    s = upd(s, [released({ quality: 0.9, perfect: true })]).momentum;
    expect(s.value).toBeCloseTo(m.gainSwing * 2 + m.gainPerfect, 9);
    s = upd(s, [{ type: 'flip', afterPerfect: true }]).momentum;
    expect(s.value).toBeCloseTo(m.gainSwing * 2 + m.gainPerfect + m.gainFlip, 9);
    expect(s.chain).toBe(3);
  });

  it('o impulso tem teto (nível máximo)', () => {
    let s = at(m.max - 0.2);
    s = upd(s, [released({ quality: 0.95, perfect: true })]).momentum;
    expect(s.value).toBe(m.max);
    expect(momentumLevel(s.value)).toBe(m.max);
  });

  it('toque curto na teia (menos de 0,35 s) não ganha nem perde', () => {
    const r = upd(at(2), [released({ fullSwing: false, quality: 0.0 })]);
    expect(r.momentum.value).toBe(2);
    expect(r.events).toEqual([]);
  });
});

describe('Impulso: erros tiram, tropeços levam parte', () => {
  it('clique sem alvo −0,5 e soltura ruim (ângulo muito errado) −0,5; ambos zeram o combo', () => {
    let r = upd(at(3, { chain: 5 }), [{ type: 'web_missed' }]);
    expect(r.momentum.value).toBeCloseTo(3 - m.lossMiss, 9);
    expect(r.momentum.chain).toBe(0);
    expect(r.events[0]).toMatchObject({ type: 'momentum_loss', reason: 'miss' });
    r = upd(at(3), [released({ quality: 0.05 })]);
    expect(r.momentum.value).toBeCloseTo(3 - m.lossPoorRelease, 9);
    expect(r.events[0]).toMatchObject({ reason: 'poor_release' });
  });

  it('soltura mediana (entre ruim e boa) é neutra', () => {
    expect(upd(at(2), [released({ quality: 0.3 })]).momentum.value).toBe(2);
  });

  it('flip atrasado (janela fechou sem flip e Espaço no ar logo depois) −0,25; após um flip válido, Espaço extra não pune', () => {
    const late = air({ flipAvailable: true, flipWindowTicks: 0 });
    const r = upd(at(3, { sinceReleaseTicks: 30 }), [], late, late, input({ jumpPressed: true }));
    expect(r.momentum.value).toBeCloseTo(3 - m.lossLateFlip, 9);
    expect(r.events[0]).toMatchObject({ reason: 'late_flip' });
    const afterFlip = air({ flipAvailable: false, flipWindowTicks: 0 });
    expect(upd(at(3, { sinceReleaseTicks: 30 }), [], afterFlip, afterFlip, input({ jumpPressed: true })).momentum.value).toBe(3);
    // muito depois de soltar (pulo "normal" em outra situação) também não pune
    expect(upd(at(3, { sinceReleaseTicks: T(2) }), [], late, late, input({ jumpPressed: true })).momentum.value).toBe(3);
  });

  it('bonk mantém 40%, míssil mantém 25%, queda no vão zera', () => {
    expect(upd(at(4), [{ type: 'bonk', speed: 30 }]).momentum.value).toBeCloseTo(4 * m.keepOnBonk, 9);
    expect(upd(at(4), [], air(), air(), input(), true).momentum.value).toBeCloseTo(4 * m.keepOnHit, 9);
    const f = momentumOnFall(at(4));
    expect(f.momentum.value).toBe(0);
    expect(f.events[0]).toMatchObject({ reason: 'fall', from: 4, to: 0 });
  });

  it('tocar a rua por mais de 150 ms mantém só 50% (uma vez); um raspão não perde nada', () => {
    const street: Player = { ...createPlayer({ x: 0, y: 0, z: 0 }), grounded: true, groundKind: 'street' };
    let s = at(4);
    for (let i = 0; i < T(m.streetGrace); i++) s = upd(s, [], street, street).momentum;
    expect(s.value).toBe(4);
    s = upd(s, [], street, street).momentum;
    expect(s.value).toBeCloseTo(4 * m.keepOnStreet, 9);
    const again = upd(s, [], street, street).momentum;
    expect(again.value).toBeCloseTo(s.value, 9); // não perde de novo a cada tick
  });

  it('sem nenhum acerto por 3 s o impulso escorre (0,5 por segundo); parado num telhado também', () => {
    let s = at(3);
    for (let i = 0; i < T(m.idleTimeout); i++) s = upd(s).momentum;
    expect(s.value).toBe(3);
    for (let i = 0; i < T(1); i++) s = upd(s).momentum;
    expect(s.value).toBeCloseTo(3 - m.idleDecay, 1);

    const roof: Player = { ...createPlayer({ x: 0, y: 30, z: 0 }), grounded: true, groundKind: 'roof' };
    let r = at(3);
    for (let i = 0; i < T(m.roofGrace) + T(1); i++) r = upd(r, [], roof, roof).momentum;
    expect(r.value).toBeLessThan(3);
  });
});

describe('Impulso vira velocidade', () => {
  it('a config efetiva cresce com o impulso (teto, boost, assistência, bombeio) e corta o arrasto', () => {
    expect(applyMomentum(cfg, 0)).toBe(cfg);
    const hi = applyMomentum(cfg, 5);
    expect(hi.web.swingMaxSpeed).toBe(cfg.web.swingMaxSpeed + 5 * m.swingMaxPerLevel);
    expect(hi.web.releaseBoostMax).toBeGreaterThan(cfg.web.releaseBoostMax);
    expect(hi.web.swingAssist).toBeGreaterThan(cfg.web.swingAssist);
    expect(hi.web.pump).toBeGreaterThan(cfg.web.pump);
    expect(hi.physics.airDragQuad).toBeLessThan(cfg.physics.airDragQuad);
  });

  it('o mesmo balanço fica mais rápido com impulso alto', () => {
    const level = makeTestLevel([]);
    const run = (value: number) => {
      const rope = { ...ropeAt({ x: 0, y: 80, z: 30 }, 45), heldTicks: 30 };
      let s = stateWith(level, { pos: { x: 0, y: 40, z: 0 }, vel: { x: 0, y: 0, z: 18 }, rope, mode: 'swing', grounded: false, prevWebHeld: true });
      s = { ...s, momentum: { ...s.momentum, value } };
      let max = 0;
      runTicks(s, 150, input({ webHeld: true, moveZ: 1 }), (st) => (max = Math.max(max, length(st.player.vel))));
      return max;
    };
    const slow = run(0);
    const fast = run(5);
    expect(fast).toBeGreaterThan(slow * 1.3); // medido: 32,5 → 44,9 m/s (+38%)
  });

  it('no jogo, soltar bem depois de um swing de verdade sobe o impulso', () => {
    const rope = { ...ropeAt({ x: 0, y: 60, z: 20 }, 30), heldTicks: 30 };
    // subindo a ~35°: soltura perfeita
    let s = stateWith(makeTestLevel([]), { pos: { x: 0, y: 30, z: 0 }, vel: { x: 0, y: 11.5, z: 16.4 }, rope, mode: 'swing', grounded: false, prevWebHeld: true });
    s = step(s, input());
    expect(s.momentum.value).toBeGreaterThan(0);
    expect(s.events.some((e) => e.type === 'momentum_gain')).toBe(true);
  });
});
