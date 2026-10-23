import { describe, it, expect } from 'vitest';
import { RADAR_MISSILE_RANGE, screenBearing, threatRadar } from './threat-radar';
import { interpolateMissiles } from './frame';
import { DEFAULT_GAME_CONFIG } from '../logic/config';
import { sandboxState } from '../logic/progression';
import { makeTestLevel } from '../logic/testing';
import type { GameState, Launcher, Missile } from '../logic/types';

const cfg = DEFAULT_GAME_CONFIG;
const LAUNCHER: Launcher = { id: 0, pos: { x: -20, y: 41.5, z: 60 }, side: -1, solidId: 0 };

function withThreats(missiles: Missile[], launcherPhase: 'idle' | 'aiming' | 'firing' = 'idle', ticks = 0): GameState {
  const s = sandboxState(makeTestLevel([], { launchers: [LAUNCHER] }), cfg);
  return {
    ...s,
    player: { ...s.player, pos: { x: 0, y: 10, z: 0 }, vel: { x: 0, y: 0, z: 0 } },
    threats: { ...s.threats, missiles, launchers: [{ phase: launcherPhase, ticks, shotsLeft: 0 }] },
  };
}

const missile = (id: number, x: number, z: number, vz = 0): Missile => ({ id, pos: { x, y: 11.2, z }, vel: { x: 0, y: 0, z: vz }, ageTicks: 60, launcherId: 0 });

describe('Radar de ameaças', () => {
  it('ângulo na tela: à frente 0, direita +90°, esquerda −90°, atrás ±180° (câmera em yaw 0 olha para +z)', () => {
    const o = { x: 0, y: 0, z: 0 };
    expect(screenBearing(o, { x: 0, y: 0, z: 10 }, 0)).toBeCloseTo(0, 9);
    expect(screenBearing(o, { x: -10, y: 0, z: 0 }, 0)).toBeCloseTo(Math.PI / 2, 9); // −x é a direita da tela
    expect(screenBearing(o, { x: 10, y: 0, z: 0 }, 0)).toBeCloseTo(-Math.PI / 2, 9);
    expect(Math.abs(screenBearing(o, { x: 0, y: 0, z: -10 }, 0))).toBeCloseTo(Math.PI, 9);
    // girando a câmera 90° para a esquerda (+x), o que estava à esquerda fica à frente
    expect(screenBearing(o, { x: 10, y: 0, z: 0 }, Math.PI / 2)).toBeCloseTo(0, 9);
  });

  it('míssil perto e se aproximando é mais urgente que longe ou se afastando; fora do alcance some', () => {
    const blips = threatRadar(withThreats([missile(1, 0, -10, 40), missile(2, 0, -60, 40), missile(3, 0, -10, -40), missile(4, 0, -RADAR_MISSILE_RANGE - 5, 40)]), 0, cfg);
    const u = (key: string) => blips.find((b) => b.key === key)?.urgency ?? -1;
    expect(u('m1')).toBeGreaterThan(u('m2'));
    expect(u('m1')).toBeGreaterThan(u('m3'));
    expect(u('m4')).toBe(-1);
    expect(blips.find((b) => b.key === 'm1')?.kind).toBe('missile');
  });

  it('lançador só aparece mirando (urgência cresce com o aviso) ou disparando (1)', () => {
    expect(threatRadar(withThreats([], 'idle'), 0, cfg)).toEqual([]);
    const early = threatRadar(withThreats([], 'aiming', 5), 0, cfg)[0];
    const late = threatRadar(withThreats([], 'aiming', 40), 0, cfg)[0];
    expect(early.kind).toBe('launcher');
    expect(late.urgency).toBeGreaterThan(early.urgency);
    expect(threatRadar(withThreats([], 'firing'), 0, cfg)[0].urgency).toBe(1);
  });

  it('fora da fase playing o radar fica vazio', () => {
    expect(threatRadar({ ...withThreats([missile(1, 0, -10, 40)]), phase: 'respawning' }, 0, cfg)).toEqual([]);
  });
});

describe('Interpolação de mísseis', () => {
  it('interpola por id; recém-nascidos e teleportes vão direto ao atual', () => {
    const prev = [missile(1, 0, 0), missile(2, 0, 0)];
    const curr = [missile(1, 0, 1), missile(2, 0, 50), missile(3, 0, 7)];
    const r = interpolateMissiles(prev, curr, 0.25);
    expect(r.map((m) => m.pos.z)).toEqual([0.25, 50, 7]);
  });
});
