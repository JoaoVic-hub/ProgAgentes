/**
 * Ameaças: lançadores de mísseis nos telhados (ADR-023) — funções puras.
 *
 * Lançador: idle → aiming (laser de aviso, só com linha de visada livre e o
 * jogador no alcance) → firing (salva) → cooldown → idle.
 *
 * Míssil: sobe/acelera por armTime sem guiagem, depois persegue com
 * velocidade constante e curva limitada (turnRate): mira no ponto previsto
 * (posição + velocidade × lead × tempo até o alvo). Explode em prédios — dá
 * para usar a cidade como cobertura — e some ao fim da vida útil.
 * Desviável por construção: curva fechada, mudança brusca de direção, ou
 * simplesmente ser mais rápido que o míssil (impulso alto).
 */

import type { GameConfig, GameEvent, LauncherState, Level, Missile, Player, ThreatSpec, ThreatState } from './types';
import type { Vec3 } from './math/vec3';
import { add, dot, length, normalize, scale, sub } from './math/vec3';
import { rayVsBox } from './math/geom';
import { querySolidIds } from './level/broadphase';
import { secondsToTicks } from './config';

/** Altura do alvo (peito) acima dos pés. */
const CHEST = 1.2;

export function createThreats(level: Level): ThreatState {
  return {
    launchers: level.launchers.map(() => ({ phase: 'idle', ticks: 0, shotsLeft: 0 })),
    missiles: [],
    nextMissileId: 0,
    invulnerableTicks: 0,
  };
}

/** Depois de um respawn: mísseis somem e os lançadores recarregam (recomeço justo). */
export function resetThreats(threats: ThreatState): ThreatState {
  return {
    ...threats,
    launchers: threats.launchers.map(() => ({ phase: 'cooldown', ticks: 0, shotsLeft: 0 })),
    missiles: [],
  };
}

export function chestOf(feet: Vec3): Vec3 {
  return { x: feet.x, y: feet.y + CHEST, z: feet.z };
}

/** Primeiro sólido (fora as paredes invisíveis) no segmento a → b; t em metros, ou null. */
export function firstHitOnSegment(level: Level, a: Vec3, b: Vec3): { t: number; point: Vec3 } | null {
  const d = sub(b, a);
  const len = length(d);
  if (len < 1e-9) return null;
  const dir = scale(d, 1 / len);
  let best: { t: number; point: Vec3 } | null = null;
  for (const id of querySolidIds(level.broadphase, Math.min(a.z, b.z) - 1, Math.max(a.z, b.z) + 1)) {
    const s = level.solids[id];
    if (s.kind === 'bounds') continue;
    const hit = rayVsBox(a, dir, s.box, len);
    if (hit && (!best || hit.t < best.t)) best = { t: hit.t, point: hit.point };
  }
  return best;
}

export function hasLineOfSight(level: Level, a: Vec3, b: Vec3): boolean {
  return firstHitOnSegment(level, a, b) === null;
}

/** Distância mínima da origem ao segmento r0 → r1 (movimento relativo míssil × jogador no tick). */
export function closestApproach(r0: Vec3, r1: Vec3): number {
  const d = sub(r1, r0);
  const dd = dot(d, d);
  const t = dd < 1e-12 ? 0 : Math.min(Math.max(-dot(r0, d) / dd, 0), 1);
  return length(add(r0, scale(d, t)));
}

/** Gira a direção unitária `dir` em direção a `desired` em no máximo `maxAngle` radianos. */
export function turnToward(dir: Vec3, desired: Vec3, maxAngle: number): Vec3 {
  const c = Math.min(Math.max(dot(dir, desired), -1), 1);
  const angle = Math.acos(c);
  if (angle <= maxAngle) return desired;
  let perp = sub(desired, scale(dir, c));
  if (length(perp) < 1e-9) {
    // exatamente ao contrário: qualquer perpendicular serve (escolha estável)
    perp = Math.abs(dir.y) < 0.9 ? { x: -dir.z, y: 0, z: dir.x } : { x: 1, y: 0, z: 0 };
  }
  perp = normalize(perp);
  return normalize(add(scale(dir, Math.cos(maxAngle)), scale(perp, Math.sin(maxAngle))));
}

/** Ponto que o míssil persegue: onde o jogador estará daqui a lead × (tempo até o alvo). */
export function aimPoint(missilePos: Vec3, chest: Vec3, playerVel: Vec3, spec: ThreatSpec): Vec3 {
  const timeToGo = Math.min(length(sub(chest, missilePos)) / spec.missileSpeed, 1.5);
  return add(chest, scale(playerVel, spec.lead * timeToGo));
}

export interface ThreatHit {
  readonly missileId: number;
  /** Direção do míssil no impacto (para o empurrão). */
  readonly dir: Vec3;
}

