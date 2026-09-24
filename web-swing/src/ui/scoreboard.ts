/**
 * Fim de campanha: tempo total, tempos e estrelas por nível, entrada de nome
 * (se o run é ranqueado, começou no L1 e entra no top 10) e a tabela dos
 * menores tempos, com "Jogar de novo". O mouse fica livre aqui (sem pointer
 * lock) para digitar e clicar. As telas completas chegam na Etapa 3.
 */

import type { HighscoreEntry } from '../logic/highscores';
import type { LevelResult } from '../logic/types';
import { formatTime } from './format';

export interface ScoreboardData {
  readonly runTimeMs: number;
  readonly results: readonly LevelResult[];
  readonly tickHz: number;
  /** Começou no L1? (senão a campanha não vale para a tabela geral) */
  readonly fullCampaign: boolean;
  /** Pode entrar na tabela (ranqueado + campanha completa + top 10). */
  readonly qualifies: boolean;
  readonly ranked: boolean;
  readonly times: readonly HighscoreEntry[];
  /** Posição (1-based) a destacar na tabela. */
  readonly highlight: number | null;
  /** false: sem localStorage (os recordes valem só nesta aba). */
  readonly persistent: boolean;
}

export interface Scoreboard {
  show(d: ScoreboardData): void;
  onSubmitName(listener: (name: string) => void): void;
  onPlayAgain(listener: () => void): void;
  hide(): void;
  isVisible(): boolean;
  dispose(): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function createScoreboard(root: HTMLElement): Scoreboard {
  const el = document.createElement('div');
  el.className = 'scoreboard';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'scoreboard-title');
  root.appendChild(el);
  const submitListeners: ((name: string) => void)[] = [];
  const playListeners: (() => void)[] = [];

  function table(list: readonly HighscoreEntry[], highlight: number | null): string {
    if (list.length === 0) return '<p class="sb-empty">Nenhum recorde ainda.</p>';
    const rows = list
      .map((e, i) => `<tr${highlight === i + 1 ? ' class="sb-me"' : ''}><td>${i + 1}</td><td>${esc(e.name)}</td><td>${formatTime(e.timeMs)}</td></tr>`)
      .join('');
    return `<table class="sb-table"><thead><tr><th>#</th><th>Nome</th><th>Tempo</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  return {
    show(d) {
      const levels = d.results
        .map((r) => `<li>L${r.levelIndex} ${esc(r.levelName)} <b>${formatTime((r.timeTicks * 1000) / d.tickHz)}</b> <span class="sb-stars">${'★'.repeat(r.stars)}</span></li>`)
        .join('');
      const totalStars = d.results.reduce((n, r) => n + r.stars, 0);
      const note = !d.ranked
        ? '<p class="sb-note">Run de teste (flags de debug): não entra nos recordes.</p>'
        : !d.fullCampaign
          ? '<p class="sb-note">A tabela geral só vale para a campanha completa, do nível 1 ao 5.</p>'
          : !d.persistent
            ? '<p class="sb-note">Sem armazenamento no navegador: os recordes valem só nesta aba.</p>'
            : '';
      el.innerHTML = `
        <div class="sb-card">
          <h2 class="sb-title" id="scoreboard-title">Campanha completa!</h2>
          <div class="sb-score">${formatTime(d.runTimeMs)} <span>${totalStars}/${d.results.length * 3} ★</span></div>
          ${levels ? `<ul class="sb-levels">${levels}</ul>` : ''}
          ${
            d.qualifies
              ? `<form class="sb-form"><label for="sb-name">Novo recorde! Seu nome:</label>
                 <input id="sb-name" name="name" maxlength="24" autocomplete="nickname" required>
                 <button type="submit">Salvar</button></form>`
              : ''
          }
          <div class="sb-table-wrap">${table(d.times, d.highlight)}</div>
          ${note}
          <button class="sb-again" type="button">Jogar de novo</button>
        </div>`;
      el.classList.add('visible');
      const form = el.querySelector('.sb-form') as HTMLFormElement | null;
      const again = el.querySelector('.sb-again') as HTMLButtonElement;
      again.addEventListener('click', () => playListeners.forEach((l) => l()));
      if (form) {
        const inputEl = form.querySelector('input') as HTMLInputElement;
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          submitListeners.forEach((l) => l(inputEl.value));
        });
        inputEl.focus();
      } else {
        again.focus();
      }
    },
    onSubmitName(listener) {
      submitListeners.push(listener);
    },
    onPlayAgain(listener) {
      playListeners.push(listener);
    },
    hide() {
      el.classList.remove('visible');
      el.innerHTML = '';
    },
    isVisible: () => el.classList.contains('visible'),
    dispose() {
      el.remove();
    },
  };
}
