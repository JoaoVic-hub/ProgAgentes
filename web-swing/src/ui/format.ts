/**
 * Formatação de tempos para a UI (cronômetro, resultados, recordes).
 * Centésimos TRUNCADOS: o que aparece nunca é melhor que o tempo real.
 */

const MINUS = '−';

/** 28 550 ms → "0:28.55"; 83 004 ms → "1:23.00". */
export function formatTime(ms: number): string {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor((cs % 6000) / 100);
  const hundredths = cs % 100;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/** Diferença para um tempo de referência: "+1.23" (pior) ou "−0.45" (melhor). */
export function formatDelta(ms: number): string {
  const cs = Math.floor(Math.abs(ms) / 10);
  const text = `${Math.floor(cs / 100)}.${String(cs % 100).padStart(2, '0')}`;
  return `${ms < 0 ? MINUS : '+'}${text}`;
}
