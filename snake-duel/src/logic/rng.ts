/**
 * PRNG determinístico — Mulberry32.
 *
 * Constitution Principle III exige que, dado o mesmo estado e as mesmas
 * entradas, o resultado do tick seja sempre idêntico. Math.random() quebra
 * isso; este gerador é seedado e seu estado inteiro cabe em GameState.rngState,
 * então o estado inteiro do jogo continua sendo um objeto serializável e
 * reproduzível.
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
