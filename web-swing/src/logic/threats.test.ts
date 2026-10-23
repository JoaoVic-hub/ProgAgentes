import { describe, it, expect } from 'vitest';
import { aimPoint, chestOf, closestApproach, createThreats, stepThreats, turnToward } from './threats';
import { DEFAULT_GAME_CONFIG } from './config';
import { createPlayer } from './player/simulate';
import { LEVEL_SPECS } from './level/specs';
import { makeTestLevel } from './testing';
import { length, normalize, sub } from './math/vec3';
import type { Vec3 } from './math/vec3';
import type { GameEvent, Launcher, Level, Missile, Player, ThreatSpec, ThreatState } from './types';

const cfg = DEFAULT_GAME_CONFIG;
const mc = cfg.missiles;
const T = (s: number) => Math.round(s * cfg.tickHz);
const L1 = LEVEL_SPECS[0].threats;
const L5 = LEVEL_SPECS[4].threats;

const LAUNCHER: Launcher = { id: 0, pos: { x: -20, y: 41.5, z: 60 }, side: -1, solidId: 0 };

function levelWith(threats: ThreatSpec, boxes: Parameters<typeof makeTestLevel>[0] = [], launchers: Launcher[] = [LAUNCHER]): Level {
  const l = makeTestLevel(boxes, { launchers });
  return { ...l, spec: { ...l.spec, threats } };
}

const hover = (pos: Vec3, vel: Vec3 = { x: 0, y: 0, z: 0 }): Player => ({ ...createPlayer(pos), vel, grounded: false, groundKind: null, mode: 'air' });

/** Roda n ticks de ameaças com o jogador seguindo `path(t)`. */
function run(level: Level, threats: ThreatState, n: number, path: (t: number) => { pos: Vec3; vel: Vec3 }, god = false) {
  let th = threats;
  const events: GameEvent[] = [];
  let hits = 0;
  let minDist = Infinity;
  let prev = path(0).pos;
  for (let t = 1; t <= n; t++) {
    const p = path(t);
    const r = stepThreats(th, level, hover(p.pos, p.vel), prev, cfg, god);
    th = r.threats;
    events.push(...r.events);
    if (r.hit) hits++;
    for (const m of th.missiles) minDist = Math.min(minDist, length(sub(m.pos, chestOf(p.pos))));
    prev = p.pos;
  }
  return { threats: th, events, hits, minDist };
}

/** Míssil já armado (guiagem ligada) em `pos`, voando em `dir`. */
function armed(pos: Vec3, dir: Vec3, speed: number): Missile {
  const d = normalize(dir);
  return { id: 0, pos, vel: { x: d.x * speed, y: d.y * speed, z: d.z * speed }, ageTicks: T(mc.armTime) + 1, launcherId: 0 };
}

describe('Lançadores: mira, aviso, salva, recarga', () => {
  it('com o jogador no alcance e à vista: mira (aviso) → dispara a salva → recarrega → volta a mirar', () => {
    const level = levelWith({ ...L1, salvo: 2 });
    const still = () => ({ pos: { x: 0, y: 10, z: 30 }, vel: { x: 0, y: 0, z: 0 } });
    const first = run(level, createThreats(level), 1, still, true);
    expect(first.threats.launchers[0].phase).toBe('aiming');
    expect(first.events).toContainEqual({ type: 'launcher_aiming', launcherId: 0 });
    const aimed = run(level, first.threats, T(mc.warnTime) - 1, still, true);
    expect(aimed.events.some((e) => e.type === 'missile_launched')).toBe(false); // o aviso vem antes
    const fired = run(level, aimed.threats, T(mc.salvoInterval) * 2 + 2, still, true);
    expect(fired.events.filter((e) => e.type === 'missile_launched')).toHaveLength(2);
    expect(fired.threats.launchers[0].phase).toBe('cooldown');
    const back = run(level, fired.threats, T(L1.cooldown) + 1, still, true);
    expect(back.threats.launchers[0].phase === 'idle' || back.threats.launchers[0].phase === 'aiming').toBe(true);
  });

  it('não dispara sem linha de visada (um prédio no meio) nem fora do alcance', () => {
    const wall = { min: { x: -30, y: 0, z: 40 }, max: { x: 30, y: 80, z: 45 } };
    const hidden = levelWith(L1, [wall]);
    const behindWall = run(hidden, createThreats(hidden), 120, () => ({ pos: { x: 0, y: 10, z: 30 }, vel: { x: 0, y: 0, z: 0 } }), true);
    expect(behindWall.events.some((e) => e.type === 'launcher_aiming')).toBe(false);
    const open = levelWith(L1);
    const far = run(open, createThreats(open), 120, () => ({ pos: { x: 0, y: 10, z: 60 - mc.activationRange - 20 }, vel: { x: 0, y: 0, z: 0 } }), true);
    expect(far.events.some((e) => e.type === 'launcher_aiming')).toBe(false);
  });

  it('perder a linha de visada durante o aviso cancela o disparo', () => {
    const wall = { min: { x: -30, y: 0, z: 40 }, max: { x: 30, y: 80, z: 45 } };
    const level = levelWith(L1, [wall]);
    // começa à vista (na frente da parede), depois se esconde atrás dela
    const r = run(level, createThreats(level), 90, (t) => ({ pos: { x: 0, y: 10, z: t < 5 ? 50 : 30 }, vel: { x: 0, y: 0, z: 0 } }), true);
    expect(r.events.some((e) => e.type === 'missile_launched')).toBe(false);
  });
});

