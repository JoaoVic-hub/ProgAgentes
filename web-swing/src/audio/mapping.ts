/**
 * Mapeamento puro dos eventos do jogo para "cues" de som (Etapa 4).
 *
 * Nada de WebAudio aqui: é testável em Node. O motor (audio/engine.ts) só
 * sintetiza o que sai daqui. Regras:
 *   - ganho sempre em [0, MAX_GAIN]; frequências limitadas a uma faixa audível e agradável;
 *   - sons de ameaça (aviso, disparo, explosão) atenuam com a distância;
 *   - o tom do ganho de impulso SOBE com o nível (escala pentatônica), o da perda desce.
 */

import type { GameEvent } from '../logic/types';
import type { Vec3 } from '../logic/math/vec3';

export type Cue =
  | { readonly kind: 'thwip' }
  | { readonly kind: 'release'; readonly perfect: boolean }
  | { readonly kind: 'flip' }
  | { readonly kind: 'jump' }
  | { readonly kind: 'land'; readonly intensity: number }
  | { readonly kind: 'bonk'; readonly intensity: number }
  | { readonly kind: 'miss' }
  | { readonly kind: 'gain'; readonly freq: number; readonly levelUp: boolean }
  | { readonly kind: 'loss'; readonly amount: number }
  | { readonly kind: 'warn'; readonly gain: number }
  | { readonly kind: 'launch'; readonly gain: number }
  | { readonly kind: 'explosion'; readonly gain: number }
  | { readonly kind: 'hit' }
  | { readonly kind: 'checkpoint' }
  | { readonly kind: 'countdown' }
  | { readonly kind: 'go' }
  | { readonly kind: 'fall' }
  | { readonly kind: 'finish' }
  | { readonly kind: 'victory' }
  | { readonly kind: 'proximity' }
  | { readonly kind: 'ui' };

export interface CueContext {
  /** Onde o jogador está (para atenuar as ameaças). */
  readonly listener: Vec3;
  /** Posição do lançador pelo id (null se não existir). */
  readonly launcherPos: (id: number) => Vec3 | null;
  /** Nível máximo de impulso (para a perda proporcional). */
  readonly momentumMax: number;
}

export const MAX_GAIN = 1;
/** Base da escada de tons do impulso (sol 4). */
export const GAIN_BASE_HZ = 392;
/** Teto de frequência de qualquer tom musical gerado aqui. */
export const MAX_TONE_HZ = 2400;
const PENTATONIC = [0, 2, 4, 7, 9];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Frequência do "plim" de ganho: um degrau da pentatônica a cada 0,5 de impulso, limitada. */
export function gainFrequency(value: number): number {
  const step = Math.max(0, Math.round(value * 2));
  const octave = Math.floor(step / PENTATONIC.length);
  const semis = octave * 12 + PENTATONIC[step % PENTATONIC.length];
  return Math.min(MAX_TONE_HZ, GAIN_BASE_HZ * Math.pow(2, semis / 12));
}

/** Atenuação por distância: 1 até `near`, 0 a partir de `far`, curva quadrática no meio. */
export function distanceGain(dist: number, near = 12, far = 130): number {
  if (!(dist > near)) return 1;
  if (dist >= far) return 0;
  const t = 1 - (dist - near) / (far - near);
  return t * t;
}

/** Intensidade de impacto em [0, 1] a partir da velocidade. */
export function impactIntensity(speed: number, min: number, max: number): number {
  return clamp01((speed - min) / (max - min));
}

/** Vento: ganho (≤ 0,35) e corte do filtro (Hz) crescendo com a velocidade. */
export function windParams(speed: number): { gain: number; cutoff: number } {
  const t = clamp01((speed - 8) / (52 - 8));
  return { gain: 0.35 * t * t, cutoff: 300 + 2200 * t };
}

/**
 * Bipe de proximidade (míssil chegando): intervalo em segundos pela urgência
 * do radar, ou null quando não há perigo real. Mais perto = mais rápido.
 */
export function proximityInterval(urgency: number): number | null {
  if (!(urgency >= 0.45)) return null;
  const t = clamp01((urgency - 0.45) / 0.55);
  return 0.5 - 0.42 * t;
}

/** Número mostrado no countdown (3, 2, 1) a partir dos ticks restantes. */
export function countdownValue(phaseTicks: number, tickHz: number): number {
  return Math.max(1, Math.ceil(phaseTicks / tickHz));
}

function distanceTo(ctx: CueContext, p: Vec3 | null): number {
  if (!p) return Infinity;
  return Math.hypot(p.x - ctx.listener.x, p.y - ctx.listener.y, p.z - ctx.listener.z);
}

/** Cues dos eventos de um frame (a ordem dos eventos é mantida). */
export function cuesFor(events: readonly GameEvent[], ctx: CueContext): Cue[] {
  const out: Cue[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'jumped':
        out.push({ kind: 'jump' });
        break;
      case 'landed': {
        const intensity = impactIntensity(e.speed, 4, 26);
        if (intensity > 0.05) out.push({ kind: 'land', intensity });
        break;
      }
      case 'web_attached':
        out.push({ kind: 'thwip' });
        break;
      case 'web_missed':
        out.push({ kind: 'miss' });
        break;
      case 'web_released':
        if (e.fullSwing) out.push({ kind: 'release', perfect: e.perfect });
        break;
      case 'web_impulse':
      case 'flip':
        out.push({ kind: 'flip' });
        break;
      case 'bonk':
        out.push({ kind: 'bonk', intensity: impactIntensity(e.speed, 20, 45) });
        break;
      case 'momentum_gain': {
        const levelUp = Math.floor(e.value + 1e-9) > Math.floor(e.value - e.gain + 1e-9);
        out.push({ kind: 'gain', freq: gainFrequency(e.value), levelUp });
        break;
      }
      case 'momentum_loss':
        // queda e míssil têm som próprio
        if (e.reason !== 'fall' && e.reason !== 'hit') out.push({ kind: 'loss', amount: clamp01((e.from - e.to) / Math.max(1, ctx.momentumMax / 2)) });
        break;
      case 'launcher_aiming': {
        // o aviso nunca some de todo: é a deixa para desviar
        const g = distanceGain(distanceTo(ctx, ctx.launcherPos(e.launcherId)));
        out.push({ kind: 'warn', gain: Math.max(0.35, g) });
        break;
      }
      case 'missile_launched': {
        const g = distanceGain(distanceTo(ctx, ctx.launcherPos(e.launcherId)));
        if (g > 0) out.push({ kind: 'launch', gain: g });
        break;
      }
      case 'missile_exploded': {
        if (e.hitPlayer) break; // o acerto tem som próprio
        const g = distanceGain(distanceTo(ctx, e.pos));
        if (g > 0) out.push({ kind: 'explosion', gain: g });
        break;
      }
      case 'player_hit':
        out.push({ kind: 'hit' });
        break;
      case 'checkpoint':
        out.push({ kind: 'checkpoint' });
        break;
      case 'go':
        out.push({ kind: 'go' });
        break;
      case 'fell':
        out.push({ kind: 'fall' });
        break;
      case 'level_complete':
        out.push({ kind: 'finish' });
        break;
      case 'victory':
        out.push({ kind: 'victory' });
        break;
      default:
        break;
    }
  }
  return out;
}
