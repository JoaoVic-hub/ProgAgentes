/**
 * Renderizador Canvas 2D — Duelo da Cobrinha
 *
 * Portado de docs/design/reference.html. Função pura de desenho: recebe
 * estado + config, desenha pixels. Não guarda estado próprio (Constitution
 * Principle I — camada de renderização não decide regra nenhuma) e não
 * modifica o GameState recebido.
 */

import type { GameState, RenderConfig, Vec2, Snake, Obstacle } from '../logic/types';
import { computeTickMs } from '../logic/engine';

export interface Renderer {
  render(state: GameState): void;
  resize(): void;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, config: RenderConfig, cols: number, rows: number): Renderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context indisponível');

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cols * config.cellSize;
    const h = rows * config.cellSize;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.aspectRatio = `${w} / ${h}`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  sizeCanvas();

  return {
    render(state: GameState) {
      drawFrame(ctx!, state, config, cols, rows);
    },
    resize() {
      sizeCanvas();
    },
    dispose() {
      // nada para liberar hoje; existe para simetria de API e uso futuro
    },
  };
}

// ──────────────────────────────────────────────
// Primitivas de desenho (portadas de reference.html)
// ──────────────────────────────────────────────

export function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  inset: number,
  cellSize: number,
  outlineColor: string
): void {
  ctx.fillStyle = outlineColor;
  ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
  ctx.fillStyle = fill;
  const p = inset;
  ctx.fillRect(x * cellSize + p + 1, y * cellSize + p + 1, cellSize - 2 * p - 2, cellSize - 2 * p - 2);
}

export function drawHead(
  ctx: CanvasRenderingContext2D,
  cell: Vec2,
  dir: Vec2,
  fill: string,
  cellSize: number,
  outlineColor: string
): void {
  drawBlock(ctx, cell.x, cell.y, fill, 0, cellSize, outlineColor);
  const s = cellSize;
  const e = Math.max(2, Math.round(s * 0.13));
  ctx.fillStyle = outlineColor;
  const cx = cell.x * s;
  const cy = cell.y * s;
  const ax = dir.x !== 0 ? (dir.x > 0 ? s - e * 2.2 : e * 1.2) : s * 0.26;
  const ay = dir.y !== 0 ? (dir.y > 0 ? s - e * 2.2 : e * 1.2) : s * 0.26;
  if (dir.x !== 0) {
    ctx.fillRect(cx + ax, cy + s * 0.27, e, e);
    ctx.fillRect(cx + ax, cy + s * 0.6, e, e);
  } else {
    ctx.fillRect(cx + s * 0.27, cy + ay, e, e);
    ctx.fillRect(cx + s * 0.6, cy + ay, e, e);
  }
}

export function drawDebris(
  ctx: CanvasRenderingContext2D,
  pos: Vec2,
  fill: string,
  xColor: string,
  cellSize: number,
  outlineColor: string
): void {
  drawBlock(ctx, pos.x, pos.y, fill, 2, cellSize, outlineColor);
  const s = cellSize;
  ctx.strokeStyle = xColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pos.x * s + s * 0.3, pos.y * s + s * 0.3);
  ctx.lineTo(pos.x * s + s * 0.7, pos.y * s + s * 0.7);
  ctx.moveTo(pos.x * s + s * 0.7, pos.y * s + s * 0.3);
  ctx.lineTo(pos.x * s + s * 0.3, pos.y * s + s * 0.7);
  ctx.stroke();
}

export function drawFood(
  ctx: CanvasRenderingContext2D,
  pos: Vec2,
  fill: string,
  outlineColor: string,
  cellSize: number
): void {
  const s = cellSize;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(pos.x * s + s / 2, pos.y * s + s / 2, s * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  cellSize: number,
  lineColor: string
): void {
  const W = cols * cellSize;
  const H = rows * cellSize;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < cols; x++) {
    ctx.moveTo(x * cellSize + 0.5, 0);
    ctx.lineTo(x * cellSize + 0.5, H);
  }
  for (let y = 1; y < rows; y++) {
    ctx.moveTo(0, y * cellSize + 0.5);
    ctx.lineTo(W, y * cellSize + 0.5);
  }
  ctx.stroke();
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bgColor: string
): void {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
}

// ──────────────────────────────────────────────
// Composição por camada
// ──────────────────────────────────────────────

export function drawSnakes(
  ctx: CanvasRenderingContext2D,
  snakes: [Snake, Snake],
  colors: { p1: string; p2: string },
  cellSize: number,
  outlineColor: string
): void {
  const pairs: [Snake, string][] = [
    [snakes[0], colors.p1],
    [snakes[1], colors.p2],
  ];
  for (const [snake, color] of pairs) {
    for (let i = snake.cells.length - 1; i >= 1; i--) {
      drawBlock(ctx, snake.cells[i].x, snake.cells[i].y, color, 2, cellSize, outlineColor);
    }
    if (snake.cells.length > 0) {
      drawHead(ctx, snake.cells[0], snake.dir, color, cellSize, outlineColor);
    }
  }
}

