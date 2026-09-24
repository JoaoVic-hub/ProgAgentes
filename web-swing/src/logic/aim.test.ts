import { describe, it, expect } from 'vitest';
import { computeAim, NO_AIM } from './aim';
import { step } from './engine';
import { DEFAULT_GAME_CONFIG } from './config';
import { createPlayer } from './engine';
import { createRope } from './player/web';
import { input, lookAtFrom, makeTestLevel, ropeAt, runTicks, stateWith } from './testing';
import { attachPoint } from './player/web';
import { cameraPivot, safeCameraPivot } from './camera-rig';
import { pointInBox, rayVsBox } from './math/geom';
import { length, sub } from './math/vec3';
import type { AimResult, GameState } from './types';

const cfg = DEFAULT_GAME_CONFIG;
const eventsOf = (s: GameState, type: string) => s.events.filter((e) => e.type === type);
const ORIGIN = { x: 0, y: 0, z: 0 };

/** Prédios à esquerda (quina em x = −14) e à direita (quina em x = +14). */
const LEFT = { min: { x: -34, y: 0, z: 30 }, max: { x: -14, y: 40, z: 60 }, side: -1 as const };
const RIGHT = { min: { x: 14, y: 0, z: 30 }, max: { x: 34, y: 40, z: 60 }, side: 1 as const };

describe('Assistência de mira (1C.2)', () => {
  it('mirando no céu perto de uma quina, a assistência escolhe a quina dentro do cone', () => {
    const level = makeTestLevel([LEFT]);
    // 4 m acima da quina, a ~45 m: ~5° fora do telhado
    const look = lookAtFrom(ORIGIN, { x: -14, y: 44, z: 40 });
    const aim = computeAim(level, createPlayer(ORIGIN, look.yaw, look.pitch), NO_AIM, cfg);
    expect(aim.fail).toBe('sky');
    expect(aim.source).toBe('assist');
    expect(aim.point!.x).toBe(-14);
    expect(aim.point!.y).toBe(40);
  });

  it('sem assistência, o mesmo ponto fica sem alvo', () => {
    const level = makeTestLevel([LEFT]);
    const look = lookAtFrom(ORIGIN, { x: -14, y: 44, z: 40 });
    const noAssist = { ...cfg, aim: { ...cfg.aim, assistEnabled: false } };
    const aim = computeAim(level, createPlayer(ORIGIN, look.yaw, look.pitch), NO_AIM, noAssist);
    expect(aim.point).toBeNull();
  });

  it('nunca ancora atrás de quem mira (olhando quase na vertical)', () => {
    // quina alta logo atrás do jogador, dentro do cone de 20° em torno do "para cima"
    const level = makeTestLevel([{ min: { x: -30, y: 0, z: -8 }, max: { x: -1, y: 60, z: -4 }, side: -1 }]);
    const player = createPlayer(ORIGIN, 0, (75 * Math.PI) / 180);
    const aim = computeAim(level, player, NO_AIM, cfg);
    expect(aim.point).toBeNull();
  });

  it('a assistência respeita a linha de visada (vidro na frente bloqueia)', () => {
    const level = makeTestLevel([
      LEFT,
      { min: { x: -14, y: 0, z: 18 }, max: { x: -2, y: 70, z: 22 }, kind: 'glass' },
    ]);
    const look = lookAtFrom(ORIGIN, { x: -14, y: 44, z: 40 });
    const aim = computeAim(level, createPlayer(ORIGIN, look.yaw, look.pitch), NO_AIM, cfg);
    expect(aim.point).toBeNull();
  });

  it('histerese: com duas quinas quase empatadas, mantém o alvo anterior', () => {
    const level = makeTestLevel([LEFT, RIGHT]);
    // olhando para o meio da avenida, acima dos telhados: as duas quinas empatam
    const look = lookAtFrom(ORIGIN, { x: 0, y: 44, z: 42 });
    const player = createPlayer(ORIGIN, look.yaw, look.pitch);
    const first = computeAim(level, player, NO_AIM, cfg);
    expect(first.source).toBe('assist');
    // gira 2° em direção à OUTRA quina: ainda deve manter a primeira
    const towardsOther = first.point!.x < 0 ? -1 : 1;
    const nudged = createPlayer(ORIGIN, look.yaw - towardsOther * ((2 * Math.PI) / 180), look.pitch);
    const second = computeAim(level, nudged, first, cfg);
    expect(second.solidId).toBe(first.solidId);
    // sem memória do alvo anterior, o mesmo olhar escolheria a outra quina
    const fresh: AimResult = computeAim(level, nudged, NO_AIM, cfg);
    expect(fresh.solidId).not.toBe(first.solidId);
  });
});

