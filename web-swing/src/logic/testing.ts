/**
 * Utilidades para testes: monta níveis sob medida (cenários controlados) e
 * inputs. Puro — fica em logic/ e passa pelo teste de arquitetura, mas só é
 * importado por arquivos *.test.ts (fica fora do bundle).
 */

import type { Checkpoint, GameConfig, GameState, InputFrame, Level, Player, Ring, Rope, SolidKind, ZRange } from './types';
import type { Vec3 } from './math/vec3';
import { buildBroadphase } from './level/broadphase';
import { LEVEL_SPECS } from './level/specs';
import { DEFAULT_GAME_CONFIG } from './config';
import { createGame, NEUTRAL_INPUT, step } from './engine';
import { cameraPivot } from './camera-rig';

export interface TestBox {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly kind?: SolidKind;
  readonly side?: -1 | 0 | 1;
}

export interface TestLevelOptions {
  readonly start?: Vec3;
  readonly rings?: readonly Ring[];
  readonly checkpoints?: readonly Checkpoint[];
  readonly ringQuota?: number;
  readonly finishZ?: number;
  /** Trechos de Z sem rua (vãos). */
  readonly voids?: readonly ZRange[];
}

/** Nível com rua enorme (y ≤ 0, com buracos nos vãos) + as caixas dadas. */
export function makeTestLevel(boxes: readonly TestBox[], opts: TestLevelOptions = {}): Level {
  const voids = opts.voids ?? [];
  const streets: TestBox[] = [];
  let z0 = -500;
  for (const v of voids) {
    streets.push({ min: { x: -500, y: -1, z: z0 }, max: { x: 500, y: 0, z: v.start }, kind: 'street', side: 0 });
    z0 = v.end;
  }
  streets.push({ min: { x: -500, y: -1, z: z0 }, max: { x: 500, y: 0, z: 2000 }, kind: 'street', side: 0 });
  const drafts: TestBox[] = [...streets, ...boxes];
  const sorted = [...drafts].sort((a, b) => a.min.z - b.min.z || a.min.x - b.min.x);
  const solids = sorted.map((b, id) => {
    const kind = b.kind ?? 'building';
    return { id, box: { min: b.min, max: b.max }, kind, anchorable: kind === 'building' || kind === 'crane', side: b.side ?? 0 };
  });
  return {
    spec: LEVEL_SPECS[0],
    seed: 0,
    solids,
    broadphase: buildBroadphase(solids),
    start: opts.start ?? { x: 0, y: 0, z: 0 },
    finishZ: opts.finishZ ?? 1000,
    killY: -25,
    halfWorldWidth: 500,
    voids,
    rings: opts.rings ?? [],
    checkpoints: opts.checkpoints ?? [],
    ringQuota: opts.ringQuota ?? 0,
  };
}

export function input(partial: Partial<InputFrame> = {}): InputFrame {
  return { ...NEUTRAL_INPUT, ...partial };
}

/** Estado de jogo com o jogador sobrescrito (posição, velocidade etc.). */
export function stateWith(level: Level, player: Partial<Player>, config: GameConfig = DEFAULT_GAME_CONFIG): GameState {
  const s = createGame(level, config);
  return { ...s, player: { ...s.player, ...player } };
}

/** Roda n ticks com o mesmo input, chamando onTick após cada um. */
export function runTicks(
  state: GameState,
  n: number,
  frame: InputFrame | ((tick: number, s: GameState) => InputFrame),
  onTick?: (s: GameState) => void,
): GameState {
  let s = state;
  for (let i = 0; i < n; i++) {
    s = step(s, typeof frame === 'function' ? frame(i, s) : frame);
    onTick?.(s);
  }
  return s;
}

/** yaw/pitch para a câmera lógica (pivô no ombro) olhar para `target` a partir dos pés em `feet`. */
export function lookAtFrom(feet: Vec3, target: Vec3, config: GameConfig = DEFAULT_GAME_CONFIG): { yaw: number; pitch: number } {
  let yaw = Math.atan2(target.x - feet.x, target.z - feet.z);
  let pitch = 0;
  for (let i = 0; i < 4; i++) {
    // o pivô depende do yaw (ombro direito): itera até convergir
    const pivot = cameraPivot(feet, yaw, config.rig);
    const d = { x: target.x - pivot.x, y: target.y - pivot.y, z: target.z - pivot.z };
    yaw = Math.atan2(d.x, d.z);
    pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  }
  return { yaw, pitch };
}

/** Corda com apoio físico exatamente em `anchor` (sem âncora virtual), para cenários controlados. */
export function ropeAt(anchor: Vec3, length: number, targetLength = length): Rope {
  return { anchor, contact: anchor, solidId: 0, length, targetLength, heldTicks: 0, impulseUsed: false, fromGround: false };
}
