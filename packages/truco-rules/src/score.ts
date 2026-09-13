import type { PartidaScore, Time } from './types'

export function aplicarPontos(
  placar: PartidaScore,
  vencedorTime: Time,
  valorMao: number,
): PartidaScore {
  if (vencedorTime === 0) return { time0: placar.time0 + valorMao, time1: placar.time1 }
  return { time0: placar.time0, time1: placar.time1 + valorMao }
}

export function verificarFim(placar: PartidaScore): boolean {
  return placar.time0 >= 12 || placar.time1 >= 12
}