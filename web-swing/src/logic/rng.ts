/**
 * PRNG determinístico — Mulberry32 (copiado de snake-duel/src/logic/rng.ts).
 *
 * Princípio III (determinismo): dado o mesmo estado e as mesmas entradas, o
 * tick produz sempre o mesmo resultado. O estado do gerador é um único uint32
 * que cabe no estado do jogo, mantendo-o serializável e reproduzível.
 */

/** Avança o estado do PRNG e retorna [novoEstado, valorAleatorio 0..1). */
export function nextRandom(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  const newState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [newState, value];
}

/** Sorteia um inteiro em [0, maxExclusive), avançando o estado do PRNG. */
export function nextInt(state: number, maxExclusive: number): [number, number] {
  const [newState, value] = nextRandom(state);
  return [newState, Math.floor(value * maxExclusive)];
}

/** Sorteia um real em [min, max), avançando o estado do PRNG. */
export function nextRange(state: number, min: number, max: number): [number, number] {
  const [newState, value] = nextRandom(state);
  return [newState, min + value * (max - min)];
}
