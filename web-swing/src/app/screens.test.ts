import { describe, it, expect } from 'vitest';
import { INITIAL_SCREEN, isGameScreen, isMenuScreen, screenReducer } from './screens';
import type { Screen, ScreenAction, ScreenEffect } from './screens';

const SCREENS: Record<string, Screen> = {
  title: { kind: 'title' },
  howtoTitle: { kind: 'howto', back: 'title' },
  howtoPause: { kind: 'howto', back: 'pause' },
  records: { kind: 'records', highlight: null },
  levelSelect: { kind: 'level_select' },
  playing: { kind: 'game', paused: false },
  paused: { kind: 'game', paused: true },
  results: { kind: 'results' },
  victoryName: { kind: 'victory', nameEntry: true },
  victory: { kind: 'victory', nameEntry: false },
};

const ACTIONS: Record<string, ScreenAction> = {
  play: { type: 'play' },
  openLevelSelect: { type: 'open_level_select' },
  openRecords: { type: 'open_records' },
  openHowto: { type: 'open_howto' },
  back: { type: 'back' },
  select3: { type: 'select_level', level: 3, unlocked: true },
  select4Locked: { type: 'select_level', level: 4, unlocked: false },
  lockAcquired: { type: 'lock_acquired' },
  lockLost: { type: 'lock_lost' },
  lockFailed: { type: 'lock_failed' },
  resume: { type: 'resume' },
  restart: { type: 'restart_level' },
  quit: { type: 'quit' },
  levelComplete: { type: 'level_complete' },
  next: { type: 'next_level', last: false, qualifies: false },
  nextLastQualifies: { type: 'next_level', last: true, qualifies: true },
  nextLastNo: { type: 'next_level', last: true, qualifies: false },
  retry: { type: 'retry_level' },
  nameSubmitted: { type: 'name_submitted', position: 2 },
  playAgain: { type: 'play_again' },
};

const LOCK: ScreenEffect = { type: 'request_lock' };
const UNLOCK: ScreenEffect = { type: 'release_lock' };

/** Tabela completa das transições válidas: [tela, ação, próxima tela, efeitos]. */
const VALID: [string, string, Screen, ScreenEffect[]][] = [
  ['title', 'play', SCREENS.playing, [{ type: 'new_run', startLevel: 1 }, LOCK]],
  ['title', 'openLevelSelect', SCREENS.levelSelect, []],
  ['title', 'openRecords', SCREENS.records, []],
  ['title', 'openHowto', SCREENS.howtoTitle, []],
  ['howtoTitle', 'back', SCREENS.title, []],
  ['howtoPause', 'back', SCREENS.paused, []],
  ['records', 'back', SCREENS.title, []],
  ['levelSelect', 'select3', SCREENS.playing, [{ type: 'new_run', startLevel: 3 }, LOCK]],
  ['levelSelect', 'back', SCREENS.title, []],
  ['playing', 'lockLost', SCREENS.paused, []],
  ['playing', 'lockFailed', SCREENS.paused, []],
  ['playing', 'levelComplete', SCREENS.results, [UNLOCK]],
  ['paused', 'resume', SCREENS.paused, [LOCK]],
  ['paused', 'lockAcquired', SCREENS.playing, []],
  ['paused', 'restart', SCREENS.playing, [{ type: 'restart_level' }, LOCK]],
  ['paused', 'openHowto', SCREENS.howtoPause, []],
  ['paused', 'quit', SCREENS.title, [UNLOCK]],
  ['results', 'next', SCREENS.playing, [{ type: 'advance_level' }, LOCK]],
  ['results', 'nextLastQualifies', SCREENS.victoryName, [{ type: 'advance_level' }]],
  ['results', 'nextLastNo', SCREENS.victory, [{ type: 'advance_level' }]],
  ['results', 'retry', SCREENS.playing, [{ type: 'restart_level' }, LOCK]],
  ['results', 'quit', SCREENS.title, []],
  ['victoryName', 'nameSubmitted', { kind: 'records', highlight: 2 }, []],
  ['victoryName', 'playAgain', SCREENS.playing, [{ type: 'new_run', startLevel: 1 }, LOCK]],
  ['victoryName', 'quit', SCREENS.title, []],
  ['victory', 'playAgain', SCREENS.playing, [{ type: 'new_run', startLevel: 1 }, LOCK]],
  ['victory', 'quit', SCREENS.title, []],
];

