/**
 * Painel de depuração (?debug=1): medidor de FPS do three (stats.js) + um
 * bloco de texto com números do frame. Carregado por import dinâmico só em
 * desenvolvimento, para não entrar no bundle de produção.
 */

import Stats from 'three/addons/libs/stats.module.js';

export interface DebugPanel {
  begin(): void;
  end(): void;
  setLines(lines: readonly string[]): void;
  dispose(): void;
}

export function createDebugPanel(root: HTMLElement): DebugPanel {
  const stats = new Stats();
  stats.dom.classList.add('debug-stats');
  root.appendChild(stats.dom);

  const text = document.createElement('pre');
  text.className = 'debug-text';
  root.appendChild(text);

  let last = '';
  return {
    begin: () => stats.begin(),
    end: () => stats.end(),
    setLines(lines) {
      const next = lines.join('\n');
      if (next !== last) {
        text.textContent = next;
        last = next;
      }
    },
    dispose() {
      stats.dom.remove();
      text.remove();
    },
  };
}
