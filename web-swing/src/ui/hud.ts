/**
 * HUD da corrida contra o relógio: à esquerda o nível, o cronômetro, a
 * próxima estrela em jogo e o recorde; à direita a velocidade, o medidor de
 * impulso (5 segmentos, o atual enchendo) e o combo. Popups curtos para
 * ganhos/perdas de impulso e checkpoints; flash vermelho ao levar míssil.
 * DOM puro: só escreve quando o valor muda; popups vêm de um pool fixo.
 */

import type { GameEvent, MomentumGainKind, MomentumLossReason } from '../logic/types';
import { formatTime } from './format';

export interface HudData {
  readonly levelLabel: string;
  readonly timeMs: number;
  /** Próxima estrela ainda possível: 3 (ouro), 2 (prata) ou 1 (só concluir). */
  readonly targetStars: 1 | 2 | 3;
  /** Limite da próxima estrela (ms); null quando só resta ★. */
  readonly targetMs: number | null;
  readonly bestMs: number | null;
  /** m/s */
  readonly speed: number;
  readonly momentum: number;
  readonly momentumMax: number;
  readonly chain: number;
  readonly stunned: boolean;
}

export interface Hud {
  update(d: HudData): void;
  /** Popups e flashes para os eventos do frame. */
  popups(events: readonly GameEvent[], tickHz: number): void;
  /** Aviso curto avulso (ex.: "Som desligado"). */
  notice(text: string): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const POOL_SIZE = 8;

const GAIN_LABEL: Record<MomentumGainKind, string> = {
  swing: 'Swing',
  perfect: 'Soltura perfeita!',
  flip: 'Flip!',
};

/** Perdas com popup próprio (queda e acerto de míssil já têm aviso maior). */
const LOSS_LABEL: Partial<Record<MomentumLossReason, string>> = {
  miss: 'Teia no vazio',
  poor_release: 'Soltura ruim',
  late_flip: 'Flip atrasado',
  street: 'Tocou a rua — impulso pela metade',
  idle: 'Impulso esfriando',
  bonk: 'Bateu!',
};

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function createHud(root: HTMLElement): Hud {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = `
    <div class="hud-left">
      <div class="hud-level"></div>
      <div class="hud-time" aria-live="off"></div>
      <div class="hud-target"></div>
      <div class="hud-best"></div>
    </div>
    <div class="hud-right">
      <div class="hud-speed"><span class="hud-speed-num"></span><span class="hud-speed-unit">m/s</span></div>
      <div class="hud-momentum" aria-label="impulso">
        <span class="hud-momentum-label">Impulso</span>
        <span class="hud-segs"></span>
        <span class="hud-momentum-level"></span>
      </div>
      <div class="hud-chain"></div>
    </div>
    <div class="hud-popups"></div>
    <div class="hud-flash"></div>`;
  root.appendChild(el);
  const q = <T extends HTMLElement>(sel: string) => el.querySelector(sel) as T;
  const level = q('.hud-level');
  const time = q('.hud-time');
  const target = q('.hud-target');
  const best = q('.hud-best');
  const speed = q('.hud-speed-num');
  const momentum = q('.hud-momentum');
  const segsRoot = q('.hud-segs');
  const momentumLevel = q('.hud-momentum-level');
  const chain = q('.hud-chain');
  const popupRoot = q('.hud-popups');
  const flash = q('.hud-flash');

  const segs: HTMLElement[] = [];
  let segCount = 0;
  function ensureSegs(n: number) {
    if (n === segCount) return;
    segsRoot.innerHTML = '';
    segs.length = 0;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'hud-seg';
      s.innerHTML = '<span class="hud-seg-fill"></span>';
      segsRoot.appendChild(s);
      segs.push(s.firstElementChild as HTMLElement);
    }
    segCount = n;
  }

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
  const setData = (node: HTMLElement, key: string, value: string) => {
    if (node.dataset[key] !== value) node.dataset[key] = value;
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

  function restart(node: HTMLElement, cls: string) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  return {
    update(d) {
      set(level, d.levelLabel);
      set(time, formatTime(d.timeMs));
      set(target, d.targetMs === null ? stars(1) : `${stars(d.targetStars)} até ${formatTime(d.targetMs)}`);
      setData(target, 'stars', String(d.targetStars));
      set(best, d.bestMs === null ? '' : `recorde ${formatTime(d.bestMs)}`);
      set(speed, String(Math.round(d.speed)));

      ensureSegs(d.momentumMax);
      const v = Math.max(0, Math.min(d.momentumMax, d.momentum));
      for (let i = 0; i < segs.length; i++) {
        const pct = `${Math.round(Math.max(0, Math.min(1, v - i)) * 100)}%`;
        if (segs[i].style.width !== pct) segs[i].style.width = pct;
      }
      const lvl = Math.floor(v + 1e-9);
      set(momentumLevel, lvl > 0 ? `×${lvl}` : '');
      setData(momentum, 'level', String(lvl));
      setData(momentum, 'stunned', d.stunned ? 'yes' : 'no');
      set(chain, d.chain > 1 ? `combo ${d.chain}` : '');
    },
    popups(events, tickHz) {
      for (const e of events) {
        if (e.type === 'momentum_gain') {
          const levelUp = Math.floor(e.value + 1e-9) > Math.floor(e.value - e.gain + 1e-9);
          popup(levelUp ? `${GAIN_LABEL[e.kind]}  Impulso ×${Math.floor(e.value + 1e-9)}!` : GAIN_LABEL[e.kind], e.kind === 'swing' ? 'good' : 'gold');
        } else if (e.type === 'momentum_loss') {
          const label = LOSS_LABEL[e.reason];
          if (label && e.from - e.to >= 0.1) popup(label, 'bad');
        } else if (e.type === 'player_hit') {
          popup('Atingido!', 'bad');
          restart(flash, 'show');
        } else if (e.type === 'checkpoint') {
          popup(`Checkpoint ${e.index} · ${formatTime((e.timeTicks * 1000) / tickHz)}`, 'info');
        }
      }
    },
    notice(text) {
      popup(text, 'info');
    },
    setVisible(visible) {
      el.style.display = visible ? '' : 'none';
    },
    dispose() {
      el.remove();
    },
  };
}
