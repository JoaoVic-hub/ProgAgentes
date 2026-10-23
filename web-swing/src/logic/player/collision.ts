/**
 * Colisão do jogador (AABB) contra os sólidos do nível.
 *
 * Varredura eixo a eixo (Y → X → Z) em subpassos de no máximo maxSubstep
 * metros: como todo sólido tem ≥ 1 m de espessura, não há túnel mesmo a
 * 60 m/s. Ao bater, o jogador para exatamente no contato e a componente da
 * velocidade naquele eixo zera (as outras seguem → desliza na parede).
 * Beirais baixos (≤ ledgeAssist) são escalados automaticamente.
 */

import type { Aabb, GroundKind, Level, PhysicsConfig, Solid } from '../types';
import type { Vec3 } from '../math/vec3';
import { boxesOverlap } from '../math/geom';
import { querySolidIds } from '../level/broadphase';

export interface MoveResult {
  readonly pos: Vec3;
  readonly vel: Vec3;
  readonly grounded: boolean;
  readonly groundKind: GroundKind | null;
  /** Velocidade de queda no instante em que tocou o chão (0 se não tocou). */
  readonly landingSpeed: number;
  readonly hitCeiling: boolean;
  /** Normal da parede mais forte atingida neste tick (null = nenhuma). */
  readonly wallNormal: Vec3 | null;
  /** Velocidade contra a parede no instante do contato. */
  readonly wallImpactSpeed: number;
  readonly steppedUp: boolean;
}

type Axis = 'x' | 'y' | 'z';
const AXIS_ORDER: readonly Axis[] = ['y', 'x', 'z'];

export function playerBox(pos: Vec3, cfg: PhysicsConfig): Aabb {
  const hw = cfg.halfWidth;
  return {
    min: { x: pos.x - hw, y: pos.y, z: pos.z - hw },
    max: { x: pos.x + hw, y: pos.y + cfg.height, z: pos.z + hw },
  };
}

export function solidsInZRange(level: Level, zMin: number, zMax: number): Solid[] {
  return querySolidIds(level.broadphase, zMin, zMax).map((id) => level.solids[id]);
}

function isFree(pos: Vec3, solids: readonly Solid[], cfg: PhysicsConfig): boolean {
  const box = playerBox(pos, cfg);
  return solids.every((s) => !boxesOverlap(box, s.box));
}

/** O jogador (pés em pos) está sobrepondo algum sólido? Usado por testes e asserts de debug. */
export function overlapsAnySolid(level: Level, pos: Vec3, cfg: PhysicsConfig): boolean {
  return !isFree(pos, solidsInZRange(level, pos.z - 2, pos.z + 2), cfg);
}

/**
 * Varre o jogador de pos por disp. vel é a velocidade ao fim do tick: as
 * componentes nos eixos bloqueados zeram (normalmente disp = vel·dt; com a
 * corda em subpassos, disp vem da integração da corda).
 */
export function moveAndCollide(level: Level, pos: Vec3, disp: Vec3, vel: Vec3, cfg: PhysicsConfig): MoveResult {
  const hw = cfg.halfWidth;
  const dist = Math.sqrt(disp.x * disp.x + disp.y * disp.y + disp.z * disp.z);
  const n = Math.max(1, Math.ceil(dist / cfg.maxSubstep));
  const step = { x: disp.x / n, y: disp.y / n, z: disp.z / n };

  const margin = hw + 2;
  const solids = solidsInZRange(level, Math.min(pos.z, pos.z + disp.z) - margin, Math.max(pos.z, pos.z + disp.z) + margin);

  const p = { x: pos.x, y: pos.y, z: pos.z };
  const v = { x: vel.x, y: vel.y, z: vel.z };
  const blocked = { x: false, y: false, z: false };
  let grounded = false;
  let groundKind: GroundKind | null = null;
  let landingSpeed = 0;
  let hitCeiling = false;
  let wallNormal: Vec3 | null = null;
  let wallImpactSpeed = 0;
  let steppedUp = false;

  for (let i = 0; i < n; i++) {
    for (const axis of AXIS_ORDER) {
      const d = step[axis];
      if (d === 0 || blocked[axis]) continue;
      p[axis] += d;
      for (const s of solids) {
        if (!boxesOverlap(playerBox(p, cfg), s.box)) continue;

        if (axis !== 'y') {
          // beiral baixo à frente: sobe em vez de parar
          const rise = s.box.max.y - p.y;
          if (rise > 0 && rise <= cfg.ledgeAssist && isFree({ x: p.x, y: s.box.max.y, z: p.z }, solids, cfg)) {
            p.y = s.box.max.y;
            steppedUp = true;
            continue;
          }
        }

        if (d > 0) p[axis] = s.box.min[axis] - (axis === 'y' ? cfg.height : hw);
        else p[axis] = s.box.max[axis] + (axis === 'y' ? 0 : hw);

        if (axis === 'y') {
          if (d < 0) {
            grounded = true;
            groundKind = s.kind === 'street' ? 'street' : 'roof';
            landingSpeed = Math.max(landingSpeed, -v.y);
          } else {
            hitCeiling = true;
          }
        } else {
          const impact = Math.abs(v[axis]);
          if (impact >= wallImpactSpeed) {
            wallImpactSpeed = impact;
            wallNormal = axis === 'x' ? { x: -Math.sign(d), y: 0, z: 0 } : { x: 0, y: 0, z: -Math.sign(d) };
          }
        }
        v[axis] = 0;
        blocked[axis] = true;
      }
    }
  }

  return { pos: p, vel: v, grounded, groundKind, landingSpeed, hitCeiling, wallNormal, wallImpactSpeed, steppedUp };
}
