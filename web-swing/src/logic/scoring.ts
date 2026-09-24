/**
 * Pontuação (plano §2) — funções puras.
 *
 * - Anel: base × (1 + bônus de velocidade) × multiplicador. Renova o timer
 *   do combo, mas não soma no chain.
 * - Eventos de estilo (swing válido, soltura perfeita, flip, sequência de
 *   velocidade): pontos × multiplicador; cada um soma 1 no chain.
 * - Multiplicador: 1 + 0,5 a cada 4 eventos encadeados, até ×5.
 * - O combo quebra: > 150 ms na rua, > 1,2 s num teto, 3 s sem evento,
 *   bonk ou respawn. O tempo nunca vira pontos.
 */

import type { ComboBreakReason, GameConfig, GameEvent, Level, Player, ScoringConfig, StyleKind, StyleState } from './types';
import type { Vec3 } from './math/vec3';
import { length } from './math/vec3';
import { segmentCrossesDisc } from './math/geom';
import { secondsToTicks } from './config';

export function createStyle(): StyleState {
  return { chain: 0, comboTimerTicks: 0, speedStreakTicks: 0, streetTicks: 0, roofTicks: 0, bestMultiplier: 1 };
}

export function multiplierFor(chain: number, cfg: ScoringConfig): number {
  return Math.min(1 + cfg.multiplierStep * Math.floor(chain / cfg.chainPerStep), cfg.maxMultiplier);
}

export function speedBonusFor(speed: number, cfg: ScoringConfig): number {
  if (speed >= cfg.speedBonusFull) return 1;
  if (speed >= cfg.speedBonusHalf) return 0.5;
  return 0;
}

export function ringPoints(gold: boolean, speed: number, chain: number, cfg: ScoringConfig): number {
  const base = gold ? cfg.goldRingBase : cfg.ringBase;
  return Math.round(base * (1 + speedBonusFor(speed, cfg)) * multiplierFor(chain, cfg));
}

/** Centro do corpo (a caixa do jogador vai dos pés até a altura). */
export function bodyCenter(feet: Vec3, height: number): Vec3 {
  return { x: feet.x, y: feet.y + height / 2, z: feet.z };
}

/** Ids dos anéis ainda não coletados que o corpo atravessou indo de `from` a `to`. */
export function crossedRings(level: Level, collected: readonly boolean[], from: Vec3, to: Vec3, cfg: ScoringConfig): number[] {
  const zMin = Math.min(from.z, to.z) - 10;
  const zMax = Math.max(from.z, to.z) + 10;
  const hits: number[] = [];
  for (const ring of level.rings) {
    if (collected[ring.id] || ring.center.z < zMin || ring.center.z > zMax) continue;
    if (segmentCrossesDisc(from, to, ring.center, ring.normal, ring.radius + cfg.ringSlack)) hits.push(ring.id);
  }
  return hits;
}

export interface StyleUpdate {
  readonly style: StyleState;
  readonly ringPoints: number;
  readonly stylePoints: number;
  readonly events: readonly GameEvent[];
  /** Pousou na rua neste tick (perde o bônus "sem tocar a rua"). */
  readonly landedOnStreet: boolean;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Atualiza o combo e os pontos a partir do que aconteceu no tick: eventos da
 * física (soltura, flip, bonk, pouso), anéis atravessados e o estado do
 * jogador depois do movimento.
 */
export function updateStyle(
  style: StyleState,
  player: Player,
  physicsEvents: readonly GameEvent[],
  ringIds: readonly number[],
  level: Level,
  config: GameConfig,
): StyleUpdate {
  const cfg = config.scoring;
  const T = (seconds: number) => secondsToTicks(seconds, config.tickHz);
  const s: Mutable<StyleState> = { ...style };
  const events: GameEvent[] = [];
  const speed = length(player.vel);
  let ringPts = 0;
  let stylePts = 0;
  let renewed = false;
  let landedOnStreet = false;

  const renew = () => {
    s.comboTimerTicks = T(cfg.comboTimeout);
    renewed = true;
  };
  const award = (kind: StyleKind, base: number) => {
    const multiplier = multiplierFor(s.chain, cfg);
    const points = Math.round(base * multiplier);
    stylePts += points;
    s.chain += 1;
    s.bestMultiplier = Math.max(s.bestMultiplier, multiplierFor(s.chain, cfg));
    renew();
    events.push({ type: 'style', kind, points, multiplier });
  };
  const breakCombo = (reason: ComboBreakReason) => {
    if (s.chain > 0) events.push({ type: 'combo_lost', reason, chain: s.chain });
    s.chain = 0;
    s.comboTimerTicks = 0;
    s.speedStreakTicks = 0;
  };

  // anéis: não somam no chain, mas renovam o timer
  for (const id of ringIds) {
    const ring = level.rings[id];
    const points = ringPoints(ring.gold, speed, s.chain, cfg);
    ringPts += points;
    events.push({ type: 'ring_collected', ringId: id, gold: ring.gold, points, speedBonus: speedBonusFor(speed, cfg) });
    if (s.chain > 0) renew();
  }

  // eventos de estilo e quebras vindos da física
  for (const e of physicsEvents) {
    if (e.type === 'web_released') {
      if (e.fullSwing && e.speed >= cfg.swingMinSpeed) award('swing', cfg.swingPoints);
      if (e.perfect) award('perfect', cfg.perfectPoints);
    } else if (e.type === 'flip') {
      award('flip', e.afterPerfect ? cfg.flipAfterPerfectPoints : cfg.flipPoints);
    } else if (e.type === 'bonk') {
      breakCombo('bonk');
    } else if (e.type === 'landed' && e.kind === 'street') {
      landedOnStreet = true;
    }
  }

  // sequência de velocidade: evento discreto a cada N s contínuos acima do limiar
  if (speed >= cfg.speedStreakSpeed) {
    s.speedStreakTicks += 1;
    if (s.speedStreakTicks >= T(cfg.speedStreakTime)) {
      s.speedStreakTicks = 0;
      award('speed', cfg.speedStreakPoints);
    }
  } else {
    s.speedStreakTicks = 0;
  }

  // apoiado na rua (raspão curto não conta) ou parado num teto
  const onStreet = player.grounded && player.groundKind === 'street';
  const onRoof = player.grounded && player.groundKind === 'roof';
  s.streetTicks = onStreet ? s.streetTicks + 1 : 0;
  s.roofTicks = onRoof ? s.roofTicks + 1 : 0;
  if (s.streetTicks > T(cfg.streetGrace)) breakCombo('street');
  if (s.roofTicks > T(cfg.roofGrace)) breakCombo('roof');

  // timeout: 3 s sem nenhum evento que renove o combo
  if (s.chain > 0 && !renewed) {
    s.comboTimerTicks -= 1;
    if (s.comboTimerTicks <= 0) breakCombo('timeout');
  }

  return { style: s, ringPoints: ringPts, stylePoints: stylePts, events, landedOnStreet };
}

/** Quebra o combo por fora (ex.: respawn). */
export function breakStyle(style: StyleState, reason: ComboBreakReason): { style: StyleState; events: GameEvent[] } {
  const events: GameEvent[] = style.chain > 0 ? [{ type: 'combo_lost', reason, chain: style.chain }] : [];
  return { style: { ...style, chain: 0, comboTimerTicks: 0, speedStreakTicks: 0 }, events };
}
