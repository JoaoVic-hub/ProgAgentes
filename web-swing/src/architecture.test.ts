/**
 * Teste de arquitetura — faz valer o Princípio I (camadas isoladas) e o
 * Princípio II (lógica pura) automaticamente, lendo o código-fonte cru.
 *
 * Regras:
 *  - logic/ só importa de logic/ e não usa APIs de navegador nem fontes de
 *    não-determinismo;
 *  - render/, input/, ui/, audio/ e storage/ só fazem `import type` de logic/,
 *    exceto logic/math/* (funções puras e sem estado);
 *  - app/ é cola pura: pode usar logic/, mas não three nem DOM;
 *  - render/character/pose.ts, animator.ts e orientation.ts são puros (sem three).
 */

import { describe, it, expect } from 'vitest';

const SOURCES = import.meta.glob(['./**/*.ts', '!./**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface ImportRef {
  spec: string;
  typeOnly: boolean;
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

function findImports(code: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const fromRe = /\b(import|export)\s+(type\s+)?[^;]*?\bfrom\s+['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(fromRe)) refs.push({ spec: m[3], typeOnly: Boolean(m[2]) });
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) refs.push({ spec: m[1], typeOnly: false });
  for (const m of code.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) refs.push({ spec: m[1], typeOnly: false });
  return refs;
}

/** Resolve um import relativo para um caminho a partir de src/ (ex.: "logic/math/vec3"). */
function resolve(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // pacote (three, vitest...)
  const parts = fromFile.replace(/^\.\//, '').split('/');
  parts.pop();
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/').replace(/\.(ts|js)$/, '');
}

const FILES = Object.entries(SOURCES).map(([path, raw]) => ({
  path: path.replace(/^\.\//, ''),
  code: stripComments(raw),
}));

const SHELL_LAYERS = ['render/', 'input/', 'ui/', 'audio/', 'storage/'];
const LOGIC_FORBIDDEN = [
  'Math.random', 'Date.now', 'performance.now', 'window.', 'document.',
  'localStorage', 'requestAnimationFrame', 'console.',
];
const APP_FORBIDDEN = ['window.', 'document.', 'localStorage', 'requestAnimationFrame'];

describe('Arquitetura em camadas (Princípios I e II)', () => {
  it('o glob encontra os arquivos-fonte (o teste não passa no vazio)', () => {
    expect(FILES.some((f) => f.path.startsWith('logic/'))).toBe(true);
    expect(FILES.some((f) => f.path.startsWith('app/'))).toBe(true);
  });

  it('logic/ não importa three, pacotes externos nem outras camadas', () => {
    const violations: string[] = [];
    for (const f of FILES.filter((f) => f.path.startsWith('logic/'))) {
      for (const ref of findImports(f.code)) {
        const target = resolve(f.path, ref.spec);
        if (target === null || !target.startsWith('logic/')) violations.push(`${f.path} → ${ref.spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('logic/ não usa APIs de navegador nem fontes de não-determinismo', () => {
    const violations: string[] = [];
    for (const f of FILES.filter((f) => f.path.startsWith('logic/'))) {
      for (const token of LOGIC_FORBIDDEN) if (f.code.includes(token)) violations.push(`${f.path}: ${token}`);
    }
    expect(violations).toEqual([]);
  });

  it('render/input/ui/audio/storage só fazem import type de logic/ (exceto logic/math)', () => {
    const violations: string[] = [];
    for (const f of FILES.filter((f) => SHELL_LAYERS.some((l) => f.path.startsWith(l)))) {
      for (const ref of findImports(f.code)) {
        const target = resolve(f.path, ref.spec);
        if (target === null || !target.startsWith('logic/')) continue;
        if (!ref.typeOnly && !target.startsWith('logic/math/')) violations.push(`${f.path} → ${ref.spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('app/ é cola pura: sem three e sem DOM', () => {
    const violations: string[] = [];
    for (const f of FILES.filter((f) => f.path.startsWith('app/'))) {
      for (const ref of findImports(f.code)) {
        if (ref.spec === 'three' || ref.spec.startsWith('three/')) violations.push(`${f.path} → ${ref.spec}`);
      }
      for (const token of APP_FORBIDDEN) if (f.code.includes(token)) violations.push(`${f.path}: ${token}`);
    }
    expect(violations).toEqual([]);
  });

  it('poses, animador e orientação do boneco são puros (sem three)', () => {
    const violations: string[] = [];
    for (const f of FILES.filter((f) => /^render\/character\/(pose|animator|orientation)\.ts$/.test(f.path))) {
      for (const ref of findImports(f.code)) {
        if (ref.spec === 'three' || ref.spec.startsWith('three/')) violations.push(`${f.path} → ${ref.spec}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
