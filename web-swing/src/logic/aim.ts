/**
 * Mira da teia, recalculada a cada tick a partir da câmera lógica.
 *
 * 1. Raio direto (centro da tela) contra os sólidos: prédio comum ancora;
 *    vidro bloqueia sem ancorar; rua é "baixo demais"; paredes invisíveis
 *    são ignoradas. Acerto na fachada perto do topo "sobe" para a quina.
 * 2. Se o raio direto não serve, a assistência procura a melhor quina de
 *    telhado voltada para a avenida dentro de um cone (8°, depois 20°), com
 *    linha de visada livre e histerese para o alvo não "piscar".
 */

import type { AimFailReason, AimResult, GameConfig, Level, Player, Solid } from './types';
import type { Vec3 } from './math/vec3';
import { add, dot, length, normalize, scale, sub } from './math/vec3';
import { closestPointOnSegmentToRay, rayVsBox } from './math/geom';
import { querySolidIds } from './level/broadphase';
import { flatForward, lookDir, safeCameraPivot } from './camera-rig';
import { attachPoint } from './player/web';

const DEG = Math.PI / 180;

export const NO_AIM: AimResult = {
  point: null,
  solidId: null,
  source: 'none',
  rayEnd: { x: 0, y: 0, z: 0 },
  fail: 'sky',
};

interface Candidate {
  readonly point: Vec3;
  readonly solidId: number;
  readonly angle: number;
  readonly score: number;
}

function validateAnchor(point: Vec3, player: Player, chest: Vec3, cfg: GameConfig): AimFailReason {
  const d = sub(point, chest);
  if (length(d) > cfg.web.maxRange) return 'range';
  if (point.y < chest.y + cfg.web.minAnchorAbove) return 'low';
  const flat = { x: point.x - player.pos.x, y: 0, z: point.z - player.pos.z };
  const flatLen = length(flat);
  if (flatLen > 1e-6) {
    const cosA = dot(flat, flatForward(player.yaw)) / flatLen;
    if (cosA < Math.cos(cfg.aim.maxBehindDeg * DEG)) return 'behind';
  }
  return null;
}

/** Algum sólido (além do alvo e das paredes invisíveis) bloqueia o segmento peito → ponto? */
function lineOfSightBlocked(chest: Vec3, point: Vec3, targetId: number, solids: readonly Solid[]): boolean {
  const d = sub(point, chest);
  const dist = length(d);
  if (dist < 1e-6) return false;
  const dir = scale(d, 1 / dist);
  for (const s of solids) {
    if (s.id === targetId || s.kind === 'bounds') continue;
    if (rayVsBox(chest, dir, s.box, dist - 0.05)) return true;
  }
  return false;
}

/** Quina superior do prédio voltada para a avenida (segmento ao longo de Z). */
function avenueEdge(s: Solid): [Vec3, Vec3] | null {
  if (s.side === 0) return null;
  const x = s.side < 0 ? s.box.max.x : s.box.min.x;
  const y = s.box.max.y;
  return [{ x, y, z: s.box.min.z }, { x, y, z: s.box.max.z }];
}

function evaluateEdge(
  s: Solid,
  origin: Vec3,
  dir: Vec3,
  chest: Vec3,
  player: Player,
  coneRad: number,
  cfg: GameConfig,
): Candidate | null {
  const edge = avenueEdge(s);
  if (!edge) return null;
  const point = closestPointOnSegmentToRay(edge[0], edge[1], origin, dir);
  const toPoint = sub(point, origin);
  const len = length(toPoint);
  if (len < 1e-6) return null;
  const angle = Math.acos(Math.min(Math.max(dot(toPoint, dir) / len, -1), 1));
  if (angle > coneRad) return null;
  if (validateAnchor(point, player, chest, cfg) !== null) return null;
  const dist = length(sub(point, chest));
  const flat = normalize({ x: point.x - player.pos.x, y: 0, z: point.z - player.pos.z });
  const forwardness = dot(flat, flatForward(player.yaw));
  const pref = cfg.aim.preferredDistance;
  const score = angle / coneRad + (0.35 * Math.abs(dist - pref)) / pref - 0.2 * forwardness;
  return { point, solidId: s.id, angle, score };
}

