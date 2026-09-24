/**
 * Impulso (momentum) — o coração do ciclo "velocidade, habilidade e risco"
 * (ADR-022). Funções puras.
 *
 * Sobe com execução precisa: swing bem solto, soltura perfeita, flip.
 * Cai com erros: clique sem alvo, soltura ruim, flip atrasado.
 * Tropeços levam parte dele: tocar a rua, bater na parede, levar um míssil;
 * cair num vão zera. Sem nenhum acerto por alguns segundos, ele escorre.
 *
 * O nível de impulso não vira pontos: vira VELOCIDADE. applyMomentum()
 * devolve a config efetiva do tick físico — teto de velocidade no balanço,
 * boost da soltura, bombeio e assistência maiores e menos arrasto.
 */

import type { GameConfig, GameEvent, InputFrame, MomentumConfig, MomentumGainKind, MomentumLossReason, MomentumState, Player } from './types';
import { secondsToTicks } from './config';

export function createMomentum(): MomentumState {
  return { value: 0, chain: 0, idleTicks: 0, streetTicks: 0, roofTicks: 0, sinceReleaseTicks: Number.MAX_SAFE_INTEGER, best: 0 };
}

/** Nível exibido (0..max). */
export function momentumLevel(value: number): number {
  return Math.floor(value + 1e-9);
}

/**
 * Config efetiva do tick físico para um valor de impulso. Tudo cresce de
 * forma linear com o impulso (contínuo), então a sensação acompanha a barra.
 */
export function applyMomentum(config: GameConfig, value: number): GameConfig {
  if (value <= 0) return config;
  const m = config.momentum;
  const w = config.web;
  return {
    ...config,
    physics: { ...config.physics, airDragQuad: config.physics.airDragQuad * Math.max(0, 1 - m.dragCutPerLevel * value) },
    web: {
      ...w,
      swingMaxSpeed: w.swingMaxSpeed + m.swingMaxPerLevel * value,
      releaseBoostMin: w.releaseBoostMin * (1 + m.boostPerLevel * value),
      releaseBoostMax: w.releaseBoostMax * (1 + m.boostPerLevel * value),
      swingAssist: w.swingAssist + m.assistPerLevel * value,
      pump: w.pump + m.pumpPerLevel * value,
    },
  };
}

export interface MomentumUpdate {
  readonly momentum: MomentumState;
  readonly events: readonly GameEvent[];
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Fatos do tick que a física não reporta como evento. */
export interface MomentumContext {
  /** O jogador foi atingido por um míssil neste tick (e o acerto valeu). */
  readonly hit: boolean;
}

/**
 * Atualiza o impulso a partir do que aconteceu no tick: eventos da física
 * (soltura, flip, clique sem alvo, bonk), acertos de míssil, o input (para
 * detectar flip atrasado) e o jogador depois do movimento (rua, telhado).
 */
export function updateMomentum(
  state: MomentumState,
  player: Player,
  prevPlayer: Player,
  physicsEvents: readonly GameEvent[],
  input: InputFrame,
  ctx: MomentumContext,
  config: GameConfig,
): MomentumUpdate {
  const m: MomentumConfig = config.momentum;
  const T = (seconds: number) => secondsToTicks(seconds, config.tickHz);
  const s: Mutable<MomentumState> = { ...state, sinceReleaseTicks: Math.min(state.sinceReleaseTicks + 1, Number.MAX_SAFE_INTEGER) };
  const events: GameEvent[] = [];
  let gained = false;

  const gain = (kind: MomentumGainKind, amount: number) => {
    s.value = Math.min(m.max, s.value + amount);
    s.chain += 1;
    s.best = Math.max(s.best, s.value);
    gained = true;
    events.push({ type: 'momentum_gain', kind, gain: amount, value: s.value });
  };
  const lose = (reason: MomentumLossReason, next: number) => {
    const to = Math.max(0, Math.min(s.value, next));
    if (to < s.value) events.push({ type: 'momentum_loss', reason, from: s.value, to });
    s.value = to;
    s.chain = 0;
  };

  let flipped = false;
  let jumped = false;
  let impulse = false;
  for (const e of physicsEvents) {
    if (e.type === 'web_released') {
      s.sinceReleaseTicks = 0;
      if (!e.fullSwing) continue; // toque curto: nem ganha nem perde
      if (e.perfect) gain('perfect', m.gainSwing + m.gainPerfect);
      else if (e.quality >= m.goodQuality) gain('swing', m.gainSwing);
      else if (e.quality < m.poorQuality) lose('poor_release', s.value - m.lossPoorRelease);
    } else if (e.type === 'flip') {
      flipped = true;
      gain('flip', m.gainFlip);
    } else if (e.type === 'web_missed') {
      lose('miss', s.value - m.lossMiss);
    } else if (e.type === 'bonk') {
      lose('bonk', s.value * m.keepOnBonk);
    } else if (e.type === 'jumped') {
      jumped = true;
    } else if (e.type === 'web_impulse') {
      impulse = true;
    }
  }

  // flip atrasado: o flip estava disponível (soltura completa no ar), a janela
  // fechou sem ele e o jogador apertou Espaço no ar pouco depois
  const airborne = !prevPlayer.grounded && !prevPlayer.rope;
  const windowClosed = Math.max(0, prevPlayer.flipWindowTicks - 1) === 0;
  if (
    input.jumpPressed &&
    airborne &&
    prevPlayer.flipAvailable &&
    windowClosed &&
    !flipped &&
    !jumped &&
    !impulse &&
    s.sinceReleaseTicks <= T(m.lateFlipWindow)
  ) {
    lose('late_flip', s.value - m.lossLateFlip);
  }

  if (ctx.hit) lose('hit', s.value * m.keepOnHit);

  // apoiado na rua (raspão curto não conta) ou parado num telhado
  const onStreet = player.grounded && player.groundKind === 'street';
  const onRoof = player.grounded && player.groundKind === 'roof';
  s.streetTicks = onStreet ? s.streetTicks + 1 : 0;
  s.roofTicks = onRoof ? s.roofTicks + 1 : 0;
  if (s.streetTicks === T(m.streetGrace) + 1) lose('street', s.value * m.keepOnStreet);

  // ociosidade (inclui ficar parado num telhado): o impulso escorre aos poucos
  s.idleTicks = gained ? 0 : s.idleTicks + 1;
  const idle = s.idleTicks > T(m.idleTimeout) || s.roofTicks > T(m.roofGrace);
  if (idle && s.value > 0) {
    const next = Math.max(0, s.value - m.idleDecay / config.tickHz);
    // só avisa quando cai um nível inteiro (sem enxurrada de eventos)
    if (momentumLevel(next) < momentumLevel(s.value)) events.push({ type: 'momentum_loss', reason: 'idle', from: s.value, to: next });
    s.value = next;
    if (next === 0) s.chain = 0;
  }

  return { momentum: s, events };
}

/** Queda num vão: o impulso zera. */
export function momentumOnFall(state: MomentumState): MomentumUpdate {
  const events: GameEvent[] = state.value > 0 ? [{ type: 'momentum_loss', reason: 'fall', from: state.value, to: 0 }] : [];
  return { momentum: { ...state, value: 0, chain: 0, idleTicks: 0, streetTicks: 0, roofTicks: 0 }, events };
}
