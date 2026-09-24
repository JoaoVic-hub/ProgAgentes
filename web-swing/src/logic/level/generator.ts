/**
 * Gerador puro de níveis: LevelSpec + seed → Level.
 *
 * Mesma spec + mesma seed → nível idêntico (Princípio III). A avenida corre
 * em +Z com a rua centrada em x = 0; os prédios se alinham dos dois lados,
 * separados por becos. Paredes invisíveis ('bounds') fecham o mundo.
 *
 * A partir do L3 há vãos sem chão: a rua vira segmentos, nenhum prédio
 * invade o vão e gruas ancoráveis (logo fora do corredor da avenida) servem
 * de apoio para atravessá-lo. Cair no vão (abaixo de killY) custa uma vida.
 *
 * Os anéis seguem uma rota suave no meio da avenida; os "de risco" ficam
 * baixos, perto da rua, ou sobre os vãos — os dourados são sempre de risco.
 */

import type { Checkpoint, Level, LevelSpec, Range, Ring, Solid, SolidKind, ZRange } from '../types';
import type { Vec3 } from '../math/vec3';
import { nextRandom, nextRange } from '../rng';
import { buildBroadphase } from './broadphase';

/** Os prédios começam antes da largada e vão além da chegada (cenário). */
export const LEVEL_Z_BEFORE_START = 40;
export const LEVEL_Z_AFTER_FINISH = 90;
const STREET_THICKNESS = 1;
const BOUNDS_THICKNESS = 2;
const BOUNDS_HEIGHT = 300;
/** As paredes invisíveis descem bem abaixo de killY (o jogador cai dentro do vão). */
const BOUNDS_BOTTOM = -60;
const BACK_ALLEY = 6;
export const START_POSITION: Vec3 = { x: 0, y: 0, z: 5 };
export const KILL_Y = -25;

/** Gruas: torre de 3 × 3 m, fundada no fundo do vão, logo fora do corredor. */
const CRANE_SIZE = 3;
const CRANE_GAP = 0.5;
const CRANE_BOTTOM = -40;
const CRANE_HEIGHT: Range = [60, 80];
/** Espaçamento alvo entre gruas ao longo do vão. */
const CRANE_SPACING = 28;

/** Anéis ficam nesta faixa de Z (longe da largada e da chegada). */
const RING_Z_FROM = 45;
const RING_Z_BEFORE_FINISH = 25;

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

/** Vãos igualmente espaçados no miolo do nível (nenhum perto da largada ou da chegada). */
function placeVoids(spec: LevelSpec, rngIn: number): [number, ZRange[]] {
  let rng = rngIn;
  const out: ZRange[] = [];
  let v: number;
  for (let i = 0; i < spec.voids.count; i++) {
    const center = (spec.length * (i + 1)) / (spec.voids.count + 1);
    [rng, v] = range(rng, spec.voids.length);
    const start = cm(center - v / 2);
    out.push({ start, end: cm(start + v) });
  }
  return [rng, out];
}

/**
 * Um lado da avenida. `opposite` é o lado já gerado: um prédio nunca é de
 * vidro se o prédio em frente também for — senão surgem trechos sem nenhuma
 * âncora (o teste de alcançabilidade achou 60 m assim no L4).
 */
