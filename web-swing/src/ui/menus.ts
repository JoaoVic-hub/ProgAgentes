/**
 * Telas de menu (Etapa 3) em DOM: título, seleção de nível, recordes, como
 * jogar, pausa, resultados do nível e fim de campanha.
 *
 * Só desenha e emite INTENÇÕES; quem decide a próxima tela é o reducer puro
 * (app/screens.ts), chamado pela cola (main). Redesenha apenas quando a tela
 * ou o aviso mudam (não perde o foco a cada frame). Teclado:
 *   Enter = botão principal (já vem com foco) · Esc = voltar (submenus)
 *   1–5 = nível na seleção · R = tentar de novo nos resultados
 * O mouse fica livre aqui: sem pointer lock, clique nenhum vira teia.
 */

import type { Screen, ScreenAction } from '../app/screens';
import type { HighscoreEntry } from '../logic/highscores';
import type { LevelResult } from '../logic/types';
import { formatDelta, formatTime } from './format';

export type MenuIntent = ScreenAction | { readonly type: 'pick_level'; readonly level: number } | { readonly type: 'submit_name'; readonly name: string };

export interface LevelCard {
  readonly index: number;
  readonly name: string;
  readonly unlocked: boolean;
  readonly stars: 0 | 1 | 2 | 3;
  readonly bestMs: number | null;
  readonly goldMs: number;
  readonly silverMs: number;
  readonly launchers: number;
  readonly voids: number;
}

export interface ResultsInfo {
  readonly result: LevelResult;
  readonly timeMs: number;
  /** Recorde do nível antes desta tentativa (null = primeira vez). */
  readonly previousBestMs: number | null;
  readonly goldMs: number;
  readonly silverMs: number;
  readonly runTimeMs: number;
  readonly isLastLevel: boolean;
  readonly ranked: boolean;
}

export interface CampaignInfo {
  readonly runTimeMs: number;
  readonly results: readonly LevelResult[];
  readonly tickHz: number;
  readonly fullCampaign: boolean;
  readonly ranked: boolean;
}

export interface PauseInfo {
  readonly levelLabel: string;
  readonly levelTimeMs: number;
  readonly runTimeMs: number;
}

export interface MenuData {
  readonly levels: readonly LevelCard[];
  readonly times: readonly HighscoreEntry[];
  readonly persistent: boolean;
  readonly results: ResultsInfo | null;
  readonly campaign: CampaignInfo | null;
  readonly pause: PauseInfo | null;
  /** Aviso curto (ex.: o navegador recusou o pointer lock). */
  readonly hint: string;
}

