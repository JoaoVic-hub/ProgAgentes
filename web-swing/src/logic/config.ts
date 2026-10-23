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
  // Impulso (redesenho da Etapa 2, ADR-022): cada acerto soma, cada erro tira; o nível
  // de impulso aumenta o teto de velocidade, o boost da soltura, o bombeio e a
  // assistência do balanço e corta o arrasto.
  momentum: {
    max: 5,
    goodQuality: 0.4,
    poorQuality: 0.15,
    gainSwing: 0.5,
    gainPerfect: 0.5,
    gainFlip: 0.5,
    lossMiss: 0.5,
    lossPoorRelease: 0.5,
    lossLateFlip: 0.25,
    lateFlipWindow: 1,
    keepOnStreet: 0.5,
    keepOnBonk: 0.4,
    keepOnHit: 0.25,
    streetGrace: 0.15,
    roofGrace: 1.2,
    idleTimeout: 3,
    idleDecay: 0.5,
    swingMaxPerLevel: 4,
    boostPerLevel: 0.2,
    assistPerLevel: 2,
    pumpPerLevel: 0.8,
    dragCutPerLevel: 0.12,
  },
  // Mísseis (ADR-023): os parâmetros da fase (velocidade, curva, previsão,
  // salva, recarga) vêm de LevelSpec.threats.
  missiles: {
    activationRange: 75,
    behindLimit: 20,
    warnTime: 0.9,
    salvoInterval: 0.18,
    lifetime: 7,
    armTime: 0.35,
    hitRadius: 1.1,
    hitStun: 0.6,
    knockback: 14,
    knockUp: 6,
    invulnerableTime: 1.5,
    maxAlive: 24,
  },
  progression: {
    countdownTime: 3,
    respawnTime: 1.2,
  },
};

/** Converte uma duração em segundos para ticks (mínimo 1 se a duração > 0). */
export function secondsToTicks(seconds: number, tickHz: number): number {
  if (seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds * tickHz));
}
