/**
 * Tipos compartilhados — Duelo da Cobrinha
 * Usados pela camada de lógica (logic/) e pela camada de renderização (render/).
 */

export type Vec2 = { x: number; y: number };

export type PlayerId = 1 | 2;

export interface Snake {
  id: PlayerId;
  cells: Vec2[];        // [0] = cabeça, ordenado cabeça→cauda
  dir: Vec2;            // direção atual de movimento
  pendingDir: Vec2 | null; // direção pedida pelo jogador, aplicada no próximo tick
  alive: boolean;
}

export interface Food {
  pos: Vec2;
}

export type ObstacleType = 'head_clash' | 'elimination';

export interface Obstacle {
  pos: Vec2;
  type: ObstacleType;
}

export interface GameConfig {
  cols: number;
  rows: number;
  initialTickMs: number;
  minTickMs: number;
  tickDecrementMs: number;
  initialSnakeLength: number;
  p1Start: { head: Vec2; dir: Vec2 };
  p2Start: { head: Vec2; dir: Vec2 };
  countdownTicks: number;   // quantos "ticks visuais" cada número do 3-2-1 dura
  roundEndDelayMs: number;  // pausa antes de avançar pra próxima rodada
}

export type GamePhase = 'countdown' | 'play' | 'round_end' | 'match_end';

export interface GameState {
  config: GameConfig;
  phase: GamePhase;
  tick: number;
  foodsEaten: number;        // contador da rodada atual — dirige a velocidade
  snakes: [Snake, Snake];    // [0]=P1, [1]=P2
  food: Food | null;
  obstacles: Obstacle[];
  roundScores: [number, number]; // [vitórias P1, vitórias P2]
  currentRound: number;      // 1..3
  countdownValue: 3 | 2 | 1 | 0;
  roundWinner: 1 | 2 | 0 | null;   // 0 = empate; null enquanto não decidido
  matchWinner: 1 | 2 | null;
  rngState: number;          // estado do PRNG (serializável, determinístico)
}

export interface PlayerInput {
  player: PlayerId;
  dir: Vec2;
}

export interface RenderConfig {
  cellSize: number;
  colors: {
    background: string;
    gridLine: string;
    p1: string;
    p2: string;
    food: string;
    debris: string;
    debrisX: string;
    blockOutline: string;
    overlay: string;
    hudText: string;
    hudMuted: string;
  };
  fonts: {
    display: string;
    ui: string;
  };
}

// ──────────────────────────────────────────────
// Configuração padrão — valores de docs/design/visual-spec.md
// e das decisões do /speckit.clarify
// ──────────────────────────────────────────────

export const DEFAULT_GAME_CONFIG: GameConfig = {
  cols: 24,
  rows: 16,
  initialTickMs: 180,
  minTickMs: 90,
  tickDecrementMs: 8,
  initialSnakeLength: 5,
  p1Start: { head: { x: 6, y: 12 }, dir: { x: 1, y: 0 } },
  p2Start: { head: { x: 17, y: 3 }, dir: { x: -1, y: 0 } },
  countdownTicks: 3,
  roundEndDelayMs: 2600,
};

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  cellSize: 22,
  colors: {
    background: '#0D0A1F',
    gridLine: '#1F1A3D',
    p1: '#FFC233',
    p2: '#2BE5C8',
    food: '#FF3355',
    debris: '#7A7898',
    debrisX: '#0A0714',
    blockOutline: '#0A0714',
    overlay: 'rgba(13,10,31,.76)',
    hudText: '#F4F0E4',
    hudMuted: '#B3A8D6',
  },
  fonts: {
    display: 'Bungee',
    ui: 'Archivo',
  },
};
