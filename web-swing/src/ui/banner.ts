/**
 * Faixa central durante o jogo: nome do nível + metas de tempo + 3-2-1,
 * "Já!" e o aviso de queda. (Os resultados do nível são uma tela de menu,
 * ui/menus.ts, desde a Etapa 3.)
 */

import { formatTime } from './format';

export interface CountdownInfo {
  readonly levelLabel: string;
  readonly value: number;
  readonly goldMs: number;
  readonly silverMs: number;
  readonly bestMs: number | null;
}

export interface Banner {
  showCountdown(info: CountdownInfo): void;
  showGo(): void;
  showRespawn(): void;
  hide(): void;
  dispose(): void;
}

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
    hide() {
      key = '';
      el.classList.remove('visible');
    },
    dispose() {
      el.remove();
    },
  };
}
