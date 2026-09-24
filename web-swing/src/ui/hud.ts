/**
 * HUD (Etapa 2A): pontos do nível e da campanha, multiplicador com barra de
 * progresso até o próximo degrau, anéis (com a cota), vidas e o nome do
 * nível; popups curtos para cada evento de pontuação. DOM puro: só escreve
 * quando o valor muda; os popups vêm de um pool fixo de 8 elementos.
 */

import type { ComboBreakReason, GameEvent, StyleKind } from '../logic/types';

export interface HudData {
  readonly levelLabel: string;
  readonly levelScore: number;
  readonly runScore: number;
  readonly lives: number;
  readonly maxLives: number;
  readonly multiplier: number;
  readonly chain: number;
  /** Progresso até o próximo degrau do multiplicador, em [0, 1]. */
  readonly chainProgress: number;
  readonly rings: number;
  readonly ringsTotal: number;
  readonly quota: number;
}

export interface Hud {
  update(d: HudData): void;
  /** Mostra popups para os eventos do frame. */
  popups(events: readonly GameEvent[]): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const POOL_SIZE = 8;

const STYLE_LABEL: Record<StyleKind, string> = {
  swing: 'Swing',
  perfect: 'Soltura perfeita!',
  flip: 'Flip!',
  speed: 'Velocidade!',
};

const COMBO_LOST: Record<ComboBreakReason, string> = {
  street: 'Combo perdido — tocou a rua',
  roof: 'Combo perdido — parado no telhado',
  timeout: 'Combo perdido — sem manobras',
  bonk: 'Combo perdido — bateu!',
  respawn: 'Combo perdido',
};

const fmt = (n: number) => n.toLocaleString('pt-BR');

export function createHud(root: HTMLElement): Hud {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = `
    <div class="hud-left">
      <div class="hud-level"></div>
      <div class="hud-lives" aria-label="vidas"></div>
      <div class="hud-rings"><span class="hud-ring-icon" aria-hidden="true"></span><span class="hud-rings-text"></span></div>
    </div>
    <div class="hud-right">
      <div class="hud-score" aria-live="off"></div>
      <div class="hud-run"></div>
      <div class="hud-combo">
        <span class="hud-mult"></span>
        <span class="hud-bar"><span class="hud-bar-fill"></span></span>
      </div>
    </div>
    <div class="hud-popups"></div>`;
  root.appendChild(el);
  const q = <T extends HTMLElement>(sel: string) => el.querySelector(sel) as T;
  const level = q('.hud-level');
  const lives = q('.hud-lives');
  const rings = q('.hud-rings-text');
  const score = q('.hud-score');
  const run = q('.hud-run');
  const combo = q('.hud-combo');
  const mult = q('.hud-mult');
  const fill = q('.hud-bar-fill');
  const popupRoot = q('.hud-popups');

  const pool: HTMLElement[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const p = document.createElement('div');
    p.className = 'hud-popup';
    popupRoot.appendChild(p);
    pool.push(p);
  }
  let next = 0;
  // popups do mesmo instante (ex.: swing + flip) empilham em vez de se sobrepor
  let stack = 0;
  let lastPopupAt = -Infinity;
  const cache = new Map<HTMLElement, string>();
  const set = (node: HTMLElement, text: string) => {
    if (cache.get(node) === text) return;
    cache.set(node, text);
    node.textContent = text;
  };

  function popup(text: string, kind: 'good' | 'gold' | 'bad' | 'info') {
    const p = pool[next];
    next = (next + 1) % POOL_SIZE;
    const now = performance.now();
    stack = now - lastPopupAt < 450 ? (stack + 1) % 4 : 0;
    lastPopupAt = now;
    p.style.top = `${stack * 28}px`;
    p.textContent = text;
    p.dataset.kind = kind;
    // reinicia a animação CSS
    p.classList.remove('show');
    void p.offsetWidth;
    p.classList.add('show');
  }

  return {
    update(d) {
      set(level, d.levelLabel);
      set(lives, '♥'.repeat(Math.max(0, d.lives)) + '♡'.repeat(Math.max(0, d.maxLives - d.lives)));
      set(rings, `${d.rings} / ${d.ringsTotal}${d.quota > 0 ? `  (cota ${d.quota})` : ''}`);
      rings.dataset.state = d.rings >= d.quota ? 'ok' : 'short';
      set(score, fmt(d.levelScore));
      set(run, d.runScore > 0 ? `campanha ${fmt(d.runScore)}` : '');
      set(mult, `×${d.multiplier.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}`);
      combo.dataset.active = d.chain > 0 ? 'yes' : 'no';
      const pct = `${Math.round(d.chainProgress * 100)}%`;
      if (fill.style.width !== pct) fill.style.width = pct;
    },
    popups(events) {
      for (const e of events) {
        if (e.type === 'ring_collected') popup(`+${fmt(e.points)} ${e.gold ? 'Anel dourado!' : 'Anel'}${e.speedBonus > 0 ? ' (velocidade)' : ''}`, e.gold ? 'gold' : 'good');
        else if (e.type === 'style') popup(`+${fmt(e.points)} ${STYLE_LABEL[e.kind]}${e.multiplier > 1 ? ` ×${e.multiplier}` : ''}`, 'good');
        else if (e.type === 'combo_lost') popup(COMBO_LOST[e.reason], 'bad');
        else if (e.type === 'checkpoint') popup(`Checkpoint ${e.index}`, 'info');
        else if (e.type === 'life_lost' && e.reason !== 'quota') popup('−1 vida', 'bad');
      }
    },
    setVisible(visible) {
      el.style.display = visible ? '' : 'none';
    },
    dispose() {
      el.remove();
    },
  };
}
