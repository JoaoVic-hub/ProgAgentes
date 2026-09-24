/**
 * Retículo no centro da tela: ○ = há alvo para a teia, ✕ = sem alvo (com o
 * motivo em texto pequeno: fora de alcance, baixo demais, vidro...).
 * Some enquanto a teia está presa.
 */

import type { AimFailReason, AimResult } from '../logic/types';

const REASONS: Record<Exclude<AimFailReason, null>, string> = {
  sky: '',
  range: 'fora de alcance',
  low: 'baixo demais',
  glass: 'vidro não segura teia',
  behind: '',
  blocked: 'caminho obstruído',
};

export interface Crosshair {
  update(aim: AimResult, swinging: boolean): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export function createCrosshair(root: HTMLElement): Crosshair {
  const el = document.createElement('div');
  el.className = 'crosshair';
  el.innerHTML = '<span class="crosshair-mark"></span><span class="crosshair-reason"></span>';
  root.appendChild(el);
  const reason = el.querySelector('.crosshair-reason') as HTMLElement;
  let lastKey = '';

  return {
    update(aim, swinging) {
      const state = swinging ? 'swinging' : aim.point ? 'valid' : 'invalid';
      const text = state === 'invalid' && aim.fail ? REASONS[aim.fail] : '';
      const key = `${state}|${aim.source}|${text}`;
      if (key === lastKey) return;
      lastKey = key;
      el.dataset.state = state;
      el.dataset.source = aim.source;
      reason.textContent = text;
    },
    setVisible(visible) {
      el.style.display = visible ? '' : 'none';
    },
    dispose() {
      el.remove();
    },
  };
}
