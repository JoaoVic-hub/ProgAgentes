/**
 * Motor do jogo: step(state, input) → novo estado (puro e determinístico).
 *
 * Ordem do tick:
 *  1. look (yaw/pitch do input)       6. forças (chão / ar / swing)
 *  2. timers                          7. limites de velocidade
 *  3. mira (câmera lógica)            8. auto-reel + projeção da corda
 *  4. teia: soltar / anexar / buffer  9. colisão com subpassos (vence a corda)
 *  5. pulo / impulso / flip          10. pouso, bonk, parede, modo, eventos
 */

import type { GameConfig, GameEvent, GameState, InputFrame, Level, Player, ReleaseReason, Rope, SessionStats } from './types';
import type { Vec3 } from './math/vec3';
import { DEFAULT_GAME_CONFIG, secondsToTicks } from './config';
import { clampPitch } from './camera-rig';
import { computeAim, NO_AIM } from './aim';
import { moveAndCollide } from './player/collision';
import { airControl, applyDrag, applyGravity, clampSpeed, groundMove, limitFall, wishDirection } from './player/physics';
import {
  attachPoint,
  createRope,
  flipBoost,
  integrateRope,
  releaseBoost,
  releaseQuality,
  ropeImpulse,
  swingForces,
} from './player/web';

export const NEUTRAL_INPUT: InputFrame = {
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  webHeld: false,
  jumpPressed: false,
};

export function createPlayer(start: Vec3, yaw = 0, pitch = 0): Player {
  return {
    pos: start,
    vel: { x: 0, y: 0, z: 0 },
    mode: 'ground',
    grounded: true,
    groundKind: 'street',
    rope: null,
    yaw,
    pitch,
    coyoteTicks: 0,
    jumpBufferTicks: 0,
    webBufferTicks: 0,
    flipWindowTicks: 0,
    flipTicks: 0,
    flipAvailable: false,
    lastReleasePerfect: false,
    stunTicks: 0,
    wallTicks: 0,
    airTicks: 0,
    prevWebHeld: false,
  };
}

