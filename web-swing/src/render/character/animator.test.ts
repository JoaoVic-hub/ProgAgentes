import { describe, it, expect } from 'vitest';
import { createAnimator, selectAnimState, updateAnimator, ANIM_STATES } from './animator';
import type { AnimInput, AnimState } from './animator';
import {
  blendPose,
  bonkPose,
  fallPose,
  flipPose,
  idlePose,
  jumpPose,
  JOINTS,
  landPose,
  runPose,
  swingPose,
} from './pose';
import type { Pose } from './pose';

const REST: AnimInput = {
  mode: 'ground',
  grounded: true,
  vel: { x: 0, y: 0, z: 0 },
  flipProgress: null,
  stunTicks: 0,
  lookYaw: 0,
  events: [],
  chest: { x: 0, y: 1.3, z: 0 },
  ropeContact: null,
};

function allPoses(): Pose[] {
  const out: Pose[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    out.push(idlePose(t * 5), runPose(t * Math.PI * 2, t), jumpPose(), fallPose(t * 3), swingPose(t * 2, t), flipPose(t), landPose(t, t), bonkPose(t));
  }
  return out;
}

function flat(p: Pose): number[] {
  return [...JOINTS.flatMap((j) => [...p.joints[j]]), p.hipsOffsetY, p.bodyPitch];
}

describe('Poses procedurais (1D)', () => {
  it('a corrida é periódica (fase + 2π repete a pose)', () => {
    for (const phase of [0, 0.7, 2.1, 4.4]) {
      const a = flat(runPose(phase, 0.8));
      const b = flat(runPose(phase + Math.PI * 2, 0.8));
      a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 9));
    }
  });

  it('joelho nunca dobra ao contrário (ângulo X ≥ 0) em nenhuma pose', () => {
    for (const p of allPoses()) {
      expect(p.joints.kneeL[0]).toBeGreaterThanOrEqual(0);
      expect(p.joints.kneeR[0]).toBeGreaterThanOrEqual(0);
    }
  });

  it('nenhuma pose tem NaN, inclusive com velocidade zero', () => {
    for (const p of allPoses()) for (const v of flat(p)) expect(Number.isFinite(v)).toBe(true);
    const { pose } = updateAnimator(createAnimator(), REST, 1 / 60);
    for (const v of flat(pose)) expect(Number.isFinite(v)).toBe(true);
  });

  it('blend(a, b, 0) = a e blend(a, b, 1) = b', () => {
    const a = runPose(1.2, 0.7);
    const b = swingPose(0.5, 0.3);
    expect(flat(blendPose(a, b, 0))).toEqual(flat(a));
    flat(blendPose(a, b, 1)).forEach((v, i) => expect(v).toBeCloseTo(flat(b)[i], 12));
  });

  it('sair do flip (corpo em 2π) para outra pose não gira o corpo para trás', () => {
    const endOfFlip = flipPose(1);
    const mid = blendPose(endOfFlip, fallPose(0), 0.5);
    // 2π e 0 são o mesmo ângulo: o meio do caminho deve continuar ≡ 0 (mod 2π)
    expect(Math.cos(mid.bodyPitch)).toBeCloseTo(1, 9);
  });
});

describe('Máquina de estados de animação (1D)', () => {
  const pick = (over: Partial<AnimInput>, landTimer = 0): AnimState => selectAnimState({ ...REST, ...over }, landTimer);

  it('escolhe o estado pelo estado físico', () => {
    expect(pick({})).toBe('idle');
    expect(pick({ vel: { x: 0, y: 0, z: 8 } })).toBe('run');
    expect(pick({ mode: 'air', grounded: false, vel: { x: 0, y: 5, z: 0 } })).toBe('jump');
    expect(pick({ mode: 'air', grounded: false, vel: { x: 0, y: -5, z: 0 } })).toBe('fall');
    expect(pick({ mode: 'swing', grounded: false })).toBe('swing');
    expect(pick({ mode: 'air', grounded: false, flipProgress: 0.3 })).toBe('flip');
    expect(pick({ stunTicks: 5, mode: 'swing' })).toBe('bonk');
  });

  it('pouso só depois do evento landed (e só se o impacto for relevante)', () => {
    let st = createAnimator();
    st = updateAnimator(st, REST, 1 / 60).state;
    expect(st.current).toBe('idle');
    st = updateAnimator(st, { ...REST, events: [{ type: 'landed', speed: 20, kind: 'roof' }] }, 1 / 60).state;
    expect(st.current).toBe('land');
    let soft = createAnimator();
    soft = updateAnimator(soft, { ...REST, events: [{ type: 'landed', speed: 3, kind: 'street' }] }, 1 / 60).state;
    expect(soft.current).toBe('idle');
  });

  it('o pouso termina e volta para idle', () => {
    let st = createAnimator();
    st = updateAnimator(st, { ...REST, events: [{ type: 'landed', speed: 30, kind: 'roof' }] }, 1 / 60).state;
    for (let i = 0; i < 60; i++) st = updateAnimator(st, REST, 1 / 60).state;
    expect(st.current).toBe('idle');
  });

  it('o corpo vira para a direção do movimento', () => {
    let st = createAnimator(0);
    for (let i = 0; i < 120; i++) st = updateAnimator(st, { ...REST, vel: { x: 8, y: 0, z: 0 } }, 1 / 60).state;
    expect(st.facingYaw).toBeCloseTo(Math.PI / 2, 3);
  });

  it('entrada do flip tem crossfade: no 1º frame nenhuma junta salta mais de 0,6 rad (revisão)', () => {
    let st = createAnimator();
    const jumping: AnimInput = { ...REST, mode: 'air', grounded: false, vel: { x: 0, y: 6, z: 12 } };
    for (let i = 0; i < 30; i++) st = updateAnimator(st, jumping, 1 / 60).state;
    const before = st.lastPose;
    const { pose } = updateAnimator(st, { ...jumping, flipProgress: 1 / 30 }, 1 / 60);
    for (const j of JOINTS) {
      for (let k = 0; k < 3; k++) expect(Math.abs(pose.joints[j][k] - before.joints[j][k])).toBeLessThan(0.6);
    }
  });

  it('todos os estados listados são alcançáveis', () => {
    const seen = new Set<AnimState>([
      pick({}), pick({ vel: { x: 0, y: 0, z: 8 } }), pick({ mode: 'air', grounded: false, vel: { x: 0, y: 5, z: 0 } }),
      pick({ mode: 'air', grounded: false, vel: { x: 0, y: -5, z: 0 } }), pick({ mode: 'swing', grounded: false }),
      pick({ flipProgress: 0.5, mode: 'air', grounded: false }), pick({}, 0.1), pick({ stunTicks: 2 }),
    ]);
    expect([...seen].sort()).toEqual([...ANIM_STATES].sort());
  });
});
