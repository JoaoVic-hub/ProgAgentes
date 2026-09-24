import { describe, it, expect } from 'vitest';
import { BACKUP_KEY, loadSave, recordHighscore, recordLevelBests, resetSave, runQualifies, runTimeMs, SAVE_KEY, writeSave } from './save';
import { createMemoryStore } from '../storage/store';
import { createRun } from '../logic/engine';
import { defaultSave } from '../logic/save-data';
import type { GameState, LevelResult } from '../logic/types';

const result = (levelIndex: number, timeTicks: number, stars: 1 | 2 | 3): LevelResult => ({
  levelIndex, levelName: `N${levelIndex}`, timeTicks, stars, falls: 0, hits: 1, perfects: 4, flips: 2, bestMomentum: 3.5,
});

/** Campanha completa L1 → L5 (vitória), 1:40 no total. */
function wonRun(over: Partial<GameState> = {}): GameState {
  const results = [1, 2, 3, 4, 5].map((i) => result(i, 1200, 2));
  return { ...createRun(), phase: 'victory', runTicks: 6000, results, ...over };
}

describe('Salvar recordes no armazenamento', () => {
  it('grava e relê pela chave web-swing:v1:save', () => {
    const store = createMemoryStore();
    const data = recordHighscore(defaultSave(), wonRun(), 'Ana', 1000).save;
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

  it('save v1 (anéis) é migrado e o original fica no backup', () => {
    const store = createMemoryStore();
    const v1 = '{"version":1,"highscores":[],"bestByLevel":{"1":{"score":1,"stars":2,"bestTimeTicks":600}}}';
    store.set(SAVE_KEY, v1);
    const r = loadSave(store);
    expect(r.status).toBe('migrated');
    expect(r.data.bestByLevel).toEqual({ '1': { bestTimeMs: 10_000, stars: 0 } });
    expect(store.get(BACKUP_KEY)).toBe(v1);
  });

  it('só campanha completa desde o L1, ranqueada e vitoriosa entra na tabela geral', () => {
    expect(runQualifies(defaultSave(), wonRun())).toBe(true);
    expect(runQualifies(defaultSave(), wonRun({ ranked: false }))).toBe(false);
    expect(runQualifies(defaultSave(), wonRun({ startLevel: 3 }))).toBe(false);
    expect(runQualifies(defaultSave(), wonRun({ phase: 'level_complete' }))).toBe(false);
  });

  it('entra com o tempo total (ms) e o nome saneado', () => {
    const r = recordHighscore(defaultSave(), wonRun(), '  Zé  ', 42);
    expect(runTimeMs(wonRun())).toBe(100_000);
    expect(r.position).toBe(1);
    expect(r.save.times[0]).toEqual({ name: 'Zé', timeMs: 100_000, date: 42 });
    expect(recordHighscore(defaultSave(), wonRun({ ranked: false }), 'Ana', 1).position).toBeNull();
  });

  it('melhor por nível vale para qualquer nível concluído num run ranqueado (mesmo sem vitória)', () => {
    const partial = { ...createRun(), phase: 'level_complete' as const, results: [result(1, 1500, 3)] };
    expect(recordLevelBests(defaultSave(), partial).bestByLevel).toEqual({ '1': { bestTimeMs: 25_000, stars: 3 } });
    expect(recordLevelBests(defaultSave(), { ...partial, ranked: false }).bestByLevel).toEqual({});
  });

  it('resetSave apaga os recordes (?resetScores=1)', () => {
    const store = createMemoryStore();
    writeSave(store, recordHighscore(defaultSave(), wonRun(), 'Ana', 1).save);
    resetSave(store);
    expect(loadSave(store).status).toBe('empty');
  });
});
