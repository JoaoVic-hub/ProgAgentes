/**
 * Desenho de depuração (F1): wireframe de todas as AABBs do nível (um único
 * LineSegments, cor por tipo) + camada dinâmica para raio de mira, âncora e
 * corda, atualizada por frame com dados que main.ts entrega prontos.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import type { Level, SolidKind, Vec3 } from '../logic/types';

const KIND_COLORS: Record<SolidKind, number> = {
  street: 0x6c757d,
  building: 0x80ffdb,
  glass: 0x4cc9f0,
  bounds: 0xff4d6d,
};

/** Arestas de uma caixa como 12 pares de vértices. */
const EDGES: readonly [number, number][] = [
  [0, 1], [1, 3], [3, 2], [2, 0],
  [4, 5], [5, 7], [7, 6], [6, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

export interface DebugSegment {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly color: number;
}

export interface DebugDraw {
  readonly group: Group;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  /** Substitui os segmentos dinâmicos deste frame. */
  setDynamic(segments: readonly DebugSegment[]): void;
  dispose(): void;
}

const MAX_DYNAMIC_SEGMENTS = 256;

export function createDebugDraw(level: Level): DebugDraw {
  const group = new Group();
  group.name = 'debug-draw';
  group.visible = false;

  const solids = level.solids;
  const positions = new Float32Array(solids.length * EDGES.length * 2 * 3);
  const colors = new Float32Array(positions.length);
  const c = new Color();
  let k = 0;
  for (const s of solids) {
    const { min, max } = s.box;
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
      i & 1 ? max.x : min.x,
      i & 2 ? max.y : min.y,
      i & 4 ? max.z : min.z,
    ]);
    c.setHex(KIND_COLORS[s.kind]);
    for (const [i, j] of EDGES) {
      for (const p of [corners[i], corners[j]]) {
        positions.set(p, k);
        colors.set([c.r, c.g, c.b], k);
        k += 3;
      }
    }
  }
  const staticGeo = new BufferGeometry();
  staticGeo.setAttribute('position', new BufferAttribute(positions, 3));
  staticGeo.setAttribute('color', new BufferAttribute(colors, 3));
  const material = new LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.75 });
  const staticLines = new LineSegments(staticGeo, material);
  staticLines.renderOrder = 999;
  staticLines.frustumCulled = false;
  group.add(staticLines);

  const dynPos = new BufferAttribute(new Float32Array(MAX_DYNAMIC_SEGMENTS * 6), 3);
  const dynCol = new BufferAttribute(new Float32Array(MAX_DYNAMIC_SEGMENTS * 6), 3);
  dynPos.setUsage(DynamicDrawUsage);
  dynCol.setUsage(DynamicDrawUsage);
  const dynGeo = new BufferGeometry();
  dynGeo.setAttribute('position', dynPos);
  dynGeo.setAttribute('color', dynCol);
  dynGeo.setDrawRange(0, 0);
  const dynLines = new LineSegments(dynGeo, material);
  dynLines.renderOrder = 1000;
  dynLines.frustumCulled = false;
  group.add(dynLines);

  return {
    group,
    setVisible(visible) {
      group.visible = visible;
    },
    isVisible: () => group.visible,
    setDynamic(segments) {
      const n = Math.min(segments.length, MAX_DYNAMIC_SEGMENTS);
      for (let i = 0; i < n; i++) {
        const s = segments[i];
        c.setHex(s.color);
        dynPos.setXYZ(i * 2, s.a.x, s.a.y, s.a.z);
        dynPos.setXYZ(i * 2 + 1, s.b.x, s.b.y, s.b.z);
        dynCol.setXYZ(i * 2, c.r, c.g, c.b);
        dynCol.setXYZ(i * 2 + 1, c.r, c.g, c.b);
      }
      dynPos.needsUpdate = true;
      dynCol.needsUpdate = true;
      dynGeo.setDrawRange(0, n * 2);
    },
    dispose() {
      group.removeFromParent();
      staticGeo.dispose();
      dynGeo.dispose();
      material.dispose();
    },
  };
}
