import { describe, it, expect } from 'vitest';
import { compareEntries, DEFAULT_NAME, insertEntry, qualifies, sanitizeName, unlockedLevels, updateBestByLevel } from './highscores';
import type { HighscoreEntry } from './highscores';
import { defaultSave, parseSaveData, serializeSaveData } from './save-data';
import type { LevelResult } from './types';

const entry = (score: number, date: number, name = 'Ana'): HighscoreEntry => ({ name, score, levelReached: 1, victory: false, date });

function result(over: Partial<LevelResult> = {}): LevelResult {
  return {
    levelIndex: 1, levelName: 'Avenida Aurora', score: 1000, ringPoints: 600, stylePoints: 400, allRingsBonus: 0, noStreetBonus: 0,
    rings: 5, ringsTotal: 14, stars: 1, timeTicks: 2000, bestMultiplier: 2, ...over,
  };
}

describe('Tabela de recordes (2C)', () => {
  it('ordena por pontuação (maior primeiro)', () => {
    let list: HighscoreEntry[] = [];
    for (const s of [300, 900, 100, 500]) list = insertEntry(list, entry(s, s)).list;
    expect(list.map((e) => e.score)).toEqual([900, 500, 300, 100]);
  });

  it('corta em 10 e diz a posição de quem entrou (ou null)', () => {
    let list: HighscoreEntry[] = [];
    for (let i = 1; i <= 12; i++) list = insertEntry(list, entry(i * 100, i)).list;
    expect(list).toHaveLength(10);
    expect(list[9].score).toBe(300);
    expect(insertEntry(list, entry(50, 99)).position).toBeNull();
    expect(insertEntry(list, entry(1150, 99)).position).toBe(2);
  });

  it('empate: quem fez primeiro (data mais antiga) fica na frente; empate com o 10º não entra', () => {
    const r = insertEntry([entry(500, 10, 'Velho')], entry(500, 20, 'Novo'));
    expect(r.list.map((e) => e.name)).toEqual(['Velho', 'Novo']);
    expect(compareEntries(entry(500, 1), entry(500, 2))).toBeLessThan(0);
    const full = Array.from({ length: 10 }, (_, i) => entry(1000 - i * 10, i));
    expect(qualifies(full, 910)).toBe(false); // empata com o último
    expect(qualifies(full, 911)).toBe(true);
    expect(qualifies([], 0)).toBe(false); // zero ponto não entra
  });

  it('nome: 1–12 caracteres, sem controle, espaços colapsados; vazio vira o padrão', () => {
    expect(sanitizeName('  Ana   Maria  ')).toBe('Ana Maria');
    expect(sanitizeName('Nome muito comprido demais')).toBe('Nome muito c');
    expect(sanitizeName('\u0007​  ')).toBe(DEFAULT_NAME);
    expect(sanitizeName('Zé🕷️')).toBe('Zé🕷️');
  });
});

describe('Melhor por nível (2C)', () => {
  it('só sobe: pontuação e estrelas máximas, melhor tempo mínimo', () => {
    let best = updateBestByLevel({}, result({ score: 1000, stars: 2, timeTicks: 2000 }));
    best = updateBestByLevel(best, result({ score: 800, stars: 3, timeTicks: 2500 }));
    expect(best['1']).toEqual({ score: 1000, stars: 3, bestTimeTicks: 2000 });
    best = updateBestByLevel(best, result({ score: 1500, stars: 1, timeTicks: 1800 }));
    expect(best['1']).toEqual({ score: 1500, stars: 3, bestTimeTicks: 1800 });
  });

  it('libera o nível seguinte a cada nível concluído', () => {
    expect(unlockedLevels({}, 5)).toEqual([1]);
    const best = updateBestByLevel(updateBestByLevel({}, result({ levelIndex: 1 })), result({ levelIndex: 2 }));
    expect(unlockedLevels(best, 5)).toEqual([1, 2, 3]);
  });
});

describe('Dados salvos: parse robusto e versionado (2C)', () => {
  it('ida e volta preserva os dados', () => {
    const data = { ...defaultSave(), highscores: [entry(900, 5)], bestByLevel: { '1': { score: 900, stars: 2 as const, bestTimeTicks: 1500 } } };
    expect(parseSaveData(serializeSaveData(data))).toEqual({ data, status: 'ok' });
  });

  it('nada salvo, JSON corrompido ou tipo errado viram o padrão, sem lançar exceção', () => {
    expect(parseSaveData(null)).toEqual({ data: defaultSave(), status: 'empty' });
    for (const raw of ['{quebrado', '[1,2,3]', '"texto"', 'null', '{"version":"x"}']) {
      expect(parseSaveData(raw)).toEqual({ data: defaultSave(), status: 'corrupt' });
    }
  });

  it('versão futura vira o padrão (status future)', () => {
    expect(parseSaveData('{"version":99,"highscores":[]}')).toEqual({ data: defaultSave(), status: 'future' });
  });

  it('migra o formato legado (v0, sem version)', () => {
    const r = parseSaveData('{"highscores":[{"name":"Velho","score":700}]}');
    expect(r.status).toBe('migrated');
    expect(r.data.highscores).toEqual([{ name: 'Velho', score: 700, levelReached: 1, victory: false, date: 0 }]);
  });

  it('entradas inválidas (NaN, negativo, texto) são descartadas; nomes saneados; tabela reordenada e cortada', () => {
    const raw = JSON.stringify({
      version: 1,
      highscores: [
        { name: 'ok', score: 100, levelReached: 2, victory: false, date: 1 },
        { name: 'nan', score: 'NaN' },
        { name: 'neg', score: -5 },
        { name: '   ', score: 300, levelReached: 1, date: 2 },
        ...Array.from({ length: 15 }, (_, i) => ({ name: `n${i}`, score: 10 + i, date: 3 })),
      ],
      bestByLevel: { '1': { score: 50, stars: 9, bestTimeTicks: -3 }, lixo: { score: 1 } },
    });
    const r = parseSaveData(raw);
    expect(r.status).toBe('ok');
    expect(r.data.highscores).toHaveLength(10);
    expect(r.data.highscores[0]).toMatchObject({ name: DEFAULT_NAME, score: 300 });
    expect(r.data.highscores.some((e) => e.name === 'nan' || e.name === 'neg')).toBe(false);
    expect(r.data.bestByLevel).toEqual({ '1': { score: 50, stars: 3, bestTimeTicks: null } });
  });
});
