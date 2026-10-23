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
      for (const s of level.solids) expect(s.anchorable).toBe(s.kind === 'building' || s.kind === 'crane');
    }
  });

  it('dificuldade cresce de forma monotônica entre as specs', () => {
    for (let i = 1; i < LEVEL_SPECS.length; i++) {
      const a = LEVEL_SPECS[i - 1];
      const b = LEVEL_SPECS[i];
      expect(b.length).toBeGreaterThan(a.length);
      expect(b.avenueWidth).toBeGreaterThanOrEqual(a.avenueWidth);
      expect(b.glassRatio).toBeGreaterThanOrEqual(a.glassRatio);
      expect(b.buildingHeight[1] - b.buildingHeight[0]).toBeGreaterThanOrEqual(a.buildingHeight[1] - a.buildingHeight[0]);
      expect(b.voids.count).toBeGreaterThanOrEqual(a.voids.count);
      // ameaças: mais lançadores, salvas maiores, mísseis mais rápidos, mais ágeis, mais previsão, menos recarga
      expect(b.threats.launchers).toBeGreaterThan(a.threats.launchers);
      expect(b.threats.salvo).toBeGreaterThanOrEqual(a.threats.salvo);
      expect(b.threats.missileSpeed).toBeGreaterThan(a.threats.missileSpeed);
      expect(b.threats.turnRate).toBeGreaterThan(a.threats.turnRate);
      expect(b.threats.lead).toBeGreaterThanOrEqual(a.threats.lead);
      expect(b.threats.cooldown).toBeLessThan(a.threats.cooldown);
      expect(Number(b.threats.crossfire)).toBeGreaterThanOrEqual(Number(a.threats.crossfire));
      // tempos de estrela crescem com o comprimento; ouro sempre mais exigente que prata
      expect(b.goldTime).toBeGreaterThan(a.goldTime);
      expect(b.silverTime).toBeGreaterThan(a.silverTime);
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

describe('Lançadores, vãos, gruas e checkpoints (Etapa 2)', () => {
  it('lançadores: quantidade da spec, em telhados de prédios comuns ou topo de gruas, em ordem, fora do corredor', () => {
    for (const level of LEVELS) {
      const t = level.spec.threats;
      expect(level.launchers).toHaveLength(t.launchers);
      const halfW = level.spec.avenueWidth / 2;
      level.launchers.forEach((L, i) => {
        expect(L.id).toBe(i);
        if (i > 0) expect(L.pos.z).toBeGreaterThanOrEqual(level.launchers[i - 1].pos.z);
        const roof = level.solids[L.solidId];
        expect(['building', 'crane']).toContain(roof.kind);
        expect(roof.side).toBe(L.side);
        expect(L.pos.y).toBeGreaterThan(roof.box.max.y); // acima do telhado
        expect(L.pos.z).toBeGreaterThanOrEqual(roof.box.min.z);
        expect(L.pos.z).toBeLessThanOrEqual(roof.box.max.z);
        expect(Math.abs(L.pos.x)).toBeGreaterThan(halfW); // sobre o prédio, não sobre a avenida
        expect(L.pos.z).toBeGreaterThan(40);
        expect(L.pos.z).toBeLessThan(level.finishZ);
      });
    }
  });

  it('fogo cruzado (L4+): os lançadores vêm em pares, um de cada lado', () => {
    for (const level of LEVELS.filter((l) => l.spec.threats.crossfire)) {
      const left = level.launchers.filter((L) => L.side < 0).length;
      const right = level.launchers.filter((L) => L.side > 0).length;
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    }
  });

  it('vãos: quantidade da spec, sem rua e sem prédios dentro, com gruas ancoráveis', () => {
    for (const level of LEVELS) {
      expect(level.voids).toHaveLength(level.spec.voids.count);
      for (const v of level.voids) {
        expect(v.end - v.start).toBeGreaterThanOrEqual(level.spec.voids.length[0] - 0.01);
        expect(v.end - v.start).toBeLessThanOrEqual(level.spec.voids.length[1] + 0.01);
        const inside = level.solids.filter((s) => s.box.max.z > v.start + 1e-6 && s.box.min.z < v.end - 1e-6 && s.kind !== 'bounds');
        expect(inside.every((s) => s.kind === 'crane')).toBe(true);
        expect(inside.length).toBeGreaterThanOrEqual(1);
        expect(inside.every((s) => s.anchorable)).toBe(true);
      }
    }
  });

  it('checkpoints: quantidade da spec, em ordem, fora dos vãos e sobre a rua', () => {
    for (const level of LEVELS) {
      expect(level.checkpoints).toHaveLength(level.spec.checkpoints);
      level.checkpoints.forEach((cp, i) => {
        expect(cp.index).toBe(i + 1);
        if (i > 0) expect(cp.z).toBeGreaterThan(level.checkpoints[i - 1].z);
        expect(level.voids.some((v) => cp.z >= v.start - 5 && cp.z <= v.end + 1)).toBe(false);
        expect(cp.spawn.y).toBe(0);
        expect(level.solids.some((s) => s.kind === 'street' && s.box.min.z <= cp.z && s.box.max.z >= cp.z)).toBe(true);
      });
    }
  });

  it('alcançabilidade: a cada 5 m, do meio da avenida a 15 m de altura, há âncora à frente entre 8 e 45 m (inclusive sobre os vãos)', () => {
    for (const level of LEVELS) {
      const missing: number[] = [];
      for (let z = 0; z <= level.finishZ; z += 5) {
        const p = { x: 0, y: 15, z };
        const ok = level.solids.some((s) => {
          if (!s.anchorable || s.side === 0 || s.box.max.z < z || s.box.max.y < 20) return false;
          const faceX = s.side < 0 ? s.box.max.x : s.box.min.x;
          for (let zz = Math.max(z, s.box.min.z); zz <= s.box.max.z; zz += 1) {
            for (const y of [20, (20 + s.box.max.y) / 2, s.box.max.y]) {
              const d = Math.hypot(faceX - p.x, y - p.y, zz - p.z);
              if (d >= 8 && d <= 45) return true;
            }
          }
          return false;
        });
        if (!ok) missing.push(z);
      }
      expect({ level: level.spec.index, missing }).toEqual({ level: level.spec.index, missing: [] });
    }
  });

  it('nenhum prédio de vidro fica de frente para outro de vidro (evita trechos sem âncora)', () => {
    for (const level of LEVELS) {
      const glass = level.solids.filter((s) => s.kind === 'glass');
      for (const a of glass) {
        for (const b of glass) {
          if (a.side === b.side) continue;
          expect(a.box.min.z < b.box.max.z && a.box.max.z > b.box.min.z).toBe(false);
        }
      }
    }
  });
});