export function drawObstacles(
  ctx: CanvasRenderingContext2D,
  obstacles: Obstacle[],
  config: RenderConfig
): void {
  for (const o of obstacles) {
    drawDebris(ctx, o.pos, config.colors.debris, config.colors.debrisX, config.cellSize, config.colors.blockOutline);
  }
}

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  config: RenderConfig,
  cols: number
): void {
  const len1 = state.snakes[0].cells.length;
  const len2 = state.snakes[1].cells.length;
  const tickMs = computeTickMs(state);
  const pct = (state.config.initialTickMs - tickMs) / Math.max(1, state.config.initialTickMs - state.config.minTickMs);
  const W = cols * config.cellSize;

  ctx.textBaseline = 'top';
  ctx.font = `400 20px ${config.fonts.display}, sans-serif`;
  ctx.fillStyle = config.colors.p1;
  ctx.textAlign = 'left';
  ctx.fillText(String(len1), 8, 8);
  ctx.fillStyle = config.colors.p2;
  ctx.textAlign = 'right';
  ctx.fillText(String(len2), W - 8, 8);

  // marcadores de rodada (3 pips ao centro)
  const pipSize = 12;
  const gap = 6;
  const totalW = pipSize * 3 + gap * 2;
  const startX = W / 2 - totalW / 2;
  for (let i = 0; i < 3; i++) {
    const wonByP1 = i < state.roundScores[0];
    const wonByP2 = i < state.roundScores[1];
    ctx.fillStyle = wonByP1 ? config.colors.p1 : wonByP2 ? config.colors.p2 : 'transparent';
    ctx.strokeStyle = config.colors.blockOutline;
    ctx.lineWidth = 2;
    const x = startX + i * (pipSize + gap);
    ctx.fillRect(x, 4, pipSize, pipSize);
    ctx.strokeRect(x, 4, pipSize, pipSize);
  }

  // medidor de velocidade abaixo da arena (chamador deve reservar altura extra)
  const barY = ctx.canvas.height / (window.devicePixelRatio || 1) - 14;
  ctx.strokeStyle = config.colors.blockOutline;
  ctx.lineWidth = 2;
  ctx.strokeRect(8, barY, W - 16, 8);
  ctx.fillStyle = config.colors.food;
  ctx.fillRect(9, barY + 1, Math.max(0, (W - 18) * Math.min(1, Math.max(0, pct))), 6);
}

export function drawScreenOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  config: RenderConfig,
  cols: number,
  rows: number
): void {
  const W = cols * config.cellSize;
  const H = rows * config.cellSize;

  if (state.phase === 'countdown' && state.countdownValue > 0) {
    ctx.fillStyle = 'rgba(13,10,31,.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = config.colors.p1;
    ctx.font = `400 ${Math.round(config.cellSize * 2.2)}px ${config.fonts.display}, sans-serif`;
    ctx.fillText(String(state.countdownValue), W / 2, H / 2 - config.cellSize);
    return;
  }

  if (state.phase === 'round_end') {
    ctx.fillStyle = config.colors.overlay;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    const label =
      state.roundWinner === 0
        ? 'Empate na rodada'
        : `Jogador ${state.roundWinner} vence a rodada`;
    ctx.fillStyle = state.roundWinner === 2 ? config.colors.p2 : config.colors.p1;
    ctx.font = `400 ${Math.round(config.cellSize * 1.05)}px ${config.fonts.display}, sans-serif`;
    ctx.fillText(label, W / 2, H / 2 - config.cellSize * 0.4);
    return;
  }

  if (state.phase === 'match_end') {
    ctx.fillStyle = config.colors.overlay;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = state.matchWinner === 2 ? config.colors.p2 : config.colors.p1;
    ctx.font = `400 ${Math.round(config.cellSize * 1.05)}px ${config.fonts.display}, sans-serif`;
    ctx.fillText(`Jogador ${state.matchWinner} vence a partida`, W / 2, H / 2 - config.cellSize * 0.6);
    ctx.fillStyle = config.colors.hudMuted;
    ctx.font = `500 ${Math.round(config.cellSize * 0.6)}px ${config.fonts.ui}, sans-serif`;
    ctx.fillText('Pressione Espaço para jogar de novo', W / 2, H / 2 + config.cellSize * 0.6);
  }
}

// ──────────────────────────────────────────────
// Frame completo
// ──────────────────────────────────────────────

function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  config: RenderConfig,
  cols: number,
  rows: number
): void {
  const W = cols * config.cellSize;
  const H = rows * config.cellSize;

  drawBackground(ctx, W, H, config.colors.background);
  drawGrid(ctx, cols, rows, config.cellSize, config.colors.gridLine);
  drawObstacles(ctx, state.obstacles, config);
  if (state.food) drawFood(ctx, state.food.pos, config.colors.food, config.colors.blockOutline, config.cellSize);
  drawSnakes(ctx, state.snakes, config.colors, config.cellSize, config.colors.blockOutline);
  drawHUD(ctx, state, config, cols);
  drawScreenOverlay(ctx, state, config, cols, rows);
}
