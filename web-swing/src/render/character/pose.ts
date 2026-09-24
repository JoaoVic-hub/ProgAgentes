/**
 * Poses procedurais do boneco — funções PURAS (sem three.js), testáveis em
 * Node. Uma pose é um conjunto de ângulos de junta (Euler X/Y/Z, radianos)
 * mais deslocamentos do corpo inteiro.
 *
 * Convenção (boneco olhando para +Z, membros apontando para baixo):
 *  - rotação X positiva gira +Y em direção a +Z e −Y em direção a −Z;
 *    ⇒ coluna inclina para a frente com X > 0; perna/braço vai para a
 *    frente com X < 0; joelho dobra (canela para trás) com X > 0;
 *    cotovelo dobra (antebraço para a frente) com X < 0.
 *  - rotação Z positiva abre o braço esquerdo para o lado; o direito abre com Z < 0.
 */

export const JOINTS = [
  'spine', 'neck',
  'shoulderL', 'elbowL', 'shoulderR', 'elbowR',
  'hipL', 'kneeL', 'hipR', 'kneeR',
] as const;

export type JointName = (typeof JOINTS)[number];
export type Euler3 = readonly [number, number, number];

export interface Pose {
  readonly joints: Readonly<Record<JointName, Euler3>>;
  /** Deslocamento vertical do quadril (agachar / quicar), em metros. */
  readonly hipsOffsetY: number;
  /** Rotação do corpo inteiro em torno do eixo lateral (flip), radianos. */
  readonly bodyPitch: number;
}

const Z3: Euler3 = [0, 0, 0];