describe('Buffer de clique, flip e solturas automáticas (1C.2)', () => {
  it('clique sem alvo fica pendente e anexa se o alvo aparecer em até 9 ticks', () => {
    const level = makeTestLevel([LEFT]);
    const sky = lookAtFrom(ORIGIN, { x: 40, y: 80, z: 10 });
    const target = lookAtFrom(ORIGIN, { x: -14, y: 40, z: 35 }); // ~54 m (alcance: 60)
    let s = stateWith(level, sky);
    s = step(s, input({ ...sky, webHeld: true }));
    expect(s.player.webBufferTicks).toBeGreaterThan(0);
    s = runTicks(s, 5, input({ ...sky, webHeld: true }));
    expect(s.player.rope).toBeNull();
    s = step(s, input({ ...target, webHeld: true }));
    expect(eventsOf(s, 'web_attached')).toHaveLength(1);
    expect(s.stats).toEqual({ webShots: 1, webMisses: 0 });
  });

  it('flip só vale na janela logo após soltar e só 1× por soltura', () => {
    const level = makeTestLevel([]);
    const rope = { ...createRope({ x: 0, y: 80, z: 20 }, 0, { x: 0, y: 40, z: 0 }, cfg.web), heldTicks: 30 };
    let s = stateWith(level, { pos: { x: 0, y: 40, z: 0 }, vel: { x: 0, y: 6, z: 20 }, rope, mode: 'swing', grounded: false, prevWebHeld: true });
    s = step(s, input()); // solta
    s = step(s, input({ jumpPressed: true }));
    expect(eventsOf(s, 'flip')).toHaveLength(1);
    s = step(s, input({ jumpPressed: true }));
    expect(eventsOf(s, 'flip')).toHaveLength(0);

    // fora da janela: nada de flip
    let late = stateWith(level, { pos: { x: 0, y: 40, z: 0 }, vel: { x: 0, y: 6, z: 20 }, rope, mode: 'swing', grounded: false, prevWebHeld: true });
    late = step(late, input());
    late = runTicks(late, 30, input());
    late = step(late, input({ jumpPressed: true }));
    expect(eventsOf(late, 'flip')).toHaveLength(0);
  });

  it('solta sozinho ao subir acima da âncora', () => {
    const level = makeTestLevel([]);
    const anchor = { x: 0, y: 40, z: 10 };
    const feet = { x: 0, y: 38.2, z: 0 };
    const rope = createRope(anchor, 0, feet, cfg.web);
    let s = stateWith(level, { pos: feet, vel: { x: 0, y: 25, z: 10 }, rope, mode: 'swing', grounded: false, prevWebHeld: true });
    let released: GameState | null = null;
    runTicks(s, 60, input({ webHeld: true }), (st) => {
      if (!released && eventsOf(st, 'web_released').length) released = st;
    });
    expect(released).not.toBeNull();
    const ev = released!.events.find((e) => e.type === 'web_released');
    expect(ev).toMatchObject({ auto: true, reason: 'above' });
  });

  it('solta sozinho após 0,5 s encostado numa parede (motivo = wall, sem subir acima da âncora)', () => {
    const level = makeTestLevel([LEFT]);
    // apoio além da fachada e bem acima: o jogador fica pendurado prensado na parede
    const anchor = { x: -16.5, y: 60, z: 45 };
    const feet = { x: -13.6, y: 25, z: 45 };
    const rope = ropeAt(anchor, length(sub(attachPoint(feet, cfg.web), anchor)));
    const s = stateWith(level, { pos: feet, rope, mode: 'swing', grounded: false, prevWebHeld: true });
    let released: GameState | null = null;
    let firstContact = -1;
    runTicks(s, 90, input({ webHeld: true, moveX: 1 }), (st) => {
      if (firstContact < 0 && st.player.wallTicks > 0) firstContact = st.tick;
      if (!released && eventsOf(st, 'web_released').length) released = st;
    });
    expect(released).not.toBeNull();
    const r = released!;
    expect(r.events.find((e) => e.type === 'web_released')).toMatchObject({ reason: 'wall', auto: true });
    // 0,5 s (30 ticks) de contato contínuo com a parede
    const wallTicks = Math.round(cfg.web.wallReleaseTime * cfg.tickHz);
    expect(Math.abs(r.tick - firstContact - wallTicks)).toBeLessThanOrEqual(1);
    expect(attachPoint(r.player.pos, cfg.web).y).toBeLessThan(anchor.y);
  });

  it('soltar a teia apoiado no chão não abre o flip: pulo + Espaço no ar não vira pulo duplo', () => {
    const level = makeTestLevel([{ min: { x: -20, y: 0, z: -20 }, max: { x: 20, y: 30, z: 20 } }]);
    const rope = { ...ropeAt({ x: 0, y: 50, z: 10 }, 25), heldTicks: 30 };
    let s = stateWith(level, { pos: { x: 0, y: 30, z: 0 }, grounded: true, groundKind: 'roof', rope, mode: 'swing', prevWebHeld: true });
    s = step(s, input()); // solta ainda no telhado
    s = step(s, input({ jumpPressed: true }));
    expect(eventsOf(s, 'jumped')).toHaveLength(1);
    s = runTicks(s, 2, input());
    s = step(s, input({ jumpPressed: true }));
    expect(eventsOf(s, 'flip')).toHaveLength(0);
  });

  it('buffer de clique: alvo aparecendo no 9º tick ainda anexa; no 10º já expirou (web_missed)', () => {
    const level = makeTestLevel([LEFT]);
    const sky = lookAtFrom(ORIGIN, { x: 40, y: 80, z: 10 });
    const target = lookAtFrom(ORIGIN, { x: -14, y: 40, z: 35 });
    const buffer = Math.round(cfg.aim.bufferTime * cfg.tickHz);
    const run = (appearAt: number) => {
      let s = step(stateWith(level, sky), input({ ...sky, webHeld: true })); // clique no tick 1
      let attached = false;
      let missed = 0;
      for (let t = 2; t <= buffer + 3; t++) {
        s = step(s, input({ ...(t >= appearAt ? target : sky), webHeld: true }));
        if (eventsOf(s, 'web_attached').length) attached = true;
        missed += eventsOf(s, 'web_missed').length;
      }
      return { attached, missed, stats: s.stats };
    };
    expect(run(1 + buffer)).toMatchObject({ attached: true, missed: 0 });
    expect(run(2 + buffer)).toMatchObject({ attached: false, missed: 1, stats: { webShots: 1, webMisses: 1 } });
  });
});

