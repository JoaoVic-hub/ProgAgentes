import { describe, it, expect } from 'vitest';
import { BACKUP_KEY, loadSave, recordHighscore, recordLevelBests, resetSave, runQualifies, SAVE_KEY, writeSave } from './save';
import { createMemoryStore } from '../storage/store';
import { createRun } from '../logic/engine';
import { defaultSave } from '../logic/save-data';
import type { GameState, LevelResult } from '../logic/types';

function finishedRun(over: Partial<GameState> = {}): GameState {
  const result: LevelResult = {
    levelIndex: 1, levelName: 'Avenida Aurora', score: 2500, ringPoints: 1500, stylePoints: 1000, allRingsBonus: 0, noStreetBonus: 0,
    rings: 10, ringsTotal: 14, stars: 2, timeTicks: 1900, bestMultiplier: 2.5,
  };
  return { ...createRun(), phase: 'game_over', runScore: 2500, results: [result], ...over };
}

describe('Salvar recordes no armazenamento (2C)', () => {
  it('grava e relê pela chave web-swing:v1:save', () => {
    const store = createMemoryStore();
    const data = recordHighscore(defaultSave(), finishedRun(), 'Ana', 1000).save;
    expect(writeSave(store, data)).toBe(true);
    expect(store.get(SAVE_KEY)).not.toBeNull();
    expect(loadSave(store)).toEqual({ data, status: 'ok' });
  });

  it('save corrompido não quebra: vira o padrão e o original vai para o backup', () => {
    const store = createMemoryStore();
    store.set(SAVE_KEY, '{isto não é json');
    const r = loadSave(store);
    expect(r.status).toBe('corrupt');
    expect(r.data).toEqual(defaultSave());
    expect(store.get(BACKUP_KEY)).toBe('{isto não é json');
  });

  it('run não ranqueado não entra na tabela nem nos melhores por nível', () => {
    const unranked = finishedRun({ ranked: false });
    expect(runQualifies(defaultSave(), unranked)).toBe(false);
    expect(recordHighscore(defaultSave(), unranked, 'Ana', 1).position).toBeNull();
    expect(recordLevelBests(defaultSave(), unranked).bestByLevel).toEqual({});
  });

  it('run ranqueado entra (com nome saneado) e registra o melhor por nível', () => {
    const run = finishedRun();
    const r = recordHighscore(defaultSave(), run, '  Zé  ', 42);
    expect(r.position).toBe(1);
    expect(r.save.highscores[0]).toEqual({ name: 'Zé', score: 2500, levelReached: 1, victory: false, date: 42 });
    expect(recordLevelBests(defaultSave(), run).bestByLevel['1']).toEqual({ score: 2500, stars: 2, bestTimeTicks: 1900 });
  });

  it('resetSave apaga os recordes (?resetScores=1)', () => {
    const store = createMemoryStore();
    writeSave(store, recordHighscore(defaultSave(), finishedRun(), 'Ana', 1).save);
    resetSave(store);
    expect(loadSave(store).status).toBe('empty');
  });
});
