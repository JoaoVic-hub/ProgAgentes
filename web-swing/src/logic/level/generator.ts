/**
 * Gerador puro de níveis: LevelSpec + seed → Level.
 *
 * Mesma spec + mesma seed → nível idêntico (Princípio III). A avenida corre
 * em +Z com a rua centrada em x = 0; os prédios se alinham dos dois lados,
 * separados por becos. Paredes invisíveis ('bounds') fecham o mundo.
 *
 * A partir do L3 há vãos sem chão: a rua vira segmentos, nenhum prédio
 * invade o vão e gruas ancoráveis (logo fora do corredor da avenida) servem
 * de apoio para atravessá-lo. Cair no vão (abaixo de killY) leva ao último
 * checkpoint — com o relógio correndo.
 *
 * Lançadores de mísseis ficam nos telhados — ou no topo das gruas, quando o
 * ponto cai sobre um vão (atravessar o vão sob fogo) — espaçados ao longo do
 * percurso (em pares dos dois lados nas fases com fogo cruzado).
 */

import type { Checkpoint, Launcher, Level, LevelSpec, Range, Solid, SolidKind, ZRange } from '../types';
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

/** Lançadores ficam nesta faixa de Z (longe da largada e da chegada). */
const LAUNCHER_Z_FROM = 70;
const LAUNCHER_BEFORE_FINISH = 40;
/**
 * A cabeça fica 0,5 m para dentro da quina do telhado e 2 m acima dele. Mais
 * recuada/baixa, a própria laje tapava a vista de quem passa pela avenida
 * (com 1 m / 1,5 m só ~50% das posições no alcance eram visíveis; assim ~97%).
 * Sobra um ponto cego logo abaixo do lançador, colado à fachada.
 */
const LAUNCHER_ROOF_INSET = 0.5;
const LAUNCHER_HEIGHT = 2;
const LAUNCHER_MIN_ROOF = 15;
const LAUNCHER_SEARCH = 40;

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

/** Prédio comum ou grua do lado `side`, com topo alto o bastante, mais perto de `z`. */
function pickRoof(solids: readonly Solid[], side: -1 | 1, z: number): Solid | null {
  let best: Solid | null = null;
  let bestDist = Infinity;
  for (const s of solids) {
    if ((s.kind !== 'building' && s.kind !== 'crane') || s.side !== side || s.box.max.y < LAUNCHER_MIN_ROOF) continue;
    const zc = Math.min(Math.max(z, s.box.min.z), s.box.max.z);
    const d = Math.abs(zc - z);
    if (d <= LAUNCHER_SEARCH && d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Lançadores igualmente espaçados entre LAUNCHER_Z_FROM e a chegada, alternando
 * os lados (ou em pares, com fogo cruzado). Determinístico, sem PRNG.
 */
function placeLaunchers(spec: LevelSpec, solids: readonly Solid[]): Launcher[] {
  const t = spec.threats;
  if (t.launchers <= 0) return [];
  const slots = t.crossfire ? Math.ceil(t.launchers / 2) : t.launchers;
  const zFrom = LAUNCHER_Z_FROM;
  const zTo = spec.length - LAUNCHER_BEFORE_FINISH;
  const drafts: Omit<Launcher, 'id'>[] = [];
  for (let k = 0; k < slots; k++) {
    const z = zFrom + ((zTo - zFrom) * (k + 0.5)) / slots;
    const sides: (-1 | 1)[] = t.crossfire ? [-1, 1] : [k % 2 === 0 ? -1 : 1];
    for (const side of sides) {
      if (drafts.length >= t.launchers) break;
      const b = pickRoof(solids, side, z);
      if (!b) continue;
      const margin = Math.min(2, (b.box.max.z - b.box.min.z) / 2);
      const lz = Math.min(Math.max(z, b.box.min.z + margin), b.box.max.z - margin);
      const x = side < 0 ? b.box.max.x - LAUNCHER_ROOF_INSET : b.box.min.x + LAUNCHER_ROOF_INSET;
      drafts.push({ pos: { x: cm(x), y: cm(b.box.max.y + LAUNCHER_HEIGHT), z: cm(lz) }, side, solidId: b.id });
    }
  }
  return drafts.sort((a, b) => a.pos.z - b.pos.z || a.pos.x - b.pos.x).map((d, id) => ({ ...d, id }));
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
  // ordem fixa de consumo do PRNG (sem vãos, L1/L2 geram a mesma cidade da Etapa 1)
  [rng, voids] = placeVoids(spec, rng);
  [rng, left] = buildSide(spec, -1, voids, [], rng);
  [rng, right] = buildSide(spec, 1, voids, left, rng);
  [rng, cranes] = buildCranes(spec, voids, rng);

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
    launchers: placeLaunchers(spec, solids),
    checkpoints: placeCheckpoints(spec, voids),
  };
}