describe('Fluxo de telas (Etapa 3)', () => {
  it('começa no título', () => {
    expect(INITIAL_SCREEN).toEqual({ kind: 'title' });
  });

  it('tabela completa de transições: cada par (tela, ação) válido leva à tela e aos efeitos esperados', () => {
    for (const [from, action, to, effects] of VALID) {
      expect({ from, action, ...screenReducer(SCREENS[from], ACTIONS[action]) }).toEqual({ from, action, screen: to, effects });
    }
  });

  it('qualquer outra ação é ignorada: mesma tela e nenhum efeito', () => {
    const valid = new Set(VALID.map(([from, action]) => `${from}/${action}`));
    let checked = 0;
    for (const [from, screen] of Object.entries(SCREENS)) {
      for (const [name, action] of Object.entries(ACTIONS)) {
        if (valid.has(`${from}/${name}`)) continue;
        const r = screenReducer(screen, action);
        expect({ from, name, screen: r.screen, effects: r.effects }).toEqual({ from, name, screen, effects: [] });
        checked++;
      }
    }
    expect(checked).toBe(Object.keys(SCREENS).length * Object.keys(ACTIONS).length - VALID.length);
  });

  it('nível bloqueado não abre; nome só é pedido quando a campanha se qualifica', () => {
    expect(screenReducer(SCREENS.levelSelect, ACTIONS.select4Locked).screen).toEqual(SCREENS.levelSelect);
    expect(screenReducer(SCREENS.results, ACTIONS.nextLastNo).screen).toEqual({ kind: 'victory', nameEntry: false });
    // sem entrada de nome, "nome salvo" não leva a lugar nenhum
    expect(screenReducer(SCREENS.victory, ACTIONS.nameSubmitted).screen).toEqual(SCREENS.victory);
  });

  it('continuar da pausa só volta ao jogo quando o pointer lock é confirmado', () => {
    const asked = screenReducer(SCREENS.paused, ACTIONS.resume);
    expect(asked.screen).toEqual(SCREENS.paused);
    expect(asked.effects).toEqual([LOCK]);
    expect(screenReducer(asked.screen, ACTIONS.lockFailed).screen).toEqual(SCREENS.paused);
    expect(screenReducer(asked.screen, ACTIONS.lockAcquired).screen).toEqual(SCREENS.playing);
  });

  it('o pointer lock só é pedido em gestos de "jogar" (nunca ao navegar entre menus)', () => {
    const lockers = VALID.filter(([, , , effects]) => effects.some((e) => e.type === 'request_lock')).map(([, action]) => action);
    expect(new Set(lockers)).toEqual(new Set(['play', 'select3', 'resume', 'restart', 'next', 'retry', 'playAgain']));
  });

  it('um fluxo completo, do título ao título, sem beco sem saída', () => {
    const path: ScreenAction[] = [
      ACTIONS.openHowto, ACTIONS.back, ACTIONS.openRecords, ACTIONS.back, ACTIONS.play,
      ACTIONS.lockAcquired, ACTIONS.lockLost, ACTIONS.resume, ACTIONS.lockAcquired,
      ACTIONS.levelComplete, ACTIONS.next, ACTIONS.levelComplete, ACTIONS.nextLastQualifies,
      ACTIONS.nameSubmitted, ACTIONS.back,
    ];
    let s: Screen = INITIAL_SCREEN;
    const kinds: string[] = [];
    for (const a of path) {
      s = screenReducer(s, a).screen;
      kinds.push(s.kind + (s.kind === 'game' ? (s.paused ? ':pausa' : ':jogando') : ''));
    }
    expect(kinds).toEqual([
      'howto', 'title', 'records', 'title', 'game:jogando',
      'game:jogando', 'game:pausa', 'game:pausa', 'game:jogando',
      'results', 'game:jogando', 'results', 'victory',
      'records', 'title',
    ]);
  });

  it('menus livres mostram a demonstração; o "Como jogar" da pausa não (o jogo pausado continua atrás)', () => {
    expect(isMenuScreen(SCREENS.title)).toBe(true);
    expect(isMenuScreen(SCREENS.levelSelect)).toBe(true);
    expect(isMenuScreen(SCREENS.records)).toBe(true);
    expect(isMenuScreen(SCREENS.howtoTitle)).toBe(true);
    expect(isMenuScreen(SCREENS.howtoPause)).toBe(false);
    for (const k of ['playing', 'paused', 'results', 'victory']) expect(isMenuScreen(SCREENS[k])).toBe(false);
    expect(isGameScreen(SCREENS.paused)).toBe(true);
    expect(isGameScreen(SCREENS.results)).toBe(false);
  });
});
