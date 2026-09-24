/**
 * Faixa central (UI mínima até a Etapa 3): nome do nível + metas de tempo +
 * 3-2-1, aviso de queda e o resumo do nível concluído (Enter para seguir).
 */

import type { LevelResult } from '../logic/types';
import { formatDelta, formatTime } from './format';

export interface CountdownInfo {
  readonly levelLabel: string;
  readonly value: number;
  readonly goldMs: number;
  readonly silverMs: number;
  readonly bestMs: number | null;
}

export interface LevelCompleteInfo {
  readonly result: LevelResult;
  readonly timeMs: number;
  /** Recorde do nível ANTES desta tentativa (null = primeira vez). */
  readonly previousBestMs: number | null;
  readonly goldMs: number;
  readonly silverMs: number;
  /** Tempo acumulado da campanha até aqui. */
  readonly runTimeMs: number;
  readonly isLastLevel: boolean;
  /** false: run de teste (não grava recorde). */
  readonly ranked: boolean;
}

export interface Banner {
  showCountdown(info: CountdownInfo): void;
  showGo(): void;
  showRespawn(): void;
  showLevelComplete(info: LevelCompleteInfo): void;
  hide(): void;
  dispose(): void;
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
const fmtMomentum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export function createBanner(root: HTMLElement): Banner {
  const el = document.createElement('div');
  el.className = 'banner';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  root.appendChild(el);
  let key = '';

  function show(k: string, kind: string, html: string) {
    if (key === k) return;
    key = k;
    el.dataset.kind = kind;
    el.innerHTML = html;
    el.classList.add('visible');
  }

  return {
    showCountdown(c) {
      const goals = `★★★ ${formatTime(c.goldMs)} · ★★ ${formatTime(c.silverMs)}${c.bestMs !== null ? ` · recorde ${formatTime(c.bestMs)}` : ''}`;
      show(
        `cd:${c.levelLabel}:${c.value}`,
        'countdown',
        `<div class="banner-sub">${c.levelLabel}</div><div class="banner-big">${c.value}</div><div class="banner-goals">${goals}</div>`,
      );
    },
    showGo() {
      show('go', 'countdown', '<div class="banner-big">Já!</div>');
    },
    showRespawn() {
      show('resp', 'bad', '<div class="banner-title">Caiu!</div><div class="banner-sub">Voltando ao checkpoint — o relógio continua correndo…</div>');
    },
    showLevelComplete(c) {
      const r = c.result;
      const record = c.ranked && (c.previousBestMs === null || c.timeMs < c.previousBestMs);
      const vsBest =
        c.previousBestMs === null
          ? ''
          : `<li>vs. recorde <b class="${c.timeMs < c.previousBestMs ? 'delta-good' : 'delta-bad'}">${formatDelta(c.timeMs - c.previousBestMs)}</b></li>`;
      const nextGoal =
        r.stars === 3
          ? ''
          : `<li class="banner-muted">${r.stars === 2 ? '★★★' : '★★'} em ${formatTime(r.stars === 2 ? c.goldMs : c.silverMs)} <b>faltou ${formatDelta(c.timeMs - (r.stars === 2 ? c.goldMs : c.silverMs)).slice(1)} s</b></li>`;
      show(
        `done:${r.levelIndex}:${r.timeTicks}`,
        'good',
        `<div class="banner-title">${record ? 'Novo recorde!' : 'Nível concluído!'}</div>
         <div class="banner-time">${formatTime(c.timeMs)}</div>
         <div class="banner-stars" aria-label="${r.stars} de 3 estrelas">${stars(r.stars)}</div>
         <ul class="banner-list">
           ${vsBest}
           ${nextGoal}
           <li>Impulso máximo <b>×${fmtMomentum(r.bestMomentum)}</b></li>
           <li>Soltura perfeita / flips <b>${r.perfects} / ${r.flips}</b></li>
           <li>Mísseis levados / quedas <b>${r.hits} / ${r.falls}</b></li>
           <li class="banner-total">Campanha <b>${formatTime(c.runTimeMs)}</b></li>
           ${c.ranked ? '' : '<li class="banner-muted">Run de teste: não grava recorde</li>'}
         </ul>
         <div class="banner-hint"><kbd>Enter</kbd> ${c.isLastLevel ? 'para ver o resultado' : 'para o próximo nível'}</div>`,
      );
    },
    hide() {
      key = '';
      el.classList.remove('visible');
    },
    dispose() {
      el.remove();
    },
  };
}
