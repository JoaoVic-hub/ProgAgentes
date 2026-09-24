import { describe, it, expect } from 'vitest';
import { generateLevel, LEVEL_Z_AFTER_FINISH, LEVEL_Z_BEFORE_START } from './generator';
import { LEVEL_SPECS, getLevelSpec } from './specs';
import { querySolidIds } from './broadphase';
import { boxesOverlap } from '../math/geom';
import type { Level } from '../types';

const LEVELS: Level[] = LEVEL_SPECS.map((spec) => generateLevel(spec));

describe('Gerador de níveis (determinismo e invariantes)', () => {
  it('a mesma spec e a mesma seed geram o mesmo nível', () => {
    for (const spec of LEVEL_SPECS) expect(generateLevel(spec)).toEqual(generateLevel(spec));
  });

  it('seeds diferentes geram cidades diferentes', () => {
    const a = generateLevel(LEVEL_SPECS[0], 1);
    const b = generateLevel(LEVEL_SPECS[0], 2);
    expect(a.solids).not.toEqual(b.solids);
  });

  it('nenhum par de sólidos se sobrepõe', () => {
    for (const level of LEVELS) {
      const overlaps: string[] = [];
      const s = level.solids;
      for (let i = 0; i < s.length; i++) {
        for (let j = i + 1; j < s.length; j++) {
          if (boxesOverlap(s[i].box, s[j].box)) overlaps.push(`L${level.spec.index}: ${i}×${j}`);
        }
      }
      expect(overlaps).toEqual([]);
    }
  });

  it('o corredor da avenida fica livre acima da rua', () => {
    for (const level of LEVELS) {
      const halfW = level.spec.avenueWidth / 2;
      const corridor = {
        min: { x: -halfW, y: 0, z: -LEVEL_Z_BEFORE_START },
        max: { x: halfW, y: 1000, z: level.spec.length + LEVEL_Z_AFTER_FINISH },
      };
      const blocking = level.solids.filter((s) => boxesOverlap(s.box, corridor));
      expect(blocking).toEqual([]);
    }
  });

  it('alturas dos prédios respeitam a spec e todo sólido tem ≥ 1 m de espessura', () => {
    for (const level of LEVELS) {
      const [hMin, hMax] = level.spec.buildingHeight;
      for (const s of level.solids) {
        const { min, max } = s.box;
        expect(Math.min(max.x - min.x, max.y - min.y, max.z - min.z)).toBeGreaterThanOrEqual(1);
        if (s.kind === 'building' || s.kind === 'glass') {
          expect(max.y).toBeGreaterThanOrEqual(hMin - 0.01);
          expect(max.y).toBeLessThanOrEqual(hMax + 0.01);
        }
      }
    }
  });

  it('sólidos vêm ordenados por min.z e com id igual ao índice', () => {
    for (const level of LEVELS) {
      level.solids.forEach((s, i) => {
        expect(s.id).toBe(i);
        if (i > 0) expect(s.box.min.z).toBeGreaterThanOrEqual(level.solids[i - 1].box.min.z);
      });
    }
  });

  it('vidro nunca ancora e nunca aparece duas vezes seguidas no mesmo lado', () => {
    for (const level of LEVELS) {
      for (const side of [-1, 1] as const) {
        const row = level.solids.filter((s) => s.side === side && (s.kind === 'building' || s.kind === 'glass'));
        for (let i = 1; i < row.length; i++) {
          expect(row[i].kind === 'glass' && row[i - 1].kind === 'glass').toBe(false);
        }
      }
      for (const s of level.solids) expect(s.anchorable).toBe(s.kind === 'building');
    }
  });

  it('dificuldade cresce entre os níveis (comprimento, largura e vidro)', () => {
    for (let i = 1; i < LEVEL_SPECS.length; i++) {
      const a = LEVEL_SPECS[i - 1];
      const b = LEVEL_SPECS[i];
      expect(b.length).toBeGreaterThan(a.length);
      expect(b.avenueWidth).toBeGreaterThanOrEqual(a.avenueWidth);
      expect(b.glassRatio).toBeGreaterThanOrEqual(a.glassRatio);
      expect(b.buildingHeight[1] - b.buildingHeight[0]).toBeGreaterThanOrEqual(a.buildingHeight[1] - a.buildingHeight[0]);
    }
  });

  it('getLevelSpec limita o número do nível ao intervalo existente', () => {
    expect(getLevelSpec(0).index).toBe(1);
    expect(getLevelSpec(3).index).toBe(3);
    expect(getLevelSpec(99).index).toBe(LEVEL_SPECS.length);
  });

  it('gerar cada nível leva menos de 50 ms', () => {
    for (const spec of LEVEL_SPECS) {
      const t0 = performance.now();
      generateLevel(spec);
      expect(performance.now() - t0).toBeLessThan(50);
    }
  });
});

describe('Broadphase em faixas de Z', () => {
  it('retorna todos os sólidos que tocam a faixa consultada (sem falsos negativos)', () => {
    for (const level of LEVELS) {
      for (const [z0, z1] of [[-100, -30], [0, 16], [123.4, 180], [400, 401], [level.finishZ - 60, level.finishZ + 60]]) {
        const got = new Set(querySolidIds(level.broadphase, z0, z1));
        const expected = level.solids.filter((s) => s.box.max.z >= z0 && s.box.min.z <= z1).map((s) => s.id);
        for (const id of expected) expect(got.has(id)).toBe(true);
      }
    }
  });
});
