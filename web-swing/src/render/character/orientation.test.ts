import { describe, it, expect } from 'vitest';
import {
  bodyOrientationTarget,
  quatFromAxisAngle,
  quatFromUnitVectors,
  quatSlerp,
  rotateVector,
  smoothOrientation,
  IDENTITY_QUAT,
} from './orientation';

const UP = { x: 0, y: 1, z: 0 };
const FWD = { x: 0, y: 0, z: 1 };

describe('Orientação do corpo (pura)', () => {
  it('sem teia, o corpo fica em pé e virado para o yaw', () => {
    const q = bodyOrientationTarget(Math.PI / 2, { x: 0, y: 1.3, z: 0 }, null, 0.55);
    const up = rotateVector(q, UP);
    const fwd = rotateVector(q, FWD);
    expect(up.y).toBeCloseTo(1, 9);
    expect(fwd.x).toBeCloseTo(1, 9); // yaw 90° → frente para +X
  });

  it('com teia acima e à esquerda, o eixo "para cima" do corpo inclina em direção ao contato', () => {
    const chest = { x: 0, y: 1.3, z: 0 };
    const contact = { x: 10, y: 21.3, z: 0 }; // 45° para o lado +X
    const up = rotateVector(bodyOrientationTarget(0, chest, contact, 0.55), UP);
    expect(up.x).toBeGreaterThan(0.2);
    expect(up.y).toBeGreaterThan(0.6);
    // inclinação parcial (lean 0,55): não chega a alinhar com a teia
    const toContact = Math.SQRT1_2;
    expect(up.x).toBeLessThan(toContact);
  });

  it('quatFromUnitVectors leva um vetor no outro, inclusive opostos', () => {
    const q = quatFromUnitVectors(UP, FWD);
    const r = rotateVector(q, UP);
    expect(r.z).toBeCloseTo(1, 9);
    const opposite = rotateVector(quatFromUnitVectors(UP, { x: 0, y: -1, z: 0 }), UP);
    expect(opposite.y).toBeCloseTo(-1, 9);
  });

  it('slerp nos extremos devolve as pontas e a suavização converge', () => {
    const a = IDENTITY_QUAT;
    const b = quatFromAxisAngle(UP, 1.2);
    expect(quatSlerp(a, b, 0)).toEqual(a);
    quatSlerp(a, b, 1).forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
    let q = a;
    for (let i = 0; i < 120; i++) q = smoothOrientation(q, b, 10, 1 / 60);
    q.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
  });
});
