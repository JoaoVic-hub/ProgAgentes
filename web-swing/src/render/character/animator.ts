/**
 * Animador procedural — PURO (sem three.js). Escolhe o estado de animação a
 * partir do estado físico do jogador e dos eventos do frame, e faz crossfade
 * entre poses (fator exponencial 1 − e^(−k·dt), independente de FPS).
 * Também suaviza para onde o corpo está virado (yaw) e a orientação completa
 * do corpo (inclinação em direção à teia no swing), via orientation.ts.
 */

import type { GameEvent, PlayerMode } from '../../logic/types';
import {
  blendPose,
  bonkPose,
  fallPose,
  flipPose,
  idlePose,
  jumpPose,
  landPose,
  runPose,
  swingPose,
  wrapPi,
} from './pose';
import type { Pose } from './pose';
import { bodyOrientationTarget, smoothOrientation } from './orientation';
import type { Quat, V3 } from './orientation';

export type AnimState = 'idle' | 'run' | 'jump' | 'fall' | 'swing' | 'flip' | 'land' | 'bonk';

export const ANIM_STATES: readonly AnimState[] = ['idle', 'run', 'jump', 'fall', 'swing', 'flip', 'land', 'bonk'];

/** O que o animador precisa saber do jogador (montado por main.ts). */
export interface AnimInput {
  readonly mode: PlayerMode;
  readonly grounded: boolean;
  readonly vel: { readonly x: number; readonly y: number; readonly z: number };
  /** Progresso do flip em [0, 1] (interpolado entre ticks pelo main); null = sem flip. */
  readonly flipProgress: number | null;
  readonly stunTicks: number;
  /** Direção do olhar, usada para virar o corpo quando parado. */
  readonly lookYaw: number;
  /** Eventos dos ticks que rodaram neste frame. */
  readonly events: readonly GameEvent[];
  /** Peito (ponto de fixação da teia) e contato da teia, para inclinar o corpo no swing. */
  readonly chest: V3;
  readonly ropeContact: V3 | null;
}

export interface AnimatorConfig {
  readonly blendSharpness: number;
  readonly facingSharpness: number;
  readonly landDuration: number;
  /** Velocidade de queda (m/s) que produz agachamento máximo no pouso. */
  readonly hardLandingSpeed: number;
  readonly runCycleMetersPerRad: number;
  /** Fração da inclinação do corpo em direção à teia (1 = alinhado com ela). */
  readonly leanTowardRope: number;
}

export const DEFAULT_ANIMATOR: AnimatorConfig = {
  blendSharpness: 15,
  facingSharpness: 10,
  landDuration: 0.28,
  hardLandingSpeed: 25,
  runCycleMetersPerRad: 0.42,
  leanTowardRope: 0.55,
};

export interface AnimatorState {
  readonly current: AnimState;
  /** Tempo no estado atual (s). */
  readonly time: number;
  /** Pose de onde o crossfade parte (congelada na troca de estado). */
  readonly fromPose: Pose;
  /** Peso do estado atual no crossfade (0 → 1). */
  readonly weight: number;
  readonly runPhase: number;
  readonly landTimer: number;
  readonly landImpact: number;
  readonly facingYaw: number;
  /** Orientação suavizada do corpo inteiro (yaw + inclinação para a teia). */
  readonly orientation: Quat;
  /** Última pose produzida (vira fromPose na próxima troca). */
  readonly lastPose: Pose;
}

export function createAnimator(facingYaw = 0): AnimatorState {
  const p = idlePose(0);
  return {
    current: 'idle',
    time: 0,
    fromPose: p,
    weight: 1,
    runPhase: 0,
    landTimer: 0,
    landImpact: 0,
    facingYaw,
    orientation: bodyOrientationTarget(facingYaw, { x: 0, y: 0, z: 0 }, null, 0),
    lastPose: p,
  };
}

export function horizontalSpeed(v: AnimInput['vel']): number {
  return Math.hypot(v.x, v.z);
}

/** Máquina de estados de animação (prioridade de cima para baixo). */
export function selectAnimState(input: AnimInput, landTimer: number): AnimState {
  if (input.stunTicks > 0) return 'bonk';
  if (input.flipProgress !== null) return 'flip';
  if (input.mode === 'swing') return 'swing';
  if (input.grounded) {
    if (landTimer > 0) return 'land';
    return horizontalSpeed(input.vel) > 1 ? 'run' : 'idle';
  }
  return input.vel.y > 1 ? 'jump' : 'fall';
}

function poseFor(state: AnimState, st: AnimatorState, input: AnimInput, cfg: AnimatorConfig): Pose {
  switch (state) {
    case 'idle':
      return idlePose(st.time);
    case 'run':
      return runPose(st.runPhase, Math.min(horizontalSpeed(input.vel) / 11, 1));
    case 'jump':
      return jumpPose();
    case 'fall':
      return fallPose(st.time);
    case 'swing':
      return swingPose(st.time, Math.min(Math.max(-input.vel.y / 20, 0), 1));
    case 'flip':
      return flipPose(input.flipProgress ?? 0);
    case 'land':
      return landPose(st.landImpact, 1 - st.landTimer / cfg.landDuration);
    case 'bonk':
      return bonkPose(st.time);
  }
}

function approachAngle(current: number, target: number, sharpness: number, dt: number): number {
  return current + wrapPi(target - current) * (1 - Math.exp(-sharpness * dt));
}

export function updateAnimator(
  st: AnimatorState,
  input: AnimInput,
  dtSec: number,
  cfg: AnimatorConfig = DEFAULT_ANIMATOR,
): { state: AnimatorState; pose: Pose } {
  let landTimer = Math.max(0, st.landTimer - dtSec);
  let landImpact = st.landImpact;
  for (const e of input.events) {
    if (e.type === 'landed') {
      const impact = Math.min(Math.max((e.speed - 4) / (cfg.hardLandingSpeed - 4), 0), 1);
      if (impact > 0.05) {
        landTimer = cfg.landDuration;
        landImpact = impact;
      }
    }
  }

  const next = selectAnimState(input, landTimer);
  const changed = next !== st.current;
  const speed = horizontalSpeed(input.vel);
  const facingTarget = speed > 1 ? Math.atan2(input.vel.x, input.vel.z) : input.mode === 'ground' ? st.facingYaw : input.lookYaw;

  const base: AnimatorState = {
    ...st,
    current: next,
    time: changed ? 0 : st.time + dtSec,
    fromPose: changed ? st.lastPose : st.fromPose,
    weight: changed ? 0 : st.weight,
    runPhase: next === 'run' ? st.runPhase + (speed * dtSec) / cfg.runCycleMetersPerRad : st.runPhase,
    landTimer,
    landImpact,
    facingYaw: approachAngle(st.facingYaw, facingTarget, cfg.facingSharpness, dtSec),
  };
  const weight = base.weight + (1 - base.weight) * (1 - Math.exp(-cfg.blendSharpness * dtSec));
  const target = poseFor(next, base, input, cfg);
  const blended = blendPose(base.fromPose, target, weight);
  // juntas sempre com crossfade; só a rotação do corpo no flip vem crua (não pode ser amortecida)
  const pose = next === 'flip' ? { ...blended, bodyPitch: target.bodyPitch } : blended;
  const orientationTarget = bodyOrientationTarget(base.facingYaw, input.chest, input.mode === 'swing' ? input.ropeContact : null, cfg.leanTowardRope);
  const orientation = smoothOrientation(st.orientation, orientationTarget, cfg.facingSharpness, dtSec);
  return { state: { ...base, weight, orientation, lastPose: pose }, pose };
}
