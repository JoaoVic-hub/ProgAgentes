import { describe, it, expect } from 'vitest';
import { compareEntries, DEFAULT_NAME, insertEntry, qualifies, sanitizeName, ticksToMs, unlockedLevels, updateBestByLevel } from './highscores';
import type { HighscoreEntry } from './highscores';
import { defaultSave, parseSaveData, serializeSaveData } from './save-data';
import type { LevelResult } from './types';

const entry = (timeMs: number, date: number, name = 'Ana'): HighscoreEntry => ({ name, timeMs, date });

function result(over: Partial<LevelResult> = {}): LevelResult {
  return { levelIndex: 1, levelName: 'Avenida Aurora', timeTicks: 1800, stars: 2, falls: 0, hits: 0, perfects: 3, flips: 2, bestMomentum: 3, ...over };
}

describe('Tabela de recordes por tempo', () => {
  it('ordena pelo menor tempo', () => {
    let list: HighscoreEntry[] = [];
    for (const t of [300_000, 90_000, 100_000, 500_000]) list = insertEntry(list, entry(t, t)).list;
    expect(list.map((e) => e.timeMs)).toEqual([90_000, 100_000, 300_000, 500_000]);
  });

  it('corta em 10 e diz a posição de quem entrou (ou null)', () => {
    let list: HighscoreEntry[] = [];
    for (let i = 1; i <= 12; i++) list = insertEntry(list, entry(i * 10_000, i)).list;
    expect(list).toHaveLength(10);
    expect(list[9].timeMs).toBe(100_000);
    expect(insertEntry(list, entry(200_000, 99)).position).toBeNull();
    expect(insertEntry(list, entry(15_000, 99)).position).toBe(2);
  });

  it('empate: quem fez primeiro (data mais antiga) fica na frente; empatar com o 10º não entra', () => {
    const r = insertEntry([entry(50_000, 10, 'Velho')], entry(50_000, 20, 'Novo'));
    expect(r.list.map((e) => e.name)).toEqual(['Velho', 'Novo']);
    expect(compareEntries(entry(500, 1), entry(500, 2))).toBeLessThan(0);
    const full = Array.from({ length: 10 }, (_, i) => entry(60_000 + i * 1000, i));
    expect(qualifies(full, 69_000)).toBe(false); // empata com o último
    expect(qualifies(full, 68_999)).toBe(true);
    expect(qualifies([], 0)).toBe(false); // tempo zero/negativo é inválido
    expect(qualifies([], Number.NaN)).toBe(false);
  });

  it('ticks → ms arredondado', () => {
    expect(ticksToMs(60, 60)).toBe(1000);
    expect(ticksToMs(1, 60)).toBe(17);
    expect(ticksToMs(3, 120)).toBe(25);
  });

  it('nome: 1–12 caracteres, sem controle nem invisíveis, espaços colapsados; vazio vira o padrão', () => {
    expect(sanitizeName('  Ana   Maria  ')).toBe('Ana Maria');
    expect(sanitizeName('Nome muito comprido demais')).toBe('Nome muito c');
    expect(sanitizeName(String.fromCharCode(7, 0x200b, 32, 32))).toBe(DEFAULT_NAME);
    expect(sanitizeName('Zé' + String.fromCodePoint(0x1f577))).toBe('Zé' + String.fromCodePoint(0x1f577));
  });
});

describe('Melhor por nível', () => {
  it('só melhora: menor tempo e mais estrelas, independentes', () => {
    let best = updateBestByLevel({}, result({ timeTicks: 1800, stars: 2 }), 60);
    expect(best['1']).toEqual({ bestTimeMs: 30_000, stars: 2 });
    best = updateBestByLevel(best, result({ timeTicks: 2400, stars: 1 }), 60);
    expect(best['1']).toEqual({ bestTimeMs: 30_000, stars: 2 });
    best = updateBestByLevel(best, result({ timeTicks: 1500, stars: 3 }), 60);
    expect(best['1']).toEqual({ bestTimeMs: 25_000, stars: 3 });
  });

  it('libera o nível seguinte a cada nível concluído', () => {
    expect(unlockedLevels({}, 5)).toEqual([1]);
    const best = updateBestByLevel(updateBestByLevel({}, result({ levelIndex: 1 }), 60), result({ levelIndex: 2 }), 60);
    expect(unlockedLevels(best, 5)).toEqual([1, 2, 3]);
  });
});

