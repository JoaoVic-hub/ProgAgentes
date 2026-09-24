import { describe, it, expect } from 'vitest';
import { cameraArmLength, createCameraFollow, DEFAULT_CAMERA_FOLLOW, updateCameraFollow } from './camera-follow';
import { interpolatePlayer } from './frame';
import { DEFAULT_GAME_CONFIG } from '../logic/config';
import { createPlayer } from '../logic/engine';
import { makeTestLevel } from '../logic/testing';
import { pointInBox } from '../logic/math/geom';

const rig = DEFAULT_GAME_CONFIG.rig;
const still = { feet: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 };

describe('Câmera que segue o jogador', () => {
  it('sem obstáculos, fica na distância mínima atrás do pivô', () => {
    const level = makeTestLevel([]);
    let st = createCameraFollow(level, still, rig);
    let pose = updateCameraFollow(st, still, level, rig, 1 / 60).pose;
    for (let i = 0; i < 120; i++) ({ state: st, pose } = updateCameraFollow(st, still, level, rig, 1 / 60));
    expect(pose.position.z).toBeCloseTo(-DEFAULT_CAMERA_FOLLOW.distanceMin, 3);
  });

  it('câmera é puxada para a frente de um prédio logo atrás do jogador', () => {
    const level = makeTestLevel([{ min: { x: -20, y: 0, z: -10 }, max: { x: 20, y: 50, z: -3 } }]);
    const arm = cameraArmLength(level, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 }, 5.5, DEFAULT_CAMERA_FOLLOW);
    expect(arm).toBeCloseTo(3 - DEFAULT_CAMERA_FOLLOW.collisionMargin, 9);
    let st = createCameraFollow(level, still, rig);
    let pose = updateCameraFollow(st, still, level, rig, 1 / 60).pose;
    for (let i = 0; i < 60; i++) ({ state: st, pose } = updateCameraFollow(st, still, level, rig, 1 / 60));
    expect(pose.position.z).toBeGreaterThan(-3);
  });

  it('distância e FOV aumentam com a velocidade', () => {
    const level = makeTestLevel([]);
    const fast = { ...still, vel: { x: 0, y: 0, z: 45 } };
    let st = createCameraFollow(level, fast, rig);
    let pose = updateCameraFollow(st, fast, level, rig, 1 / 60).pose;
    for (let i = 0; i < 300; i++) ({ state: st, pose } = updateCameraFollow(st, fast, level, rig, 1 / 60));
    expect(st.distance).toBeCloseTo(DEFAULT_CAMERA_FOLLOW.distanceMax, 2);
    expect(pose.fov).toBeCloseTo(DEFAULT_CAMERA_FOLLOW.fovBase + DEFAULT_CAMERA_FOLLOW.fovBoost, 2);
  });

  it('com velocidade constante, o pivô suavizado não fica para trás do pivô lógico (feed-forward)', () => {
    const level = makeTestLevel([]);
    for (const fps of [30, 60, 144]) {
      const v = 30;
      let st = createCameraFollow(level, still, rig);
      let feet = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < fps * 2; i++) {
        feet = { x: 0, y: 0, z: feet.z + v / fps };
        st = updateCameraFollow(st, { ...still, feet, vel: { x: 0, y: 0, z: v } }, level, rig, 1 / fps).state;
      }
      expect(Math.abs(st.pivot.z - feet.z)).toBeLessThan(0.01);
    }
  });

  it('parede a 0,5 m atrás: a câmera fica na frente dela, nunca dentro', () => {
    const level = makeTestLevel([{ min: { x: -20, y: 0, z: -10 }, max: { x: 20, y: 50, z: -0.85 } }]);
    let st = createCameraFollow(level, still, rig);
    let pose = updateCameraFollow(st, still, level, rig, 1 / 60).pose;
    for (let i = 0; i < 60; i++) ({ state: st, pose } = updateCameraFollow(st, still, level, rig, 1 / 60));
    expect(level.solids.some((s) => pointInBox(pose.position, s.box))).toBe(false);
  });

  it('ombro encostado numa fachada: nem o pivô nem a câmera entram no prédio', () => {
    // olhando para +Z, a direita é −X: fachada em x = −14 encostada no lado do ombro
    const level = makeTestLevel([{ min: { x: -40, y: 0, z: -50 }, max: { x: -14, y: 50, z: 50 } }]);
    const beside = { ...still, feet: { x: -13.65, y: 0, z: 0 } };
    let st = createCameraFollow(level, beside, rig);
    let pose = updateCameraFollow(st, beside, level, rig, 1 / 60).pose;
    for (let i = 0; i < 60; i++) ({ state: st, pose } = updateCameraFollow(st, beside, level, rig, 1 / 60));
    expect(level.solids.some((s) => pointInBox(st.pivot, s.box))).toBe(false);
    expect(level.solids.some((s) => pointInBox(pose.position, s.box))).toBe(false);
  });

  it('suavização independe do FPS (30 vs 144 frames por segundo chegam ao mesmo lugar)', () => {
    const level = makeTestLevel([]);
    const moved = { ...still, feet: { x: 0, y: 0, z: 10 } };
    const run = (fps: number) => {
      let st = createCameraFollow(level, still, rig);
      for (let i = 0; i < fps / 2; i++) st = updateCameraFollow(st, moved, level, rig, 1 / fps).state;
      return st.pivot.z;
    };
    expect(run(30)).toBeCloseTo(run(144), 6);
  });
});

describe('Interpolação de render', () => {
  it('interpola a posição pelo alpha e não interpola teleportes', () => {
    const a = createPlayer({ x: 0, y: 0, z: 0 });
    const b = { ...a, pos: { x: 0, y: 0, z: 1 } };
    expect(interpolatePlayer(a, b, 0.25).feet.z).toBeCloseTo(0.25, 12);
    const far = { ...a, pos: { x: 0, y: 0, z: 50 } };
    expect(interpolatePlayer(a, far, 0.25).feet.z).toBe(50);
  });
});
