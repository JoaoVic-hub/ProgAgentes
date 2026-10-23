/**
 * Fluxo de telas (Etapa 3) — reducer puro e testável.
 *
 *   title ─┬─ Jogar ──────────────────────────► game
 *          ├─ Selecionar nível ─► level_select ─► game
 *          ├─ Recordes ─► records
 *          └─ Como jogar ─► howto
 *   game ⇄ pausa (perdeu o pointer lock) ─► Reiniciar | Como jogar | Menu
 *   game ─► results (nível concluído) ─┬─ Próximo ─► game | victory (depois do L5)
 *                                      ├─ Tentar de novo ─► game
 *                                      └─ Menu ─► title
 *   victory ─┬─ nome salvo ─► records (destacado) ─► title
 *            └─ Jogar de novo ─► game | Menu ─► title
 *
 * O reducer só decide a próxima tela e os EFEITOS que a cola (main) aplica
 * na ordem: criar/reiniciar/avançar o run e pedir/soltar o pointer lock.
 * Ação que não vale na tela atual é ignorada (mesma tela, sem efeitos).
 * Não há game over: a campanha é contra o relógio (ADR-024).
 */

export type Screen =
  | { readonly kind: 'title' }
  | { readonly kind: 'howto'; readonly back: 'title' | 'pause' }
  | { readonly kind: 'records'; readonly highlight: number | null }
  | { readonly kind: 'level_select' }
  /** paused: sem pointer lock (Esc, troca de janela, lock recusado) → menu de pausa. */
  | { readonly kind: 'game'; readonly paused: boolean }
  | { readonly kind: 'results' }
  | { readonly kind: 'victory'; readonly nameEntry: boolean };

export type ScreenAction =
  | { readonly type: 'play' }
  | { readonly type: 'open_level_select' }
  | { readonly type: 'open_records' }
  | { readonly type: 'open_howto' }
  | { readonly type: 'back' }
  | { readonly type: 'select_level'; readonly level: number; readonly unlocked: boolean }
  | { readonly type: 'lock_acquired' }
  | { readonly type: 'lock_lost' }
  | { readonly type: 'lock_failed' }
  | { readonly type: 'resume' }
  | { readonly type: 'restart_level' }
  | { readonly type: 'quit' }
  | { readonly type: 'level_complete' }
  /** last: era o L5 (vai para a vitória); qualifies: a campanha entra na tabela geral. */
  | { readonly type: 'next_level'; readonly last: boolean; readonly qualifies: boolean }
  | { readonly type: 'retry_level' }
  | { readonly type: 'name_submitted'; readonly position: number | null }
  | { readonly type: 'play_again' };

export type ScreenEffect =
  | { readonly type: 'new_run'; readonly startLevel: number }
  | { readonly type: 'restart_level' }
  | { readonly type: 'advance_level' }
  | { readonly type: 'request_lock' }
  | { readonly type: 'release_lock' };

export interface ScreenTransition {
  readonly screen: Screen;
  readonly effects: readonly ScreenEffect[];
}

export const INITIAL_SCREEN: Screen = { kind: 'title' };

const TITLE: Screen = { kind: 'title' };
const PLAYING: Screen = { kind: 'game', paused: false };
const PAUSED: Screen = { kind: 'game', paused: true };
const LOCK: ScreenEffect = { type: 'request_lock' };
const UNLOCK: ScreenEffect = { type: 'release_lock' };
const newRun = (startLevel: number): ScreenEffect => ({ type: 'new_run', startLevel });

/**
 * Telas de menu "livres": o run do jogador não existe (ou acabou), então o
 * fundo mostra a demonstração. O "Como jogar" aberto da pausa NÃO é livre:
 * o jogo pausado continua lá atrás.
 */
export function isMenuScreen(screen: Screen): boolean {
  switch (screen.kind) {
    case 'title':
    case 'level_select':
    case 'records':
      return true;
    case 'howto':
      return screen.back === 'title';
    default:
      return false;
  }
}

/** O jogo está em primeiro plano (HUD, retículo e simulação quando houver lock). */
export function isGameScreen(screen: Screen): boolean {
  return screen.kind === 'game';
}

export function screenReducer(screen: Screen, action: ScreenAction): ScreenTransition {
  const go = (next: Screen, ...effects: ScreenEffect[]): ScreenTransition => ({ screen: next, effects });
  const stay: ScreenTransition = { screen, effects: [] };

  switch (screen.kind) {
    case 'title':
      switch (action.type) {
        case 'play':
          return go(PLAYING, newRun(1), LOCK);
        case 'open_level_select':
          return go({ kind: 'level_select' });
        case 'open_records':
          return go({ kind: 'records', highlight: null });
        case 'open_howto':
          return go({ kind: 'howto', back: 'title' });
        default:
          return stay;
      }

    case 'level_select':
      if (action.type === 'select_level' && action.unlocked) return go(PLAYING, newRun(action.level), LOCK);
      if (action.type === 'back') return go(TITLE);
      return stay;

    case 'records':
      return action.type === 'back' ? go(TITLE) : stay;

    case 'howto':
      if (action.type !== 'back') return stay;
      return go(screen.back === 'title' ? TITLE : PAUSED);

    case 'game':
      if (!screen.paused) {
        switch (action.type) {
          case 'lock_lost':
          case 'lock_failed':
            return go(PAUSED);
          case 'level_complete':
            return go({ kind: 'results' }, UNLOCK);
          default:
            return stay;
        }
      }
      switch (action.type) {
        case 'resume':
          return go(PAUSED, LOCK); // só volta a jogar quando o lock for confirmado
        case 'lock_acquired':
          return go(PLAYING);
        case 'restart_level':
          return go(PLAYING, { type: 'restart_level' }, LOCK);
        case 'open_howto':
          return go({ kind: 'howto', back: 'pause' });
        case 'quit':
          return go(TITLE, UNLOCK);
        default:
          return stay;
      }

    case 'results':
      switch (action.type) {
        case 'next_level':
          return action.last
            ? go({ kind: 'victory', nameEntry: action.qualifies }, { type: 'advance_level' })
            : go(PLAYING, { type: 'advance_level' }, LOCK);
        case 'retry_level':
          return go(PLAYING, { type: 'restart_level' }, LOCK);
        case 'quit':
          return go(TITLE);
        default:
          return stay;
      }

    case 'victory':
      switch (action.type) {
        case 'name_submitted':
          return screen.nameEntry ? go({ kind: 'records', highlight: action.position }) : stay;
        case 'play_again':
          return go(PLAYING, newRun(1), LOCK);
        case 'quit':
          return go(TITLE);
        default:
          return stay;
      }
  }
}
