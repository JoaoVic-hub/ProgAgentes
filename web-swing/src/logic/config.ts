/**
 * Tuning padrão do jogo. Ajustável ao vivo pelo lil-gui (F2, só em DEV);
 * "Copiar JSON" no painel gera um objeto para colar aqui.
 * Unidades: metros, segundos, m/s, m/s². Durações em segundos.
 */

import type { GameConfig } from './types';

export const DEFAULT_GAME_CONFIG: GameConfig = {
  tickHz: 60,
  physics: {
    gravity: 25,
    runMax: 11,
    runAccel: 60,
    runDecel: 45,
    airAccel: 8,
    airMaxSpeed: 12,
    airDragQuad: 0.007,
    terminalFall: 50,
    maxSpeed: 60,
    jumpSpeed: 11,
    coyoteTime: 0.1,
    jumpBufferTime: 0.12,
    halfWidth: 0.35,
    height: 1.8,
    bonkSpeed: 22,
    bonkStunTime: 0.4,
    bonkKeep: 0.5,
    ledgeAssist: 1.2,
    maxSubstep: 0.3,
  },
  web: {
    maxRange: 60,
    minRope: 4,
    minAnchorAbove: 2.5,
    attachHeight: 1.3,
    streetClearance: 2.1,
    autoReel: 6,
    groundReel: 14,
    reelRampTime: 0.15,
    steer: 8,
    pump: 2,
    swingAssist: 0.8,
    brake: 6,
    swingMaxSpeed: 36,
    impulse: 6,
    releaseMinSpeed: 8,
    releaseBoostMin: 1,
    releaseBoostMax: 3,
    releaseUpBoost: 2,
    releaseIdealAngleDeg: 35,
    releaseAngleToleranceDeg: 30,
    perfectQuality: 0.8,
    autoReleaseAboveAnchor: 1,
    wallReleaseTime: 0.5,
    flipWindowTime: 0.4,
    flipDuration: 0.5,
    flipUpSpeed: 5,
    flipForwardBoost: 3,
    ropeSubsteps: 4,
    lateralPull: 0.8,
    groundAttachHop: 5,
    minSwingTime: 0.35,
    reelSlowdown: 4,
  },
  aim: {
    snapToTop: 10,
    assistEnabled: true,
    coneDeg: 8,
    fallbackConeDeg: 20,
    preferredDistance: 28,
    hysteresisDeg: 3,
    switchImprovement: 0.2,
    bufferTime: 0.15,
    maxBehindDeg: 100,
  },
  rig: {
    pivotHeight: 1.6,
    shoulderOffset: 0.6,
    pitchMinDeg: -65,
    pitchMaxDeg: 75,
  },
  // Plano §2. Os limiares de velocidade foram adaptados de 28/40 para 26/34 m/s:
  // depois do retuning da Etapa 1 (ADR-016) o teto no balanço é 36 m/s, e com
  // 40 m/s o bônus cheio só existiria em queda livre (ADR-017).
  scoring: {
    ringBase: 100,
    goldRingBase: 400,
    ringSlack: 0.4,
    speedBonusHalf: 26,
    speedBonusFull: 34,
    chainPerStep: 4,
    multiplierStep: 0.5,
    maxMultiplier: 5,
    swingPoints: 10,
    swingMinSpeed: 10,
    perfectPoints: 50,
    flipPoints: 100,
    flipAfterPerfectPoints: 200,
    speedStreakSpeed: 26,
    speedStreakTime: 2,
    speedStreakPoints: 40,
    comboTimeout: 3,
    streetGrace: 0.15,
    roofGrace: 1.2,
    allRingsBonus: 1000,
    noStreetBonus: 500,
    twoStarRingRatio: 0.75,
  },
  progression: {
    lives: 3,
    countdownTime: 3,
    respawnTime: 1.2,
  },
};

/** Converte uma duração em segundos para ticks (mínimo 1 se a duração > 0). */
export function secondsToTicks(seconds: number, tickHz: number): number {
  if (seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds * tickHz));
}
