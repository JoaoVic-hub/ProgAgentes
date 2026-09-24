/**
 * Flags de depuração lidas da query string (ex.: ?debug=1&level=3&seed=42).
 *
 * Função pura sobre a string de busca, testável em Node. As flags só valem
 * em desenvolvimento: no build de produção, parseFlags devolve sempre o
 * padrão. Novas flags entram aqui conforme as etapas avançam.
 */

export interface DebugFlags {
  /** Mostra stats (FPS) e o painel de depuração. */
  readonly debug: boolean;
  /** Nível inicial (1-based); null = fluxo normal. */
  readonly level: number | null;
  /** Seed fixa do gerador; null = seed da especificação do nível. */
  readonly seed: number | null;
  /** 'free' = câmera de voo livre (MapControls), sem pointer lock. */
  readonly cam: 'follow' | 'free';
  /** Escala do tempo de simulação (câmera lenta), em (0, 1]. */
  readonly slowmo: number;
  /** Grava os inputs por tick; F9 baixa o JSON. */
  readonly record: boolean;
  /** Frequência da física (60 padrão; 120 para comparar estabilidade). */
  readonly hz: 60 | 120;
  /** 'pose' = visualizador de poses do boneco em vez do jogo. */
  readonly view: 'game' | 'pose';
  /** Não perde vidas nem precisa da cota de anéis. */
  readonly god: boolean;
  /** Apaga os recordes salvos ao abrir. */
  readonly resetScores: boolean;
}

export const DEFAULT_FLAGS: DebugFlags = {
  debug: false,
  level: null,
  seed: null,
  cam: 'follow',
  slowmo: 1,
  record: false,
  hz: 60,
  view: 'game',
  god: false,
  resetScores: false,
} as const;

function parseBool(params: URLSearchParams, key: string): boolean {
  if (!params.has(key)) return false;
  const value = params.get(key);
  return value === '1' || value === 'true' || value === '';
}

function parsePositiveInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

function parseSeed(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n >>> 0 : null;
}

function parseSlowmo(value: string | null): number {
  if (value === null) return 1;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(Math.max(n, 0.05), 1);
}

export function parseFlags(search: string, allowDebug: boolean): DebugFlags {
  if (!allowDebug) return DEFAULT_FLAGS;
  const params = new URLSearchParams(search);
  return {
    debug: parseBool(params, 'debug'),
    level: parsePositiveInt(params.get('level')),
    seed: parseSeed(params.get('seed')),
    cam: params.get('cam') === 'free' ? 'free' : 'follow',
    slowmo: parseSlowmo(params.get('slowmo')),
    record: parseBool(params, 'record'),
    hz: params.get('hz') === '120' ? 120 : 60,
    view: params.get('view') === 'pose' ? 'pose' : 'game',
    god: parseBool(params, 'god'),
    resetScores: parseBool(params, 'resetScores'),
  };
}

/** Flags que alteram o jogo: com qualquer uma delas o run não entra nos recordes. */
export function flagsAffectGameplay(flags: DebugFlags): boolean {
  return (
    flags.level !== null ||
    flags.seed !== null ||
    flags.slowmo !== 1 ||
    flags.hz !== 60 ||
    flags.cam === 'free' ||
    flags.god
  );
}
