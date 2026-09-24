/**
 * Gerador puro de níveis: LevelSpec + seed → Level.
 *
 * Mesma spec + mesma seed → nível idêntico (Princípio III). A avenida corre
 * em +Z com a rua centrada em x = 0; os prédios se alinham dos dois lados,
 * separados por becos. Paredes invisíveis ('bounds') fecham o mundo.
 */

import type { Level, LevelSpec, Range, Solid, SolidKind } from '../types';
import type { Vec3 } from '../math/vec3';
import { nextRandom, nextRange } from '../rng';
import { buildBroadphase } from './broadphase';

/** Os prédios começam antes da largada e vão além da chegada (cenário). */
export const LEVEL_Z_BEFORE_START = 40;
export const LEVEL_Z_AFTER_FINISH = 90;
const STREET_THICKNESS = 1;
const BOUNDS_THICKNESS = 2;
const BOUNDS_HEIGHT = 300;
const BACK_ALLEY = 6;
export const START_POSITION: Vec3 = { x: 0, y: 0, z: 5 };
export const KILL_Y = -25;

interface DraftSolid {
  min: Vec3;
  max: Vec3;
  kind: SolidKind;
  side: -1 | 0 | 1;
}

function range(rng: number, r: Range): [number, number] {
  return nextRange(rng, r[0], r[1]);
}

/** Arredonda para centímetros: caixas "limpas" e estáveis no JSON. */
function cm(v: number): number {
  return Math.round(v * 100) / 100;
}

function buildSide(spec: LevelSpec, side: -1 | 1, rngIn: number): [number, DraftSolid[]] {
  let rng = rngIn;
  const halfW = spec.avenueWidth / 2;
  const zEnd = spec.length + LEVEL_Z_AFTER_FINISH;
  const out: DraftSolid[] = [];
  let z = -LEVEL_Z_BEFORE_START;
  let prevGlass = false;
  let v: number;
  // o último prédio é cortado no fim do mundo (nunca invade a parede de fechamento)
  while (zEnd - z >= spec.buildingLength[0]) {
    [rng, v] = range(rng, spec.buildingLength);
    const len = cm(Math.min(v, zEnd - z));
    [rng, v] = range(rng, spec.buildingDepth);
    const depth = cm(v);
    [rng, v] = range(rng, spec.buildingHeight);
    const height = cm(v);
    [rng, v] = range(rng, spec.setback);
    const setback = cm(v);
    [rng, v] = nextRandom(rng);
    const glass: boolean = !prevGlass && v < spec.glassRatio;
    prevGlass = glass;

    const inner = halfW + setback;
    const outer = inner + depth;
    out.push({
      min: { x: side < 0 ? -outer : inner, y: 0, z: cm(z) },
      max: { x: side < 0 ? -inner : outer, y: height, z: cm(z + len) },
      kind: glass ? 'glass' : 'building',
      side,
    });

    [rng, v] = range(rng, spec.spacing);
    z = cm(z + len + v);
  }
  return [rng, out];
}

export function halfWorldWidth(spec: LevelSpec): number {
  return spec.avenueWidth / 2 + spec.setback[1] + spec.buildingDepth[1] + BACK_ALLEY;
}

export function generateLevel(spec: LevelSpec, seedOverride: number | null = null): Level {
  const seed = (seedOverride ?? spec.seed) >>> 0;
  let rng = seed;
  let left: DraftSolid[];
  let right: DraftSolid[];
  [rng, left] = buildSide(spec, -1, rng);
  [rng, right] = buildSide(spec, 1, rng);

  const hw = halfWorldWidth(spec);
  const zLo = -LEVEL_Z_BEFORE_START - 20;
  const zHi = spec.length + LEVEL_Z_AFTER_FINISH + 20;
  const T = BOUNDS_THICKNESS;
  const H = BOUNDS_HEIGHT;
  const world: DraftSolid[] = [
    { min: { x: -hw, y: -STREET_THICKNESS, z: zLo }, max: { x: hw, y: 0, z: zHi }, kind: 'street', side: 0 },
    { min: { x: -hw - T, y: -STREET_THICKNESS, z: zLo - T }, max: { x: -hw, y: H, z: zHi + T }, kind: 'bounds', side: -1 },
    { min: { x: hw, y: -STREET_THICKNESS, z: zLo - T }, max: { x: hw + T, y: H, z: zHi + T }, kind: 'bounds', side: 1 },
    { min: { x: -hw, y: -STREET_THICKNESS, z: zLo - T }, max: { x: hw, y: H, z: zLo }, kind: 'bounds', side: 0 },
    { min: { x: -hw, y: -STREET_THICKNESS, z: zHi }, max: { x: hw, y: H, z: zHi + T }, kind: 'bounds', side: 0 },
  ];

  const drafts = [...world, ...left, ...right].sort(
    (a, b) => a.min.z - b.min.z || a.min.x - b.min.x || a.min.y - b.min.y,
  );
  const solids: Solid[] = drafts.map((d, id) => ({
    id,
    box: { min: d.min, max: d.max },
    kind: d.kind,
    anchorable: d.kind === 'building',
    side: d.side,
  }));

  return {
    spec,
    seed,
    solids,
    broadphase: buildBroadphase(solids),
    start: START_POSITION,
    finishZ: spec.length,
    killY: KILL_Y,
    halfWorldWidth: hw,
  };
}