describe('Dados salvos: parse robusto e versionado (v2, por tempo)', () => {
  it('ida e volta preserva os dados', () => {
    const data = { ...defaultSave(), times: [entry(95_000, 5)], bestByLevel: { '1': { bestTimeMs: 25_000, stars: 3 as const } } };
    expect(parseSaveData(serializeSaveData(data))).toEqual({ data, status: 'ok' });
  });

  it('nada salvo, JSON corrompido ou tipo errado viram o padrão, sem lançar exceção', () => {
    expect(parseSaveData(null)).toEqual({ data: defaultSave(), status: 'empty' });
    for (const raw of ['{quebrado', '[1,2,3]', '"texto"', 'null', '{"version":"x"}']) {
      expect(parseSaveData(raw)).toEqual({ data: defaultSave(), status: 'corrupt' });
    }
  });

  it('versão futura vira o padrão (status future)', () => {
    expect(parseSaveData('{"version":99,"times":[]}')).toEqual({ data: defaultSave(), status: 'future' });
  });

  it('migra o v1 (pontos por anéis): a tabela recomeça, o melhor tempo por nível é aproveitado sem estrelas', () => {
    const v1 = JSON.stringify({
      version: 1,
      highscores: [{ name: 'Velho', score: 7000, levelReached: 5, victory: true, date: 1 }],
      bestByLevel: { '1': { score: 4000, stars: 3, bestTimeTicks: 1800 }, '2': { score: 10, stars: 1, bestTimeTicks: null } },
    });
    const r = parseSaveData(v1);
    expect(r.status).toBe('migrated');
    expect(r.data.times).toEqual([]);
    expect(r.data.bestByLevel).toEqual({ '1': { bestTimeMs: 30_000, stars: 0 } });
  });

  it('migra o legado v0 (sem version) para uma tabela vazia', () => {
    const r = parseSaveData('{"highscores":[{"name":"Velho","score":700}]}');
    expect(r).toEqual({ data: defaultSave(), status: 'migrated' });
  });

  it('entradas inválidas (NaN, negativo, texto, absurdo) são descartadas; nomes saneados; tabela reordenada e cortada', () => {
    const raw = JSON.stringify({
      version: 2,
      times: [
        { name: 'ok', timeMs: 100_000, date: 1 },
        { name: 'nan', timeMs: 'NaN' },
        { name: 'neg', timeMs: -5 },
        { name: 'dez horas+', timeMs: 36_000_001 },
        { name: '   ', timeMs: 40_000, date: 2 },
        ...Array.from({ length: 15 }, (_, i) => ({ name: `n${i}`, timeMs: 200_000 + i, date: 3 })),
      ],
      bestByLevel: { '1': { bestTimeMs: 25_000.4, stars: 9 }, '2': { bestTimeMs: -1, stars: 1 }, lixo: { bestTimeMs: 1 } },
    });
    const r = parseSaveData(raw);
    expect(r.status).toBe('ok');
    expect(r.data.times).toHaveLength(10);
    expect(r.data.times[0]).toMatchObject({ name: DEFAULT_NAME, timeMs: 40_000 });
    expect(r.data.times[1]).toMatchObject({ name: 'ok', timeMs: 100_000 });
    expect(r.data.times.some((e) => ['nan', 'neg', 'dez horas+'].includes(e.name))).toBe(false);
    expect(r.data.bestByLevel).toEqual({ '1': { bestTimeMs: 25_000, stars: 3 } });
  });
});
