/**
 * Teia: corda inextensível e unilateral resolvida por projeção de posição
 * (PBD), com velocidade recalculada a partir da posição corrigida.
 *
 * - Anexo com L = distância atual → nenhum "teleporte" no tick do anexo.
 * - Auto-reel encurta L até Ltarget, que garante folga sobre a rua no fundo
 *   do arco (sem raspar o asfalto).
 * - A corda age sobre o ponto de fixação (peito), attachHeight acima dos pés.
 * - A colisão roda DEPOIS da projeção (em engine.ts): a parede sempre vence.
 */

import type { GameConfig, Player, Rope, WebConfig } from '../types';
import type { Vec3 } from '../math/vec3';
import { add, dot, length, normalize, scale, sub } from '../math/vec3';
import { flatForward } from '../camera-rig';

const DEG = Math.PI / 180;

export function attachPoint(feet: Vec3, web: WebConfig): Vec3 {
  return { x: feet.x, y: feet.y + web.attachHeight, z: feet.z };
}

/** Comprimento-alvo: não maior que a distância atual e com folga sobre a rua no fundo do arco. */
export function targetRopeLength(anchor: Vec3, attach: Vec3, web: WebConfig): number {
  const dist = length(sub(attach, anchor));
  const clearance = anchor.y - web.attachHeight - web.streetClearance;
  return Math.min(Math.max(Math.min(dist, clearance), web.minRope), web.maxRange);
}

/**
 * Âncora virtual: um pêndulo sempre passa por baixo do ponto de apoio, e as
 * quinas ficam nas fachadas — sem correção, todo swing jogaria o jogador
 * contra a parede. O apoio físico é deslocado lateralmente (eixo X, o da
 * largura da avenida) em direção ao jogador; a teia continua desenhada até o
 * ponto real de contato.
 */
export function virtualAnchor(contact: Vec3, feet: Vec3, web: WebConfig): Vec3 {
  return { x: contact.x + (feet.x - contact.x) * web.lateralPull, y: contact.y, z: contact.z };
}

export function createRope(contact: Vec3, solidId: number, feet: Vec3, web: WebConfig, fromGround = false): Rope {
  const attach = attachPoint(feet, web);
  const anchor = virtualAnchor(contact, feet, web);
  return {
    anchor,
    contact,
    solidId,
    length: length(sub(attach, anchor)),
    targetLength: targetRopeLength(anchor, attach, web),
    heldTicks: 0,
    impulseUsed: false,
    fromGround,
  };
}

/** Remove de a a componente na direção unitária n. */
function perp(a: Vec3, n: Vec3): Vec3 {
  return sub(a, scale(n, dot(a, n)));
}

/** Forças do swing (além da gravidade): direção, bombeio, assistência e freio. */
export function swingForces(
  vel: Vec3,
  player: Pick<Player, 'pos' | 'rope'>,
  wish: Vec3,
  moveZ: number,
  web: WebConfig,
  dt: number,
): Vec3 {
  const rope = player.rope;
  if (!rope) return vel;
  const radial = normalize(sub(attachPoint(player.pos, web), rope.anchor));
  const speed = length(vel);
  const vhat = speed > 1e-6 ? scale(vel, 1 / speed) : { x: 0, y: 0, z: 0 };

  let a = scale(perp(wish, radial), web.steer);
  if (vel.y < 0) {
    a = add(a, scale(perp(vhat, radial), web.swingAssist));
    if (moveZ > 0) a = add(a, scale(vhat, web.pump));
  }
  if (moveZ < 0 && speed > 1) a = sub(a, scale(vhat, web.brake));
  return add(vel, scale(a, dt));
}

export interface RopeStep {
  /** Deslocamento do jogador no tick (entregue à varredura de colisão). */
  readonly disp: Vec3;
  /** Velocidade ao fim do tick. */
  readonly vel: Vec3;
  /** Comprimento da corda ao fim do tick (após o auto-reel). */
  readonly length: number;
}

/**
 * Gravidade + auto-reel + projeção PBD em subpassos dentro do tick: prevê a
 * posição do ponto de fixação; se passar do comprimento da corda, puxa de
 * volta para a esfera e recalcula a velocidade.
 *
 * - A dissipação do PBD é proporcional ao passo (medido: 9% de energia
 *   perdida por meio período a 60 Hz, 2,4% a 240 Hz) — daí os subpassos.
 * - Corda "catraca": recolhe a folga quando o jogador se aproxima da âncora
 *   (nunca fica frouxa para depois esticar com tranco) e, se a colisão
 *   impediu o jogador de acompanhar a esfera (distância > L no início do
 *   tick), cede até a distância real em vez de converter o déficit em
 *   velocidade. Medido antes: corda frouxa em 42% dos ticks e trancos de até
 *   23 m/s num tick.
 * - O reel encurta L um pouco a cada subpasso, sobe em rampa após o anexo e
 *   desacelera perto do alvo (proporcional ao que falta).
 */