function pose(partial: Partial<Record<JointName, Euler3>>, hipsOffsetY = 0, bodyPitch = 0): Pose {
  const joints = {} as Record<JointName, Euler3>;
  for (const j of JOINTS) joints[j] = partial[j] ?? Z3;
  return { joints, hipsOffsetY, bodyPitch };
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

export function idlePose(t: number): Pose {
  const breathe = Math.sin(t * 2.2) * 0.03;
  return pose({
    spine: [0.04 + breathe, 0, 0],
    neck: [-breathe, 0, 0],
    shoulderL: [0.05, 0, 0.14],
    shoulderR: [0.05, 0, -0.14],
    elbowL: [-0.2, 0, 0],
    elbowR: [-0.2, 0, 0],
    kneeL: [0.05, 0, 0],
    kneeR: [0.05, 0, 0],
  }, breathe * 0.2);
}

/** Corrida: phase em radianos (um ciclo = 2π), speed01 ∈ [0, 1]. */
export function runPose(phase: number, speed01: number): Pose {
  const s = clamp01(speed01);
  const a = 0.45 + 0.45 * s;
  const sin = Math.sin(phase);
  const kneeL = 0.25 + 1.1 * s * (0.5 - 0.5 * Math.cos(phase));
  const kneeR = 0.25 + 1.1 * s * (0.5 + 0.5 * Math.cos(phase));
  return pose({
    spine: [0.12 + 0.18 * s, 0, 0],
    neck: [-0.1 - 0.1 * s, 0, 0],
    hipL: [-a * sin, 0, 0],
    hipR: [a * sin, 0, 0],
    kneeL: [kneeL, 0, 0],
    kneeR: [kneeR, 0, 0],
    shoulderL: [a * 0.9 * sin, 0, 0.1],
    shoulderR: [-a * 0.9 * sin, 0, -0.1],
    elbowL: [-1.1, 0, 0],
    elbowR: [-1.1, 0, 0],
  }, -0.04 * s * Math.abs(Math.cos(phase)));
}

/** Subindo depois do pulo: pernas encolhidas, braços para cima. */
export function jumpPose(): Pose {
  return pose({
    spine: [0.1, 0, 0],
    hipL: [-0.7, 0, 0.05],
    kneeL: [1.1, 0, 0],
    hipR: [-0.25, 0, -0.05],
    kneeR: [0.5, 0, 0],
    shoulderL: [-2.5, 0, 0.3],
    shoulderR: [-2.7, 0, -0.3],
    elbowL: [-0.3, 0, 0],
    elbowR: [-0.3, 0, 0],
  });
}

/** Caindo: braços abertos, pernas pedalando de leve. */
export function fallPose(t: number): Pose {
  const w = Math.sin(t * 7);
  return pose({
    spine: [0.2, 0, 0],
    neck: [-0.25, 0, 0],
    shoulderL: [-0.3, 0, 1.3 + 0.15 * w],
    shoulderR: [-0.3, 0, -1.3 - 0.15 * w],
    elbowL: [-0.4, 0, 0],
    elbowR: [-0.4, 0, 0],
    hipL: [-0.35 * w - 0.2, 0, 0.12],
    hipR: [0.35 * w - 0.2, 0, -0.12],
    kneeL: [0.6 + 0.3 * w, 0, 0],
    kneeR: [0.6 - 0.3 * w, 0, 0],
  });
}

/**
 * Balançando: braço direito para cima (o rig o aponta exatamente para a
 * âncora), esquerdo para trás, pernas juntas arrastando. descent01 = quanto
 * está descendo (pernas mais para trás na descida).
 */
export function swingPose(t: number, descent01: number): Pose {
  const d = clamp01(descent01);
  const sway = Math.sin(t * 3) * 0.05;
  return pose({
    spine: [-0.15 + 0.1 * d, 0, 0],
    neck: [0.1, 0, 0],
    shoulderR: [-2.9, 0, -0.15],
    elbowR: [-0.1, 0, 0],
    shoulderL: [0.6 + 0.3 * d, 0, 0.5],
    elbowL: [-0.5, 0, 0],
    hipL: [0.15 + 0.35 * d + sway, 0, 0.05],
    hipR: [0.3 + 0.35 * d - sway, 0, -0.05],
    kneeL: [0.35 + 0.3 * d, 0, 0],
    kneeR: [0.55 + 0.3 * d, 0, 0],
  });
}

/** Flip: grupado (joelhos no peito) e o corpo inteiro dá uma volta para a frente. */
export function flipPose(progress: number): Pose {
  const p = clamp01(progress);
  // ease in-out: começa e termina mais devagar
  const eased = p * p * (3 - 2 * p);
  const tuck = Math.sin(Math.PI * p);
  return pose({
    spine: [0.5 * tuck, 0, 0],
    neck: [0.4 * tuck, 0, 0],
    hipL: [-1.7 * tuck, 0, 0.1],
    hipR: [-1.7 * tuck, 0, -0.1],
    kneeL: [2.2 * tuck, 0, 0],
    kneeR: [2.2 * tuck, 0, 0],
    shoulderL: [-0.9 * tuck, 0, 0.3],
    shoulderR: [-0.9 * tuck, 0, -0.3],
    elbowL: [-1.5 * tuck, 0, 0],
    elbowR: [-1.5 * tuck, 0, 0],
  }, 0.15 * tuck, Math.PI * 2 * eased);
}

/** Pouso: agacha proporcional ao impacto e volta (t01: 0 = contato, 1 = recuperado). */
export function landPose(impact01: number, t01: number): Pose {
  const k = clamp01(impact01) * (1 - clamp01(t01)) ** 2;
  return pose({
    spine: [0.45 * k, 0, 0],
    neck: [-0.3 * k, 0, 0],
    hipL: [-0.9 * k, 0, 0.08],
    hipR: [-0.9 * k, 0, -0.08],
    kneeL: [1.6 * k, 0, 0],
    kneeR: [1.6 * k, 0, 0],
    shoulderL: [-0.8 * k, 0, 0.35],
    shoulderR: [-0.8 * k, 0, -0.35],
    elbowL: [-0.6 * k, 0, 0],
    elbowR: [-0.6 * k, 0, 0],
  }, -0.4 * k);
}

/** Bonk (bateu na parede): cabeça para trás, braços se debatendo. */
export function bonkPose(t: number): Pose {
  const w = Math.sin(t * 18);
  return pose({
    spine: [-0.45, 0, 0.1 * w],
    neck: [-0.4, 0, 0],
    shoulderL: [-0.6, 0, 1.7 + 0.3 * w],
    shoulderR: [-0.6, 0, -1.7 + 0.3 * w],
    elbowL: [-0.8, 0, 0],
    elbowR: [-0.8, 0, 0],
    hipL: [-0.3, 0, 0.2],
    hipR: [0.2, 0, -0.2],
    kneeL: [0.8, 0, 0],
    kneeR: [0.4, 0, 0],
  });
}

/** Interpolação linear entre poses (t = 0 → a, t = 1 → b). */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const joints = {} as Record<JointName, Euler3>;
  for (const j of JOINTS) {
    const ja = a.joints[j];
    const jb = b.joints[j];
    joints[j] = [ja[0] + (jb[0] - ja[0]) * t, ja[1] + (jb[1] - ja[1]) * t, ja[2] + (jb[2] - ja[2]) * t];
  }
  // menor caminho angular: sair do flip (2π) para 0 não pode "desgirar" o corpo
  const dp = wrapPi(b.bodyPitch - a.bodyPitch);
  return {
    joints,
    hipsOffsetY: a.hipsOffsetY + (b.hipsOffsetY - a.hipsOffsetY) * t,
    bodyPitch: a.bodyPitch + dp * t,
  };
}

/** Ângulo equivalente em [−π, π). */
export function wrapPi(a: number): number {
  const TWO_PI = Math.PI * 2;
  return a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
}