export interface Menus {
  /** Mostra a tela (redesenha só se a tela ou o aviso mudaram). */
  show(screen: Screen, data: MenuData): void;
  hide(): void;
  isOpen(): boolean;
  onIntent(listener: (intent: MenuIntent) => void): void;
  dispose(): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const stars = (n: number) => `<span class="m-stars" aria-label="${n} de 3 estrelas">${'★'.repeat(n)}<span class="m-stars-off">${'★'.repeat(3 - n)}</span></span>`;
const fmtMomentum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function button(intent: string, label: string, opts: { primary?: boolean; disabled?: boolean; hint?: string } = {}): string {
  return `<button type="button" class="m-btn${opts.primary ? ' m-primary' : ''}" data-intent="${intent}"${opts.disabled ? ' disabled' : ''}><span>${label}</span>${
    opts.hint ? `<small>${opts.hint}</small>` : ''
  }</button>`;
}

function timesTable(list: readonly HighscoreEntry[], highlight: number | null): string {
  if (list.length === 0) return '<p class="m-muted">Nenhuma campanha completa ainda.</p>';
  const rows = list
    .map((e, i) => `<tr${highlight === i + 1 ? ' class="m-me"' : ''}><td>${i + 1}</td><td>${esc(e.name)}</td><td>${formatTime(e.timeMs)}</td></tr>`)
    .join('');
  return `<table class="m-table"><thead><tr><th>#</th><th>Nome</th><th>Tempo</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function titleScreen(d: MenuData): string {
  const done = d.levels.filter((l) => l.bestMs !== null).length;
  const totalStars = d.levels.reduce((n, l) => n + l.stars, 0);
  const best = d.times[0];
  const foot = [
    best ? `Melhor campanha: <b>${formatTime(best.timeMs)}</b> (${esc(best.name)})` : '',
    done > 0 ? `Níveis concluídos: <b>${done}/${d.levels.length}</b> · <b>${totalStars}</b>/${d.levels.length * 3} ★` : '',
  ]
    .filter(Boolean)
    .join('<br>');
  return `
    <div class="m-card m-title-card">
      <h1 class="m-logo" id="menu-title">Web<span>Swing</span></h1>
      <p class="m-tag">Balance-se pela avenida, ganhe impulso encadeando manobras, desvie dos mísseis — e chegue antes do relógio.</p>
      <nav class="m-list" aria-label="Menu principal">
        ${button('play', 'Jogar campanha', { primary: true, hint: 'do nível 1 ao 5' })}
        ${button('open_level_select', 'Selecionar nível')}
        ${button('open_records', 'Recordes')}
        ${button('open_howto', 'Como jogar')}
      </nav>
      ${foot ? `<p class="m-foot">${foot}</p>` : ''}
    </div>
    <div class="m-demo-tag" aria-hidden="true">demonstração</div>`;
}

function levelSelectScreen(d: MenuData): string {
  const cards = d.levels
    .map((l) => {
      const info = l.unlocked
        ? `${stars(l.stars)}
           <span class="m-level-best">${l.bestMs !== null ? `recorde <b>${formatTime(l.bestMs)}</b>` : 'ainda não concluído'}</span>
           <span class="m-level-goals">★★★ ${formatTime(l.goldMs)} · ★★ ${formatTime(l.silverMs)}</span>
           <span class="m-level-threats">${l.launchers} lançadores${l.voids > 0 ? ` · ${l.voids} ${l.voids === 1 ? 'vão' : 'vãos'}` : ''}</span>`
        : `<span class="m-level-lock">🔒 conclua o nível ${l.index - 1}</span>`;
      return `<button type="button" class="m-level" data-level="${l.index}"${l.unlocked ? '' : ' disabled'}>
          <span class="m-level-num">${l.index}</span>
          <span class="m-level-name">${esc(l.name)}</span>
          ${info}
        </button>`;
    })
    .join('');
  return `
    <div class="m-card m-wide">
      <h2 class="m-h" id="menu-title">Selecionar nível</h2>
      <div class="m-levels">${cards}</div>
      <p class="m-muted">Começar num nível segue a campanha a partir dele. A tabela geral só vale para a campanha completa, do nível 1.</p>
      <div class="m-row">${button('back', 'Voltar')}</div>
    </div>`;
}

function recordsScreen(d: MenuData, highlight: number | null): string {
  const rows = d.levels
    .map(
      (l) =>
        `<tr><td>${l.index}</td><td>${esc(l.name)}</td><td>${l.bestMs !== null ? formatTime(l.bestMs) : '—'}</td><td>${l.bestMs !== null ? stars(l.stars) : ''}</td></tr>`,
    )
    .join('');
  return `
    <div class="m-card m-wide">
      <h2 class="m-h" id="menu-title">Recordes</h2>
      <div class="m-cols">
        <section>
          <h3 class="m-sub">Campanha completa (menor tempo)</h3>
          ${timesTable(d.times, highlight)}
        </section>
        <section>
          <h3 class="m-sub">Melhor por nível</h3>
          <table class="m-table"><thead><tr><th>#</th><th>Nível</th><th>Tempo</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        </section>
      </div>
      ${d.persistent ? '' : '<p class="m-muted">Sem armazenamento no navegador: os recordes valem só nesta aba.</p>'}
      <div class="m-row">${button('back', 'Voltar', { primary: true })}</div>
    </div>`;
}

function howtoScreen(): string {
  return `
    <div class="m-card m-wide">
      <h2 class="m-h" id="menu-title">Como jogar</h2>
      <div class="m-cols">
        <section>
          <h3 class="m-sub">Controles</h3>
          <ul class="m-keys">
            <li><kbd>Mouse</kbd> olhar e mirar (○ = dá para prender a teia)</li>
            <li><kbd>Clique</kbd> segurar = teia · soltar = largar</li>
            <li><kbd>W A S D</kbd> mover · no balanço: <b>W</b> bombeia, <b>S</b> freia</li>
            <li><kbd>Espaço</kbd> pular · impulso com a teia presa · <b>flip</b> logo após soltar</li>
            <li><kbd>Esc</kbd> pausar</li>
          </ul>
          <h3 class="m-sub">Objetivo</h3>
          <p>Chegar ao fim da avenida no <b>menor tempo</b>. Não há vidas: todo erro custa tempo. Cair num vão leva ao último checkpoint com o relógio correndo.</p>
        </section>
        <section>
          <h3 class="m-sub">Impulso</h3>
          <p>Solte a teia subindo (~35°) e faça o flip em seguida: cada acerto enche o medidor, e o impulso deixa os balanços <b>mais rápidos</b>. Teia no vazio, soltura ruim, flip atrasado, tocar a rua, bater ou levar míssil tiram impulso.</p>
          <h3 class="m-sub">Mísseis</h3>
          <p>Um laser e uma luz piscando avisam que um lançador vai disparar. As setas em volta da mira mostram de onde vêm. Corte para o lado no último instante, use os prédios como cobertura — e não fique lento.</p>
          <h3 class="m-sub">Estrelas</h3>
          <p>★ concluir · ★★ tempo de prata · ★★★ tempo de ouro.</p>
        </section>
      </div>
      <div class="m-row">${button('back', 'Voltar', { primary: true })}</div>
    </div>`;
}

function pauseScreen(d: MenuData): string {
  const p = d.pause;
  return `
    <div class="m-card">
      <h2 class="m-h" id="menu-title">Pausado</h2>
      ${p ? `<p class="m-muted">${esc(p.levelLabel)} · nível <b>${formatTime(p.levelTimeMs)}</b>${p.runTimeMs > 0 ? ` · campanha <b>${formatTime(p.runTimeMs)}</b>` : ''}</p>` : ''}
      <nav class="m-list" aria-label="Pausa">
        ${button('resume', 'Continuar', { primary: true })}
        ${button('restart_level', 'Reiniciar nível', { hint: 'o tempo desta tentativa continua contando na campanha' })}
        ${button('open_howto', 'Como jogar')}
        ${button('quit', 'Menu principal')}
      </nav>
      <p class="m-hint" aria-live="assertive">${esc(d.hint)}</p>
    </div>`;
}

function resultsScreen(d: MenuData): string {
  const c = d.results;
  if (!c) return '';
  const r = c.result;
  const record = c.ranked && (c.previousBestMs === null || c.timeMs < c.previousBestMs);
  const next = r.stars === 3 ? null : r.stars === 2 ? { label: '★★★', ms: c.goldMs } : { label: '★★', ms: c.silverMs };
  const rows = [
    c.previousBestMs === null
      ? ''
      : `<li>vs. recorde <b class="${c.timeMs < c.previousBestMs ? 'm-good' : 'm-bad'}">${formatDelta(c.timeMs - c.previousBestMs)}</b></li>`,
    next ? `<li class="m-muted">${next.label} em ${formatTime(next.ms)} <b>faltou ${formatDelta(c.timeMs - next.ms).slice(1)} s</b></li>` : '',
    `<li>Impulso máximo <b>×${fmtMomentum(r.bestMomentum)}</b></li>`,
    `<li>Soltura perfeita / flips <b>${r.perfects} / ${r.flips}</b></li>`,
    `<li>Mísseis levados / quedas <b>${r.hits} / ${r.falls}</b></li>`,
    `<li class="m-total">Campanha <b>${formatTime(c.runTimeMs)}</b></li>`,
    c.ranked ? '' : '<li class="m-muted">Run de teste: não grava recorde</li>',
  ].join('');
  return `
    <div class="m-card">
      <h2 class="m-h ${record ? 'm-good' : ''}" id="menu-title">${record ? 'Novo recorde!' : 'Nível concluído!'}</h2>
      <p class="m-muted">Nível ${r.levelIndex} — ${esc(r.levelName)}</p>
      <div class="m-time">${formatTime(c.timeMs)}</div>
      <div class="m-big-stars">${stars(r.stars)}</div>
      <ul class="m-stats">${rows}</ul>
      <nav class="m-list" aria-label="Próximo passo">
        ${button('next_level', c.isLastLevel ? 'Ver resultado da campanha' : 'Próximo nível', { primary: true })}
        ${button('retry_level', 'Tentar de novo <kbd>R</kbd>')}
        ${button('quit', 'Menu principal')}
      </nav>
    </div>`;
}

function victoryScreen(d: MenuData, nameEntry: boolean): string {
  const c = d.campaign;
  if (!c) return '';
  const levels = c.results
    .map((r) => `<li>${r.levelIndex}. ${esc(r.levelName)} <b>${formatTime((r.timeTicks * 1000) / c.tickHz)}</b> ${stars(r.stars)}</li>`)
    .join('');
  const totalStars = c.results.reduce((n, r) => n + r.stars, 0);
  const note = !c.ranked
    ? '<p class="m-muted">Run de teste (flags de debug): não entra nos recordes.</p>'
    : !c.fullCampaign
      ? '<p class="m-muted">A tabela geral só vale para a campanha completa, do nível 1 ao 5.</p>'
      : !d.persistent
        ? '<p class="m-muted">Sem armazenamento no navegador: os recordes valem só nesta aba.</p>'
        : '';
  return `
    <div class="m-card">
      <h2 class="m-h m-good" id="menu-title">Campanha completa!</h2>
      <div class="m-time">${formatTime(c.runTimeMs)}</div>
      <p class="m-muted">${totalStars}/${c.results.length * 3} ★</p>
      <ul class="m-stats m-levels-list">${levels}</ul>
      ${
        nameEntry
          ? `<form class="m-form"><label for="m-name">Novo recorde! Seu nome:</label>
             <input id="m-name" name="name" maxlength="24" autocomplete="nickname" required>
             <button type="submit" class="m-btn m-primary">Salvar</button></form>`
          : `<div class="m-table-wrap">${timesTable(d.times, null)}</div>`
      }
      ${note}
      <nav class="m-list m-row" aria-label="Fim da campanha">
        ${button('play_again', 'Jogar de novo', { primary: !nameEntry })}
        ${button('quit', 'Menu principal')}
      </nav>
    </div>`;
}

export function createMenus(root: HTMLElement): Menus {
  const el = document.createElement('div');
  el.className = 'menu';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'menu-title');
  root.appendChild(el);
  const listeners: ((intent: MenuIntent) => void)[] = [];
  const emit = (intent: MenuIntent) => listeners.forEach((l) => l(intent));
  let key = '';
  let current: Screen | null = null;

  const SIMPLE: Record<string, MenuIntent> = {
    play: { type: 'play' },
    open_level_select: { type: 'open_level_select' },
    open_records: { type: 'open_records' },
    open_howto: { type: 'open_howto' },
    back: { type: 'back' },
    resume: { type: 'resume' },
    restart_level: { type: 'restart_level' },
    quit: { type: 'quit' },
    retry_level: { type: 'retry_level' },
    play_again: { type: 'play_again' },
  };

  el.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('button');
    if (!target || target.disabled) return;
    const level = target.dataset.level;
    if (level) return emit({ type: 'pick_level', level: Number(level) });
    const intent = target.dataset.intent;
    if (intent === 'next_level') return emit({ type: 'next_level', last: false, qualifies: false }); // a cola completa last/qualifies
    if (intent && SIMPLE[intent]) emit(SIMPLE[intent]);
  });
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = el.querySelector('#m-name') as HTMLInputElement | null;
    emit({ type: 'submit_name', name: input?.value ?? '' });
  });

  function onKey(e: KeyboardEvent) {
    if (!current || !el.classList.contains('visible')) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const k = current.kind;
    if (e.code === 'Escape' && (k === 'level_select' || k === 'records' || k === 'howto')) {
      e.preventDefault();
      emit({ type: 'back' });
    } else if (k === 'level_select' && /^Digit[1-9]$/.test(e.code)) {
      const n = Number(e.code.slice(5));
      const b = el.querySelector(`button[data-level="${n}"]`) as HTMLButtonElement | null;
      if (b && !b.disabled) emit({ type: 'pick_level', level: n });
    } else if (k === 'results' && e.code === 'KeyR') {
      e.preventDefault();
      emit({ type: 'retry_level' });
    }
  }
  window.addEventListener('keydown', onKey);

  return {
    show(screen, data) {
      const highlight = screen.kind === 'records' ? screen.highlight : null;
      const k = `${JSON.stringify(screen)}|${data.hint}`;
      el.classList.add('visible');
      if (k === key) return;
      const sameScreen = current !== null && JSON.stringify(current) === JSON.stringify(screen);
      key = k;
      current = screen;
      el.dataset.screen = screen.kind;
      if (sameScreen && screen.kind === 'game') {
        // só o aviso mudou: não redesenha (mantém o foco)
        const hint = el.querySelector('.m-hint');
        if (hint) hint.textContent = data.hint;
        return;
      }
      switch (screen.kind) {
        case 'title':
          el.innerHTML = titleScreen(data);
          break;
        case 'level_select':
          el.innerHTML = levelSelectScreen(data);
          break;
        case 'records':
          el.innerHTML = recordsScreen(data, highlight);
          break;
        case 'howto':
          el.innerHTML = howtoScreen();
          break;
        case 'game':
          el.innerHTML = pauseScreen(data);
          break;
        case 'results':
          el.innerHTML = resultsScreen(data);
          break;
        case 'victory':
          el.innerHTML = victoryScreen(data, screen.nameEntry);
          break;
      }
      // foco no campo de nome ou no botão principal (Enter já confirma)
      const focus = (el.querySelector('#m-name') ?? el.querySelector('.m-primary:not([disabled])') ?? el.querySelector('button:not([disabled])')) as HTMLElement | null;
      focus?.focus({ preventScroll: true });
    },
    hide() {
      if (!el.classList.contains('visible')) return;
      el.classList.remove('visible');
      key = '';
      current = null;
    },
    isOpen: () => el.classList.contains('visible'),
    onIntent(listener) {
      listeners.push(listener);
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