export function createGame(level: Level, config: GameConfig = DEFAULT_GAME_CONFIG): GameState {
  const player = createPlayer(level.start);
  return {
    config,
    level,
    tick: 0,
    player,
    aim: computeAim(level, player, NO_AIM, config),
    events: [],
    stats: { webShots: 0, webMisses: 0 },
  };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function step(state: GameState, input: InputFrame): GameState {
  const { config: cfg, level } = state;
  const dt = 1 / cfg.tickHz;
  const T = (seconds: number) => secondsToTicks(seconds, cfg.tickHz);
  const events: GameEvent[] = [];
  const stats: Mutable<SessionStats> = { ...state.stats };
  const prev = state.player;

  // 1–2. look e timers
  const p: Mutable<Player> = {
    ...prev,
    yaw: input.yaw,
    pitch: clampPitch(input.pitch, cfg.rig),
    coyoteTicks: prev.grounded ? T(cfg.physics.coyoteTime) : Math.max(0, prev.coyoteTicks - 1),
    jumpBufferTicks: Math.max(0, prev.jumpBufferTicks - 1),
    flipWindowTicks: Math.max(0, prev.flipWindowTicks - 1),
    flipTicks: Math.max(0, prev.flipTicks - 1),
    stunTicks: Math.max(0, prev.stunTicks - 1),
  };
  const stunned = p.stunTicks > 0;
  const moveX = stunned ? 0 : input.moveX;
  const moveZ = stunned ? 0 : input.moveZ;
  let vel = p.vel;
  let rope: Rope | null = p.rope;

  // 3. mira
  const aim = computeAim(level, p, state.aim, cfg);

  // 4. teia — soltura (manual ou automática)
  if (rope) {
    const attach = attachPoint(p.pos, cfg.web);
    const aboveAnchor = attach.y > rope.anchor.y + cfg.web.autoReleaseAboveAnchor;
    const pinnedToWall = p.wallTicks >= T(cfg.web.wallReleaseTime);
    const reason: ReleaseReason | null = !input.webHeld ? 'manual' : aboveAnchor ? 'above' : pinnedToWall ? 'wall' : null;
    if (reason) {
      // teia de poucos ticks (spam de cliques) não rende boost nem flip
      const fullSwing = rope.heldTicks >= T(cfg.web.minSwingTime);
      const r = fullSwing ? releaseBoost(vel, cfg.web) : { vel, quality: releaseQuality(vel, cfg.web), perfect: false };
      vel = r.vel;
      events.push({
        type: 'web_released',
        quality: r.quality,
        perfect: r.perfect,
        speed: Math.hypot(vel.x, vel.y, vel.z),
        reason,
        auto: reason !== 'manual',
        fullSwing,
      });
      rope = null;
      // flip só logo após soltar NO AR depois de um swing de verdade
      const flipOk = fullSwing && !prev.grounded;
      p.flipWindowTicks = flipOk ? T(cfg.web.flipWindowTime) : 0;
      p.flipAvailable = flipOk;
      p.lastReleasePerfect = r.perfect;
      p.wallTicks = 0;
    }
  }

  // 4b. teia — anexo, com buffer de clique quando ainda não há alvo
  const webPressed = input.webHeld && !prev.prevWebHeld;
  if (stunned) {
    p.webBufferTicks = 0;
  } else if (!rope) {
    const pending = prev.webBufferTicks > 0 && input.webHeld && !webPressed;
    if ((webPressed || pending) && aim.point && aim.solidId !== null) {
      if (webPressed) stats.webShots++;
      rope = createRope(aim.point, aim.solidId, p.pos, cfg.web, prev.grounded);
      // do chão: pulinho junto com o puxão, para o primeiro arco não raspar a rua
      if (prev.grounded) vel = { x: vel.x, y: Math.max(vel.y, cfg.web.groundAttachHop), z: vel.z };
      events.push({ type: 'web_attached', anchor: aim.point, source: aim.source });
      p.webBufferTicks = 0;
      p.flipWindowTicks = 0;
      p.flipTicks = 0;
    } else if (webPressed) {
      stats.webShots++;
      const buffer = T(cfg.aim.bufferTime);
      if (buffer > 0) {
        p.webBufferTicks = buffer;
      } else {
        stats.webMisses++;
        events.push({ type: 'web_missed' });
      }
    } else if (pending) {
      p.webBufferTicks = prev.webBufferTicks - 1;
      if (p.webBufferTicks === 0) {
        stats.webMisses++;
        events.push({ type: 'web_missed' });
      }
    } else if (prev.webBufferTicks > 0) {
      // soltou o botão antes de aparecer um alvo
      p.webBufferTicks = 0;
      stats.webMisses++;
      events.push({ type: 'web_missed' });
    }
  }

  // 5. Espaço: impulso (com teia), pulo (chão/coyote), flip (logo após soltar) ou buffer
  const jumpPressed = input.jumpPressed && !stunned;
  const canJump = !rope && (prev.grounded || p.coyoteTicks > 0);
  const doJump = () => {
    vel = { x: vel.x, y: cfg.physics.jumpSpeed, z: vel.z };
    p.coyoteTicks = 0;
    p.jumpBufferTicks = 0;
    p.flipWindowTicks = 0; // pulo nunca vira pulo duplo via flip
    p.flipAvailable = false;
    events.push({ type: 'jumped' });
  };
  if (jumpPressed) {
    if (rope) {
      if (!rope.impulseUsed && rope.heldTicks >= T(cfg.web.minSwingTime)) {
        vel = ropeImpulse(vel, p.pos, rope, p.yaw, cfg.web);
        rope = { ...rope, impulseUsed: true };
        events.push({ type: 'web_impulse' });
      }
    } else if (canJump) {
      doJump();
    } else if (p.flipWindowTicks > 0 && p.flipAvailable) {
      vel = flipBoost(vel, cfg.web);
      p.flipTicks = T(cfg.web.flipDuration);
      p.flipAvailable = false;
      p.flipWindowTicks = 0;
      events.push({ type: 'flip', afterPerfect: p.lastReleasePerfect });
    } else {
      p.jumpBufferTicks = T(cfg.physics.jumpBufferTime);
    }
  } else if (p.jumpBufferTicks > 0 && prev.grounded && !rope && !stunned) {
    doJump();
  }

  // 6–8. forças, limites e corda (com a teia: gravidade + projeção em subpassos)
  const wish = wishDirection({ moveX, moveZ }, p.yaw);
  let disp: Vec3;
  if (rope) {
    vel = swingForces(vel, { pos: p.pos, rope }, wish, moveZ, cfg.web, dt);
    vel = applyDrag(vel, cfg.physics, dt);
    const r = integrateRope(p.pos, vel, rope, cfg.physics.gravity, cfg.web, dt);
    rope = { ...rope, length: r.length, heldTicks: rope.heldTicks + 1 };
    disp = r.disp;
    vel = clampSpeed(r.vel, cfg.web.swingMaxSpeed);
  } else {
    vel = applyGravity(vel, cfg.physics, dt);
    if (prev.grounded) {
      vel = groundMove(vel, wish, cfg.physics, dt);
    } else {
      vel = airControl(vel, wish, cfg.physics, dt);
      vel = applyDrag(vel, cfg.physics, dt);
    }
    vel = clampSpeed(limitFall(vel, cfg.physics), cfg.physics.maxSpeed);
    disp = { x: vel.x * dt, y: vel.y * dt, z: vel.z * dt };
  }

  // 9. colisão por último (a parede sempre vence a corda)
  const move = moveAndCollide(level, p.pos, disp, vel, cfg.physics);
  vel = move.vel;

  // 10. consequências do movimento
  if (move.grounded && !prev.grounded) {
    events.push({ type: 'landed', speed: move.landingSpeed, kind: move.groundKind ?? 'street' });
    p.flipTicks = 0;
    p.flipWindowTicks = 0;
    p.flipAvailable = false;
  }
  if (move.wallNormal && move.wallImpactSpeed > cfg.physics.bonkSpeed && !stunned) {
    events.push({ type: 'bonk', speed: move.wallImpactSpeed });
    rope = null;
    p.stunTicks = T(cfg.physics.bonkStunTime);
    p.webBufferTicks = 0;
    vel = { x: vel.x * cfg.physics.bonkKeep, y: vel.y, z: vel.z * cfg.physics.bonkKeep };
  }
  p.wallTicks = rope && move.wallNormal ? p.wallTicks + 1 : 0;

  p.pos = move.pos;
  p.vel = vel;
  p.rope = rope;
  p.grounded = move.grounded;
  p.groundKind = move.grounded ? move.groundKind : null;
  p.mode = rope ? 'swing' : move.grounded ? 'ground' : 'air';
  p.airTicks = move.grounded ? 0 : prev.airTicks + 1;
  p.prevWebHeld = input.webHeld;

  return { ...state, tick: state.tick + 1, player: p, aim, events, stats };
}

/** Roda uma sequência de inputs a partir de um estado (replays e testes). */
export function runInputs(state: GameState, inputs: readonly InputFrame[]): GameState {
  let s = state;
  for (const input of inputs) s = step(s, input);
  return s;
}