export interface ThreatStep {
  readonly threats: ThreatState;
  readonly events: readonly GameEvent[];
  /** Acerto que vale (null se não houve, ou se o jogador estava invulnerável / god). */
  readonly hit: ThreatHit | null;
}

/**
 * Um tick das ameaças, depois do movimento do jogador (`player` já movido,
 * `prevFeet` = pés no início do tick, para o teste de acerto contínuo).
 */
export function stepThreats(
  threats: ThreatState,
  level: Level,
  player: Player,
  prevFeet: Vec3,
  config: GameConfig,
  god: boolean,
): ThreatStep {
  const mc = config.missiles;
  const spec = level.spec.threats;
  const T = (seconds: number) => secondsToTicks(seconds, config.tickHz);
  const dt = 1 / config.tickHz;
  const chest = chestOf(player.pos);
  const prevChest = chestOf(prevFeet);
  const events: GameEvent[] = [];
  const invulnerable = threats.invulnerableTicks > 0 || god;
  let hit: ThreatHit | null = null;

  // 1. mísseis existentes
  const missiles: Missile[] = [];
  for (const m of threats.missiles) {
    const age = m.ageTicks + 1;
    if (age > T(mc.lifetime)) {
      events.push({ type: 'missile_exploded', missileId: m.id, pos: m.pos, hitPlayer: false });
      continue;
    }
    let dir = normalize(m.vel);
    let speed = spec.missileSpeed;
    const armTicks = T(mc.armTime);
    if (age <= armTicks) {
      speed *= 0.5 + (0.5 * age) / armTicks; // acelerando, ainda sem guiagem
    } else {
      const target = aimPoint(m.pos, chest, player.vel, spec);
      dir = turnToward(dir, normalize(sub(target, m.pos)), spec.turnRate * dt);
    }
    const vel = scale(dir, speed);
    const next = add(m.pos, scale(vel, dt));

    if (closestApproach(sub(m.pos, prevChest), sub(next, chest)) <= mc.hitRadius) {
      const counts = !invulnerable && hit === null;
      if (counts) hit = { missileId: m.id, dir };
      events.push({ type: 'missile_exploded', missileId: m.id, pos: next, hitPlayer: counts });
      continue;
    }
    const wall = firstHitOnSegment(level, m.pos, next);
    if (wall) {
      events.push({ type: 'missile_exploded', missileId: m.id, pos: wall.point, hitPlayer: false });
      continue;
    }
    if (next.y < level.killY) continue; // caiu no vão
    missiles.push({ ...m, pos: next, vel, ageTicks: age });
  }

  // 2. lançadores
  let nextMissileId = threats.nextMissileId;
  const launchers: LauncherState[] = threats.launchers.map((ls, i) => {
    const L = level.launchers[i];
    const inRange = length(sub(L.pos, chest)) <= mc.activationRange && chest.z - L.pos.z <= mc.behindLimit;
    switch (ls.phase) {
      case 'idle':
        if (inRange && hasLineOfSight(level, L.pos, chest)) {
          events.push({ type: 'launcher_aiming', launcherId: L.id });
          return { phase: 'aiming', ticks: 0, shotsLeft: 0 };
        }
        return ls;
      case 'aiming':
        if (!inRange || !hasLineOfSight(level, L.pos, chest)) return { phase: 'idle', ticks: 0, shotsLeft: 0 };
        if (ls.ticks + 1 >= T(mc.warnTime)) return { phase: 'firing', ticks: 0, shotsLeft: spec.salvo };
        return { ...ls, ticks: ls.ticks + 1 };
      case 'firing': {
        let shotsLeft = ls.shotsLeft;
        if (ls.ticks % T(mc.salvoInterval) === 0 && missiles.length < mc.maxAlive) {
          // sai para cima e para dentro da avenida; a guiagem assume depois de armTime
          const dir = normalize({ x: -L.side * 0.6, y: 1, z: 0.3 });
          const id = nextMissileId++;
          missiles.push({ id, pos: L.pos, vel: scale(dir, spec.missileSpeed * 0.5), ageTicks: 0, launcherId: L.id });
          events.push({ type: 'missile_launched', missileId: id, launcherId: L.id });
          shotsLeft -= 1;
        }
        if (shotsLeft <= 0) return { phase: 'cooldown', ticks: 0, shotsLeft: 0 };
        return { phase: 'firing', ticks: ls.ticks + 1, shotsLeft };
      }
      case 'cooldown':
        return ls.ticks + 1 >= T(spec.cooldown) ? { phase: 'idle', ticks: 0, shotsLeft: 0 } : { ...ls, ticks: ls.ticks + 1 };
    }
  });

  const invulnerableTicks = hit ? T(mc.invulnerableTime) : Math.max(0, threats.invulnerableTicks - 1);
  return { threats: { launchers, missiles, nextMissileId, invulnerableTicks }, events, hit };
}