describe('Guiagem dos mísseis', () => {
  it('curva limitada: a direção gira no máximo turnRate × dt por tick', () => {
    const dir = { x: 0, y: 0, z: 1 };
    const next = turnToward(dir, { x: 1, y: 0, z: 0 }, 0.05);
    expect(Math.acos(next.z)).toBeCloseTo(0.05, 9);
    expect(turnToward(dir, normalize({ x: 0.01, y: 0, z: 1 }), 0.05)).toEqual(normalize({ x: 0.01, y: 0, z: 1 }));
  });

  it('previsão: com lead 1 mira à frente do jogador; com lead 0, na posição atual', () => {
    const chest = { x: 0, y: 10, z: 0 };
    const vel = { x: 20, y: 0, z: 0 };
    expect(aimPoint({ x: 0, y: 10, z: -40 }, chest, vel, { ...L1, lead: 0 })).toEqual(chest);
    expect(aimPoint({ x: 0, y: 10, z: -40 }, chest, vel, { ...L1, lead: 1 }).x).toBeGreaterThan(10);
  });

  it('míssil explode ao bater num prédio (dá para usar a cidade como cobertura)', () => {
    const wall = { min: { x: -30, y: 0, z: 20 }, max: { x: 30, y: 80, z: 24 } };
    const level = levelWith(L1, [wall], []);
    const th: ThreatState = { ...createThreats(level), missiles: [armed({ x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 1 }, 40)] };
    const r = run(level, th, 60, () => ({ pos: { x: 0, y: 9, z: 50 }, vel: { x: 0, y: 0, z: 0 } }));
    const boom = r.events.find((e) => e.type === 'missile_exploded');
    expect(boom && boom.type === 'missile_exploded' && boom.hitPlayer).toBe(false);
    expect(boom && boom.type === 'missile_exploded' && boom.pos.z).toBeCloseTo(20, 3);
    expect(r.hits).toBe(0);
  });

  it('acerta um jogador parado — inclusive a 57 m/s, sem "atravessar" entre ticks', () => {
    const level = levelWith(L5, [], []);
    const th: ThreatState = { ...createThreats(level), missiles: [armed({ x: 0, y: 11.2, z: -30 }, { x: 0, y: 0, z: 1 }, L5.missileSpeed)] };
    const r = run(level, th, 60, () => ({ pos: { x: 0, y: 10, z: 0 }, vel: { x: 0, y: 0, z: 0 } }));
    expect(r.hits).toBe(1);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'missile_exploded', hitPlayer: true }));
  });

  it('distância mínima contínua: segmento relativo que passa pela origem dá 0', () => {
    expect(closestApproach({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(0);
    expect(closestApproach({ x: -1, y: 2, z: 0 }, { x: 1, y: 2, z: 0 })).toBe(2);
  });

  it('depois de um acerto há invulnerabilidade; em god mode nenhum acerto vale', () => {
    const level = levelWith(L1, [], []);
    const two = [armed({ x: 0, y: 11.2, z: -20 }, { x: 0, y: 0, z: 1 }, 40), { ...armed({ x: 0, y: 11.2, z: -24 }, { x: 0, y: 0, z: 1 }, 40), id: 1 }];
    const r = run(level, { ...createThreats(level), missiles: two }, 60, () => ({ pos: { x: 0, y: 10, z: 0 }, vel: { x: 0, y: 0, z: 0 } }));
    expect(r.hits).toBe(1);
    const god = run(level, { ...createThreats(level), missiles: two }, 60, () => ({ pos: { x: 0, y: 10, z: 0 }, vel: { x: 0, y: 0, z: 0 } }), true);
    expect(god.hits).toBe(0);
  });

  it('míssil some ao fim da vida útil', () => {
    const level = levelWith(L1, [], []);
    const th: ThreatState = { ...createThreats(level), missiles: [armed({ x: 0, y: 300, z: 0 }, { x: 0, y: 1, z: 0 }, 40)] };
    const r = run(level, th, T(mc.lifetime) + 5, () => ({ pos: { x: 500, y: 10, z: 900 }, vel: { x: 0, y: 0, z: 0 } }));
    expect(r.threats.missiles).toHaveLength(0);
  });
});

describe('Desviável, e mais difícil a cada fase', () => {
  /** Míssil vindo de trás; quando está a 25 m, o jogador corta para o lado a 30 m/s. */
  function dodge(spec: ThreatSpec) {
    const level = levelWith(spec, [], []);
    const th: ThreatState = { ...createThreats(level), missiles: [armed({ x: 0, y: 11.2, z: -25 }, { x: 0, y: 0, z: 1 }, spec.missileSpeed)] };
    return run(level, th, 120, (t) => ({ pos: { x: 30 * (t / cfg.tickHz), y: 10, z: 0 }, vel: { x: 30, y: 0, z: 0 } }));
  }

  it('o míssil do L1 não acompanha uma mudança brusca de direção', () => {
    expect(dodge(L1).hits).toBe(0);
  });

  it('o míssil do L5 chega bem mais perto no mesmo desvio (mais rápido, mais ágil, com previsão)', () => {
    expect(dodge(L5).minDist).toBeLessThan(dodge(L1).minDist);
  });

  /**
   * Desvio "de toureiro" repetido: segue em frente a `fwd` m/s e, cada vez que o
   * míssil se aproxima a menos de `trig` m, corta para o lado (alternando).
   * Devolve true se escapou durante toda a vida útil do míssil.
   */
  function matador(spec: ThreatSpec, from: 'behind' | 'ahead', fwd: number, trig: number): boolean {
    const level = levelWith(spec, [], []);
    const m0 = from === 'behind' ? armed({ x: 0, y: 11.2, z: -35 }, { x: 0, y: 0, z: 1 }, spec.missileSpeed) : armed({ x: -20, y: 41.5, z: 60 }, { x: 0.5, y: -0.4, z: -1 }, spec.missileSpeed);
    let th: ThreatState = { ...createThreats(level), missiles: [m0] };
    let pos: Vec3 = { x: 0, y: 10, z: 0 };
    let vel: Vec3 = { x: 0, y: 0, z: fwd };
    let sign = 1;
    let cool = 0;
    for (let t = 1; t <= T(mc.lifetime) + 30; t++) {
      const m = th.missiles[0];
      if (!m) return true;
      const rel = sub(m.pos, chestOf(pos));
      const closing = rel.x * (m.vel.x - vel.x) + rel.y * (m.vel.y - vel.y) + rel.z * (m.vel.z - vel.z) < 0;
      if (cool-- <= 0 && closing && length(rel) < trig) {
        vel = { x: sign * fwd * 0.75, y: 0, z: fwd * 0.7 };
        sign = -sign;
        cool = 30;
      }
      const prev = pos;
      pos = { x: pos.x + vel.x / cfg.tickHz, y: 10, z: pos.z + vel.z / cfg.tickHz };
      const r = stepThreats(th, level, hover(pos, vel), prev, cfg, false);
      th = r.threats;
      if (r.hit) return false;
    }
    return true;
  }

  /** Quantas combinações (velocidade × distância de reação × origem) escapam. */
  function escapeWindow(spec: ThreatSpec): number {
    let n = 0;
    for (const fwd of [25, 32, 40]) {
      for (const trig of [4, 6, 8, 10, 12, 15]) {
        for (const from of ['behind', 'ahead'] as const) if (matador(spec, from, fwd, trig)) n++;
      }
    }
    return n;
  }

  it('em toda fase um desvio bem cronometrado escapa (de trás e de frente) — e a janela encolhe do L1 ao L5', () => {
    const windows = LEVEL_SPECS.map((s) => escapeWindow(s.threats));
    for (const s of LEVEL_SPECS) {
      expect(matador(s.threats, 'behind', 32, 6)).toBe(true);
      expect(matador(s.threats, 'ahead', 32, 10)).toBe(true);
    }
    // medido (de 36 combinações): 34, 34, 29, 21, 15
    for (let i = 1; i < windows.length; i++) expect(windows[i]).toBeLessThanOrEqual(windows[i - 1]);
    expect(windows[0]).toBeGreaterThanOrEqual(30); // L1: quase tudo escapa
    expect(windows[4]).toBeLessThanOrEqual(windows[0] / 2); // L5: menos da metade
  });

  it('no L5, devagar e de frente não dá: é preciso velocidade (impulso) para desviar', () => {
    for (const trig of [4, 6, 8, 10, 12, 15]) expect(matador(L5, 'ahead', 25, trig)).toBe(false);
  });

  it('determinismo: a mesma sequência gera os mesmos mísseis', () => {
    const level = levelWith(L5);
    const path = (t: number) => ({ pos: { x: Math.sin(t / 20) * 8, y: 12, z: 20 + t * 0.3 }, vel: { x: 0, y: 0, z: 18 } });
    expect(run(level, createThreats(level), 300, path, true).threats).toEqual(run(level, createThreats(level), 300, path, true).threats);
  });
});