function buildSide(
  spec: LevelSpec,
  side: -1 | 1,
  voids: readonly ZRange[],
  opposite: readonly DraftSolid[],
  rngIn: number,
): [number, DraftSolid[]] {
  let rng = rngIn;
  const halfW = spec.avenueWidth / 2;
  const zEnd = spec.length + LEVEL_Z_AFTER_FINISH;
  const minLen = spec.buildingLength[0];
  const out: DraftSolid[] = [];
  let z = -LEVEL_Z_BEFORE_START;
  let prevGlass = false;
  let v: number;
  // o último prédio é cortado no fim do mundo (nunca invade a parede de fechamento)
  while (zEnd - z >= minLen) {
    const nextVoid = voids.find((vd) => vd.end > z);
    if (nextVoid && z > nextVoid.start - minLen) {
      // não cabe um prédio antes do vão: recomeça do outro lado dele
      z = cm(nextVoid.end + spec.spacing[0]);
      continue;
    }
    const limit = nextVoid ? nextVoid.start - z : Infinity;
    [rng, v] = range(rng, spec.buildingLength);
    const len = cm(Math.min(v, zEnd - z, limit));
    [rng, v] = range(rng, spec.buildingDepth);
    const depth = cm(v);
    [rng, v] = range(rng, spec.buildingHeight);
    const height = cm(v);
    [rng, v] = range(rng, spec.setback);
    const setback = cm(v);
    [rng, v] = nextRandom(rng);
    const facingGlass = opposite.some((o) => o.kind === 'glass' && o.min.z < z + len && o.max.z > z);
    const glass: boolean = !prevGlass && !facingGlass && v < spec.glassRatio;
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

/** Gruas ao longo de cada vão, alternando os lados, com ≤ ~28 m entre elas. */
function buildCranes(spec: LevelSpec, voids: readonly ZRange[], rngIn: number): [number, DraftSolid[]] {
  let rng = rngIn;
  const halfW = spec.avenueWidth / 2;
  const out: DraftSolid[] = [];
  let v: number;
  voids.forEach((vd, vi) => {
    const len = vd.end - vd.start;
    const n = Math.max(1, Math.round(len / CRANE_SPACING));
    for (let k = 0; k < n; k++) {
      const zc = vd.start + (len * (k + 0.5)) / n;
      const side: -1 | 1 = (k + vi) % 2 === 0 ? -1 : 1;
      [rng, v] = range(rng, CRANE_HEIGHT);
      const inner = halfW + CRANE_GAP;
      const outer = inner + CRANE_SIZE;
      out.push({
        min: { x: side < 0 ? -outer : inner, y: CRANE_BOTTOM, z: cm(zc - CRANE_SIZE / 2) },
        max: { x: side < 0 ? -inner : outer, y: cm(v), z: cm(zc + CRANE_SIZE / 2) },
        kind: 'crane',
        side,
      });
    }
  });
  return [rng, out];
}

function inVoid(z: number, voids: readonly ZRange[], margin = 0): boolean {
  return voids.some((vd) => z >= vd.start - margin && z <= vd.end + margin);
}

/** Checkpoints igualmente espaçados; se cair num vão, vai para 15 m antes dele. */
function placeCheckpoints(spec: LevelSpec, voids: readonly ZRange[]): Checkpoint[] {
  const out: Checkpoint[] = [];
  for (let i = 1; i <= spec.checkpoints; i++) {
    let z = cm((spec.length * i) / (spec.checkpoints + 1));
    const vd = voids.find((x) => z >= x.start - 12 && z <= x.end + 2);
    if (vd) z = cm(vd.start - 15);
    out.push({ index: i, z, spawn: { x: 0, y: 0, z } });
  }
  return out;
}

/**
 * Anéis numa rota suave (senoides com fase sorteada) dentro do corredor da
 * avenida, sempre com folga ≥ raio + 1,5 m das fachadas e ≥ raio + 1 m da
 * rua. Os de risco descem para perto da rua (ou ficam baixos sobre um vão).
 */
function placeRings(spec: LevelSpec, voids: readonly ZRange[], rngIn: number): [number, Ring[]] {
  let rng = rngIn;
  const { count, gold, radius, riskyRatio } = spec.rings;
  const halfW = spec.avenueWidth / 2;
  const maxX = halfW - radius - 1.5;
  const minY = Math.max(3, radius + 1);
  const zFrom = RING_Z_FROM;
  const zTo = spec.length - RING_Z_BEFORE_FINISH;
  let phaseX: number;
  let phaseY: number;
  [rng, phaseX] = nextRange(rng, 0, Math.PI * 2);
  [rng, phaseY] = nextRange(rng, 0, Math.PI * 2);

  // índices de risco espalhados pelo nível; os dourados são um subconjunto deles
  const riskyCount = Math.min(count, Math.max(gold, Math.round(count * riskyRatio)));
  const risky = new Set<number>();
  for (let k = 0; k < riskyCount; k++) risky.add(Math.floor(((k + 0.5) * count) / riskyCount));
  const riskyList = [...risky].sort((a, b) => a - b);
  const golden = new Set<number>();
  for (let k = 0; k < gold && riskyList.length > 0; k++) {
    golden.add(riskyList[Math.floor(((k + 0.5) * riskyList.length) / gold)]);
  }

  const out: Ring[] = [];
  let v: number;
  for (let i = 0; i < count; i++) {
    const z = cm(zFrom + ((zTo - zFrom) * (i + 0.5)) / count);
    const overVoid = inVoid(z, voids, 2);
    const isRisky = risky.has(i) || overVoid;
    const routeX = maxX * 0.55 * Math.sin(z / 90 + phaseX);
    const routeY = 20 + 9 * Math.sin(z / 70 + phaseY);
    let y: number;
    if (overVoid) {
      [rng, v] = nextRange(rng, 4, 10);
      y = v;
    } else if (isRisky) {
      [rng, v] = nextRange(rng, minY, Math.max(minY, 7));
      y = v;
    } else {
      y = routeY;
    }
    out.push({
      id: i,
      center: { x: cm(Math.max(-maxX, Math.min(maxX, routeX))), y: cm(Math.max(minY, y)), z },
      normal: { x: 0, y: 0, z: 1 },
      radius,
      gold: golden.has(i),
      risky: isRisky,
    });
  }
  return [rng, out];
}

export function halfWorldWidth(spec: LevelSpec): number {
  return spec.avenueWidth / 2 + spec.setback[1] + spec.buildingDepth[1] + BACK_ALLEY;
}

export function generateLevel(spec: LevelSpec, seedOverride: number | null = null): Level {
  const seed = (seedOverride ?? spec.seed) >>> 0;
  let rng = seed;
  let voids: ZRange[];
  let left: DraftSolid[];
  let right: DraftSolid[];
  let cranes: DraftSolid[];
  let rings: Ring[];
  // ordem fixa de consumo do PRNG (sem vãos, L1/L2 geram a mesma cidade da Etapa 1)
  [rng, voids] = placeVoids(spec, rng);
  [rng, left] = buildSide(spec, -1, voids, [], rng);
  [rng, right] = buildSide(spec, 1, voids, left, rng);
  [rng, cranes] = buildCranes(spec, voids, rng);
  [rng, rings] = placeRings(spec, voids, rng);

  const hw = halfWorldWidth(spec);
  const zLo = -LEVEL_Z_BEFORE_START - 20;
  const zHi = spec.length + LEVEL_Z_AFTER_FINISH + 20;
  const T = BOUNDS_THICKNESS;
  const H = BOUNDS_HEIGHT;
  const B = BOUNDS_BOTTOM;

  // a rua vira um segmento entre cada par de vãos
  const streets: DraftSolid[] = [];
  let segStart = zLo;
  for (const vd of voids) {
    streets.push({ min: { x: -hw, y: -STREET_THICKNESS, z: segStart }, max: { x: hw, y: 0, z: vd.start }, kind: 'street', side: 0 });
    segStart = vd.end;
  }
  streets.push({ min: { x: -hw, y: -STREET_THICKNESS, z: segStart }, max: { x: hw, y: 0, z: zHi }, kind: 'street', side: 0 });

  const world: DraftSolid[] = [
    ...streets,
    { min: { x: -hw - T, y: B, z: zLo - T }, max: { x: -hw, y: H, z: zHi + T }, kind: 'bounds', side: -1 },
    { min: { x: hw, y: B, z: zLo - T }, max: { x: hw + T, y: H, z: zHi + T }, kind: 'bounds', side: 1 },
    { min: { x: -hw, y: B, z: zLo - T }, max: { x: hw, y: H, z: zLo }, kind: 'bounds', side: 0 },
    { min: { x: -hw, y: B, z: zHi }, max: { x: hw, y: H, z: zHi + T }, kind: 'bounds', side: 0 },
  ];

  const drafts = [...world, ...left, ...right, ...cranes].sort(
    (a, b) => a.min.z - b.min.z || a.min.x - b.min.x || a.min.y - b.min.y,
  );
  const solids: Solid[] = drafts.map((d, id) => ({
    id,
    box: { min: d.min, max: d.max },
    kind: d.kind,
    anchorable: d.kind === 'building' || d.kind === 'crane',
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
    voids,
    rings,
    checkpoints: placeCheckpoints(spec, voids),
    ringQuota: Math.ceil(spec.minRingRatio * rings.length),
  };
}