describe('Pivô da câmera e mira junto a paredes (revisão)', () => {
  // prédio A encostado à direita do jogador (olhando para +Z, a direita é −X) e prédio B atrás de A
  const A = { min: { x: -34, y: 0, z: 20 }, max: { x: -14, y: 40, z: 60 }, side: -1 as const };
  const B = { min: { x: -34, y: 0, z: 70 }, max: { x: -14, y: 60, z: 100 }, side: -1 as const };
  const feet = { x: -13.65, y: 0, z: 40 };

  it('o pivô seguro nunca fica dentro de um sólido, mesmo com o ombro encostado na fachada', () => {
    const level = makeTestLevel([A]);
    const pivot = safeCameraPivot(level, feet, 0, cfg.rig);
    expect(level.solids.some((s) => pointInBox(pivot, s.box))).toBe(false);
    expect(cameraPivot(feet, 0, cfg.rig).x).toBeLessThan(-14); // o ingênuo entraria no prédio
  });

  it('encostado na fachada, a teia não gruda num prédio através da parede', () => {
    const level = makeTestLevel([A, B]);
    const look = lookAtFrom(feet, { x: -25, y: 30, z: 70 });
    const s = step(stateWith(level, { pos: feet, ...look }), input({ ...look, webHeld: true }));
    if (s.player.rope) {
      // se anexou, o segmento peito → contato não pode atravessar A
      const chest = attachPoint(s.player.pos, cfg.web);
      const d = sub(s.player.rope.contact, chest);
      const dist = length(d);
      const hitA = rayVsBox(chest, { x: d.x / dist, y: d.y / dist, z: d.z / dist }, level.solids.find((x) => x.box.max.z === 60)!.box, dist - 0.05);
      expect(hitA).toBeNull();
    }
    expect(s.aim.solidId === null || level.solids[s.aim.solidId].box.min.z !== 70 || s.aim.source === 'assist').toBe(true);
  });

  it('snap na quina fora de alcance não descarta o acerto direto válido na fachada', () => {
    const level = makeTestLevel([{ min: { x: -34, y: 0, z: 20 }, max: { x: -14, y: 40, z: 70 }, side: -1 }]);
    // fachada a ~57,7 m do peito, 10 m abaixo do topo: a quina ficaria a ~63 m (fora do alcance)
    const look = lookAtFrom(ORIGIN, { x: -14, y: 30, z: 48 });
    const aim = computeAim(level, createPlayer(ORIGIN, look.yaw, look.pitch), NO_AIM, cfg);
    expect(aim.point).not.toBeNull();
    expect(aim.source).toBe('direct');
  });
});
