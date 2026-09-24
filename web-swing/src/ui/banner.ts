/**
 * Faixa central (Etapa 2B, UI mínima): nome do nível + 3-2-1, aviso de
 * queda, resumo do nível concluído e aviso de nível falhado (Enter para
 * seguir). As telas completas de abertura/game over chegam na Etapa 3.
 */

import type { LevelResult } from '../logic/types';

export interface Banner {
  showCountdown(levelLabel: string, value: number): void;
  showGo(): void;
  showRespawn(livesLeft: number): void;
  showLevelComplete(result: LevelResult, runScore: number, isLastLevel: boolean, timeSec: number): void;
  showLevelFailed(rings: number, quota: number, livesLeft: number): void;
  hide(): void;
  dispose(): void;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

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
    showCountdown(levelLabel, value) {
      show(`cd:${levelLabel}:${value}`, 'countdown', `<div class="banner-sub">${levelLabel}</div><div class="banner-big">${value}</div>`);
    },
    showGo() {
      show('go', 'countdown', '<div class="banner-big">Já!</div>');
    },
    showRespawn(livesLeft) {
      show(`resp:${livesLeft}`, 'bad', `<div class="banner-title">Caiu!</div><div class="banner-sub">${livesLeft} ${livesLeft === 1 ? 'vida restante' : 'vidas restantes'} — voltando ao checkpoint…</div>`);
    },
    showLevelComplete(r, runScore, isLastLevel, timeSec) {
      const bonus = [
        r.allRingsBonus > 0 ? `<li>Todos os anéis <b>+${fmt(r.allRingsBonus)}</b></li>` : '',
        r.noStreetBonus > 0 ? `<li>Sem tocar a rua <b>+${fmt(r.noStreetBonus)}</b></li>` : '',
      ].join('');
      show(
        `done:${r.levelIndex}:${r.score}`,
        'good',
        `<div class="banner-title">Nível concluído!</div>
         <div class="banner-stars" aria-label="${r.stars} de 3 estrelas">${stars(r.stars)}</div>
         <ul class="banner-list">
           <li>Anéis ${r.rings}/${r.ringsTotal} <b>+${fmt(r.ringPoints)}</b></li>
           <li>Estilo (melhor ×${r.bestMultiplier.toLocaleString('pt-BR')}) <b>+${fmt(r.stylePoints)}</b></li>
           ${bonus}
           <li class="banner-total">Nível <b>${fmt(r.score)}</b></li>
           <li>Campanha <b>${fmt(runScore)}</b></li>
           <li class="banner-muted">Tempo ${timeSec.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s</li>
         </ul>
         <div class="banner-hint"><kbd>Enter</kbd> ${isLastLevel ? 'para ver o resultado' : 'para o próximo nível'}</div>`,
      );
    },
    showLevelFailed(rings, quota, livesLeft) {
      show(
        `fail:${rings}:${livesLeft}`,
        'bad',
        `<div class="banner-title">Faltaram anéis</div>
         <div class="banner-sub">Você pegou ${rings}, precisava de ${quota}. −1 vida (${livesLeft} ${livesLeft === 1 ? 'restante' : 'restantes'}).</div>
         <div class="banner-hint"><kbd>Enter</kbd> para tentar de novo</div>`,
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
