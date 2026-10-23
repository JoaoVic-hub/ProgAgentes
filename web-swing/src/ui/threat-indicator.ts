/**
 * Indicador de ameaças em volta do retículo: uma seta por míssil próximo e
 * por lançador mirando/disparando, apontando para onde a ameaça está (em
 * volta da tela, atrás = embaixo). Vermelho = míssil, âmbar = lançador; a
 * opacidade e o tamanho crescem com a urgência. Com um míssil muito perto,
 * o anel inteiro pulsa ("desvia!").
 * DOM puro; pool fixo de elementos (sem criar/destruir por frame).
 */

import type { RadarBlip } from '../app/threat-radar';

export interface ThreatIndicator {
  update(blips: readonly RadarBlip[]): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const POOL_SIZE = 16;
/** Raio do anel (px). */
const RADIUS = 120;
/** Acima disto um míssil deixa o anel em alerta. */
const DANGER = 0.85;

export function createThreatIndicator(root: HTMLElement): ThreatIndicator {
  const el = document.createElement('div');
  el.className = 'threats';
  el.setAttribute('aria-hidden', 'true');
  root.appendChild(el);
  const pool: HTMLElement[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const a = document.createElement('div');
    a.className = 'threat-arrow';
    a.style.display = 'none';
    el.appendChild(a);
    pool.push(a);
  }
  let danger = false;

  return {
    update(blips) {
      // os mais urgentes primeiro, se passar do pool
      const shown = blips.length > POOL_SIZE ? [...blips].sort((a, b) => b.urgency - a.urgency).slice(0, POOL_SIZE) : blips;
      for (let i = 0; i < POOL_SIZE; i++) {
        const a = pool[i];
        const b = shown[i];
        if (!b) {
          if (a.style.display !== 'none') a.style.display = 'none';
          continue;
        }
        a.style.display = '';
        a.dataset.kind = b.kind;
        const size = 0.75 + 0.5 * b.urgency;
        a.style.transform = `rotate(${b.angle.toFixed(3)}rad) translateY(-${RADIUS}px) scale(${size.toFixed(2)})`;
        a.style.opacity = (0.3 + 0.7 * b.urgency).toFixed(2);
      }
      const d = blips.some((b) => b.kind === 'missile' && b.urgency >= DANGER);
      if (d !== danger) {
        danger = d;
        el.dataset.danger = d ? 'yes' : 'no';
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