function findAssist(
  level: Level,
  origin: Vec3,
  dir: Vec3,
  chest: Vec3,
  player: Player,
  prevAim: AimResult,
  cfg: GameConfig,
): Candidate | null {
  const range = cfg.web.maxRange;
  const nearby = querySolidIds(level.broadphase, chest.z - range, chest.z + range).map((id) => level.solids[id]);
  const anchorable = nearby.filter((s) => s.anchorable);
  const prevId = prevAim.source === 'assist' ? prevAim.solidId : null;

  for (const coneDeg of [cfg.aim.coneDeg, cfg.aim.fallbackConeDeg]) {
    const cone = coneDeg * DEG;
    const candidates: Candidate[] = [];
    let prevCandidate: Candidate | null = null;
    for (const s of anchorable) {
      const c = evaluateEdge(s, origin, dir, chest, player, cone, cfg);
      if (c) candidates.push(c);
      if (s.id === prevId) {
        // o alvo anterior ganha um cone um pouco maior (histerese)
        prevCandidate = c ?? evaluateEdge(s, origin, dir, chest, player, cone + cfg.aim.hysteresisDeg * DEG, cfg);
      }
    }
    candidates.sort((a, b) => a.score - b.score || a.solidId - b.solidId);
    const best = candidates.find((c) => !lineOfSightBlocked(chest, c.point, c.solidId, nearby)) ?? null;
    const prevOk = prevCandidate && !lineOfSightBlocked(chest, prevCandidate.point, prevCandidate.solidId, nearby) ? prevCandidate : null;
    if (prevOk && (!best || best.solidId === prevOk.solidId || best.score + cfg.aim.switchImprovement >= prevOk.score)) {
      return prevOk;
    }
    if (best) return best;
  }
  return null;
}

export function computeAim(level: Level, player: Player, prevAim: AimResult, cfg: GameConfig): AimResult {
  const origin = safeCameraPivot(level, player.pos, player.yaw, cfg.rig);
  const dir = lookDir(player.yaw, player.pitch);
  const chest = attachPoint(player.pos, cfg.web);
  // o raio vai além do alcance para o retículo poder dizer "fora de alcance" em vez de "céu"
  const reach = cfg.web.maxRange * 2;
  const end = add(origin, scale(dir, reach));

  const rayIds = querySolidIds(level.broadphase, Math.min(origin.z, end.z) - 1, Math.max(origin.z, end.z) + 1);
  let nearest: { t: number; point: Vec3; normalY: number; solid: Solid } | null = null;
  for (const id of rayIds) {
    const s = level.solids[id];
    if (s.kind === 'bounds') continue;
    const hit = rayVsBox(origin, dir, s.box, reach);
    if (hit && (!nearest || hit.t < nearest.t)) nearest = { t: hit.t, point: hit.point, normalY: hit.normal.y, solid: s };
  }

  let fail: AimFailReason = 'sky';
  let rayEnd = end;
  if (nearest) {
    rayEnd = nearest.point;
    if (nearest.solid.kind === 'glass') fail = 'glass';
    else if (nearest.solid.kind === 'street') fail = 'low';
    else {
      const s = nearest.solid;
      const direct = nearest.point;
      // candidatos: quina do telhado (snap) primeiro, depois o ponto exato do acerto —
      // o snap nunca pode transformar um acerto válido em inválido (ex.: empurrar para fora do alcance)
      const candidates: { point: Vec3; source: AimResult['source'] }[] = [];
      if (nearest.normalY === 0 && s.box.max.y - direct.y <= cfg.aim.snapToTop) {
        candidates.push({ point: { x: direct.x, y: s.box.max.y, z: direct.z }, source: 'snap' });
      }
      candidates.push({ point: direct, source: 'direct' });
      for (const c of candidates) {
        const reason = validateAnchor(c.point, player, chest, cfg);
        if (reason !== null) {
          fail = reason;
          continue;
        }
        // a teia sai do peito: nada pode estar entre o peito e o ponto
        const nearby = querySolidIds(level.broadphase, Math.min(chest.z, c.point.z) - 1, Math.max(chest.z, c.point.z) + 1).map((id) => level.solids[id]);
        if (lineOfSightBlocked(chest, c.point, s.id, nearby)) {
          fail = 'blocked';
          continue;
        }
        return { point: c.point, solidId: s.id, source: c.source, rayEnd, fail: null };
      }
    }
  }

  if (cfg.aim.assistEnabled) {
    const assist = findAssist(level, origin, dir, chest, player, prevAim, cfg);
    if (assist) return { point: assist.point, solidId: assist.solidId, source: 'assist', rayEnd, fail };
  }
  return { point: null, solidId: null, source: 'none', rayEnd, fail };
}