export function integrateRope(feet: Vec3, vel: Vec3, rope: Rope, gravity: number, web: WebConfig, dt: number): RopeStep {
  const n = Math.max(1, Math.floor(web.ropeSubsteps));
  const h = dt / n;
  const ramp = web.reelRampTime > 0 ? Math.min(1, ((rope.heldTicks + 1) * dt) / web.reelRampTime) : 1;
  const c0 = attachPoint(feet, web);
  let c = c0;
  let v = vel;
  const d0 = length(sub(c0, rope.anchor));
  let L = d0 > rope.length ? d0 : rope.length;
  for (let i = 0; i < n; i++) {
    L = Math.min(L, Math.max(web.minRope, length(sub(c, rope.anchor))));
    if (L > rope.targetLength) {
      const reel = rope.fromGround ? web.groundReel : web.autoReel;
      const speed = Math.min(reel * ramp, web.reelSlowdown * (L - rope.targetLength));
      L = Math.max(rope.targetLength, L - speed * h);
    }
    v = { x: v.x, y: v.y - gravity * h, z: v.z };
    const predicted = add(c, scale(v, h));
    const r = sub(predicted, rope.anchor);
    const dist = length(r);
    const next = dist > L && dist > 0 ? add(rope.anchor, scale(r, L / dist)) : predicted;
    v = scale(sub(next, c), 1 / h);
    c = next;
  }
  return { disp: sub(c, c0), vel: v, length: L };
}

/** Qualidade da soltura: 1 no ângulo de saída ideal (~35° acima do horizonte), caindo até 0. */
export function releaseQuality(vel: Vec3, web: WebConfig): number {
  const horiz = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  const angleDeg = Math.atan2(vel.y, horiz) / DEG;
  const q = 1 - Math.abs(angleDeg - web.releaseIdealAngleDeg) / web.releaseAngleToleranceDeg;
  return Math.min(Math.max(q, 0), 1);
}

export interface ReleaseResult {
  readonly vel: Vec3;
  readonly quality: number;
  readonly perfect: boolean;
}

/** Soltura: impulso na direção do movimento proporcional à qualidade, mais um empurrão para cima. */
export function releaseBoost(vel: Vec3, web: WebConfig): ReleaseResult {
  const speed = length(vel);
  const quality = releaseQuality(vel, web);
  if (speed < web.releaseMinSpeed) return { vel, quality, perfect: false };
  const boost = web.releaseBoostMin + (web.releaseBoostMax - web.releaseBoostMin) * quality;
  const boosted = add(vel, scale(vel, boost / speed));
  return {
    vel: { x: boosted.x, y: boosted.y + web.releaseUpBoost, z: boosted.z },
    quality,
    perfect: quality >= web.perfectQuality,
  };
}

/** Impulso (Espaço com a teia presa): empurrão tangencial, uma vez por teia. */
export function ropeImpulse(vel: Vec3, feet: Vec3, rope: Rope, yaw: number, web: WebConfig): Vec3 {
  const radial = normalize(sub(attachPoint(feet, web), rope.anchor));
  const speed = length(vel);
  let dir = speed > 1 ? perp(scale(vel, 1 / speed), radial) : perp(flatForward(yaw), radial);
  if (length(dir) < 1e-6) dir = flatForward(yaw);
  return add(vel, scale(normalize(dir), web.impulse));
}

/** Flip logo após soltar: pequeno salto e empurrão horizontal na direção do movimento. */
export function flipBoost(vel: Vec3, web: WebConfig): Vec3 {
  const horiz = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  const k = horiz > 0.1 ? web.flipForwardBoost / horiz : 0;
  return { x: vel.x + vel.x * k, y: Math.max(vel.y, 0) + web.flipUpSpeed, z: vel.z + vel.z * k };
}

/** Energia mecânica por unidade de massa (para testes do pêndulo). */
export function specificEnergy(feet: Vec3, vel: Vec3, cfg: GameConfig): number {
  return cfg.physics.gravity * feet.y + 0.5 * dot(vel, vel);
}
