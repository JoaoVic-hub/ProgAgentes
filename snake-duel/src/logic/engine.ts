/**
 * Motor de regras — Duelo da Cobrinha
 *
 * Camada 100% pura (Constitution Principle I): nenhuma função aqui toca
 * DOM, Canvas, localStorage ou qualquer API do navegador. Toda função
 * recebe estado + entradas e devolve um novo estado (Principle III:
 * determinismo — mesmo estado + mesmas entradas ⇒ mesmo resultado).
 */

import type {
  GameState,
  GameConfig,
  Snake,
  Vec2,
  PlayerInput,
  Obstacle,
} from './types';
import { nextInt } from './rng';

// ──────────────────────────────────────────────
// Helpers puros
// ──────────────────────────────────────────────

function vecEq(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

function isOpposite(a: Vec2, b: Vec2): boolean {
  return a.x === -b.x && a.y === -b.y;
}

function addVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function cellsContain(cells: Vec2[], pos: Vec2): boolean {
  return cells.some((c) => vecEq(c, pos));
}

/**
 * Escombros são marca visual/histórica do tabuleiro, não obstáculo letal.
 *
 * Descoberto durante testes: se o escombro de um embate frontal bloqueasse
 * movimento, a cobra andaria de volta sobre o PRÓPRIO escombro que acabou de
 * criar no tick seguinte (geometricamente inevitável — o novo "cabeça" fica
 * exatamente uma célula atrás de onde o escombro se formou, na mesma direção
 * de movimento), matando as duas cobras sempre no primeiro encontro e
 * impedindo o duelo de atrito segmento-a-segmento pretendido pela spec.
 * Escombros de eliminação final, por sua vez, nunca chegam a ser testados
 * de qualquer forma, pois a rodada já termina no instante da eliminação.
 * Por consistência, nenhum tipo de escombro bloqueia movimento.
 */
function obstaclesContain(_obstacles: Obstacle[], _pos: Vec2): boolean {
  return false;
}

function makeSnake(id: 1 | 2, head: Vec2, dir: Vec2, length: number): Snake {
  // corpo se estende no sentido oposto ao movimento inicial
  const cells: Vec2[] = [];
  for (let i = 0; i < length; i++) {
    cells.push({ x: head.x - dir.x * i, y: head.y - dir.y * i });
  }
  return { id, cells, dir, pendingDir: null, alive: true };
}

// ──────────────────────────────────────────────
// Criação de partida / rodada
// ──────────────────────────────────────────────

/** Cria o estado inicial de uma nova PARTIDA (placar zerado). */
export function createGame(config: GameConfig, seed = 1): GameState {
  const base = createRoundState(config, seed);
  return { ...base, roundScores: [0, 0], currentRound: 1 };
}

/** Cria o estado inicial de uma RODADA (mantém placar e config, zera o resto). */
function createRoundState(config: GameConfig, rngState: number): GameState {
  const p1 = makeSnake(1, config.p1Start.head, config.p1Start.dir, config.initialSnakeLength);
  const p2 = makeSnake(2, config.p2Start.head, config.p2Start.dir, config.initialSnakeLength);

  let state: GameState = {
    config,
    phase: 'countdown',
    tick: 0,
    foodsEaten: 0,
    snakes: [p1, p2],
    food: null,
    obstacles: [],
    roundScores: [0, 0],
    currentRound: 1,
    countdownValue: config.countdownTicks as 3 | 2 | 1 | 0,
    roundWinner: null,
    matchWinner: null,
    rngState,
  };

  const [newRngState, pos] = spawnFood(state.snakes, state.obstacles, config, state.rngState);
  state = { ...state, food: { pos }, rngState: newRngState };
  return state;
}

/** Reinicia a rodada preservando placar, config e a rodada atual. */
export function startNextRound(state: GameState): GameState {
  const fresh = createRoundState(state.config, state.rngState);
  return {
    ...fresh,
    roundScores: state.roundScores,
    currentRound: state.currentRound + 1,
  };
}

// ──────────────────────────────────────────────
// Velocidade
// ──────────────────────────────────────────────

/** ms por tick — decremento linear fixo por comida, com piso. Determinístico. */
export function computeTickMs(state: GameState): number {
  const { initialTickMs, tickDecrementMs, minTickMs } = state.config;
  return Math.max(minTickMs, initialTickMs - state.foodsEaten * tickDecrementMs);
}

// ──────────────────────────────────────────────
// Spawn de comida
// ──────────────────────────────────────────────

/** Sorteia uma célula livre (sem cobra, sem obstáculo) usando o PRNG seedado. */
export function spawnFood(
  snakes: [Snake, Snake],
  obstacles: Obstacle[],
  config: GameConfig,
  rngState: number
): [number, Vec2] {
  const occupied = new Set<string>();
  for (const s of snakes) for (const c of s.cells) occupied.add(`${c.x},${c.y}`);
  for (const o of obstacles) occupied.add(`${o.pos.x},${o.pos.y}`);

  const freeCells: Vec2[] = [];
  for (let y = 0; y < config.rows; y++) {
    for (let x = 0; x < config.cols; x++) {
      if (!occupied.has(`${x},${y}`)) freeCells.push({ x, y });
    }
  }

  // Tabuleiro cheio: não há célula livre. Quem chama trata isso (empate).
  if (freeCells.length === 0) return [rngState, { x: -1, y: -1 }];

  const [newState, idx] = nextInt(rngState, freeCells.length);
  return [newState, freeCells[idx]];
}

// ──────────────────────────────────────────────
// Domínio crítico: colisão
// ──────────────────────────────────────────────

export type CollisionType = 'wall' | 'self' | 'opponent' | 'obstacle' | null;

/**
 * Verifica se `nextHead` colide com algo, para a cobra `movingSnake`
 * (cujo corpo atual é `bodyCells`, sem contar a cabeça nova) contra a
 * cobra oponente `otherCells` e os obstáculos do tabuleiro.
 *
 * `willGrow` indica se a cauda NÃO vai se mover neste tick (comeu comida),
 * o que muda a checagem de autocolisão: a cauda atual continua ocupada.
 */
export function checkCollisions(
  nextHead: Vec2,
  bodyCells: Vec2[],
  willGrow: boolean,
  otherCells: Vec2[],
  obstacles: Obstacle[],
  config: GameConfig
): CollisionType {
  if (nextHead.x < 0 || nextHead.x >= config.cols || nextHead.y < 0 || nextHead.y >= config.rows) {
    return 'wall';
  }
  // autocolisão: se vai crescer, a cauda fica onde está (todas as células contam);
  // caso contrário a última célula (cauda) vai se mover, então ela libera o lugar.
  const selfCheckCells = willGrow ? bodyCells : bodyCells.slice(0, -1);
  if (cellsContain(selfCheckCells, nextHead)) return 'self';
  if (cellsContain(otherCells, nextHead)) return 'opponent';
  if (obstaclesContain(obstacles, nextHead)) return 'obstacle';
  return null;
}

// ──────────────────────────────────────────────
// Domínio crítico: embate frontal
// ──────────────────────────────────────────────

/** Duas cabeças colidem se vão para a mesma célula, ou se trocam de posição (atravessam). */
export function isHeadOnClash(h1: Vec2, n1: Vec2, h2: Vec2, n2: Vec2): boolean {
  return vecEq(n1, n2) || (vecEq(n1, h2) && vecEq(n2, h1));
}

/**
 * Resolve um instante de embate frontal: a cabeça de cada cobra é destruída
 * e vira obstáculo no ponto exato da colisão; o segmento seguinte vira a
 * nova cabeça. Se uma cobra ficar sem segmentos, ela é eliminada.
 */
export function resolveHeadOn(
  p1: Snake,
  p2: Snake,
  obstacles: Obstacle[]
): { p1: Snake; p2: Snake; newObstacles: Obstacle[] } {
  const clashObstacles: Obstacle[] = [
    { pos: { ...p1.cells[0] }, type: 'head_clash' },
    { pos: { ...p2.cells[0] }, type: 'head_clash' },
  ];

  const newP1Cells = p1.cells.slice(1);
  const newP2Cells = p2.cells.slice(1);

  const newP1: Snake = { ...p1, cells: newP1Cells, alive: newP1Cells.length > 0 };
  const newP2: Snake = { ...p2, cells: newP2Cells, alive: newP2Cells.length > 0 };

  return { p1: newP1, p2: newP2, newObstacles: [...obstacles, ...clashObstacles] };
}

// ──────────────────────────────────────────────
// Domínio crítico: crescimento
// ──────────────────────────────────────────────

/** Cresce a cobra em um segmento, duplicando a célula da cauda. */
export function growSnake(snake: Snake): Snake {
  const tail = snake.cells[snake.cells.length - 1];
  return { ...snake, cells: [...snake.cells, { ...tail }] };
}

// ──────────────────────────────────────────────
// Domínio crítico: condição de vitória
// ──────────────────────────────────────────────

/** Resultado da rodada: 1 ou 2 (vencedor), 0 (empate), ou null (rodada continua). */
export function evaluateRoundResult(p1Alive: boolean, p2Alive: boolean): 1 | 2 | 0 | null {
  if (!p1Alive && !p2Alive) return 0;
  if (!p1Alive) return 2;
  if (!p2Alive) return 1;
  return null;
}

/** Vencedor da partida (melhor de três: primeiro a 2 vitórias). */
export function evaluateMatchResult(roundScores: [number, number]): 1 | 2 | null {
  if (roundScores[0] >= 2) return 1;
  if (roundScores[1] >= 2) return 2;
  return null;
}

// ──────────────────────────────────────────────
// Direção / input
// ──────────────────────────────────────────────

/** Aplica os inputs do jogador como pendingDir, ignorando reversões de 180°. */
function applyInputs(state: GameState, inputs: PlayerInput[]): GameState {
  const snakes = state.snakes.map((s) => ({ ...s })) as [Snake, Snake];
  for (const input of inputs) {
    const snake = snakes[input.player - 1];
    if (!snake.alive) continue;
    if (isOpposite(input.dir, snake.dir)) continue; // reversão de 180° bloqueada
    snake.pendingDir = input.dir;
  }
  return { ...state, snakes };
}

/** Resolve pendingDir → dir no início do tick. */
function resolveDirections(state: GameState): GameState {
  const snakes = state.snakes.map((s) => {
    if (s.pendingDir && !isOpposite(s.pendingDir, s.dir)) {
      return { ...s, dir: s.pendingDir, pendingDir: null };
    }
    return { ...s, pendingDir: null };
  }) as [Snake, Snake];
  return { ...state, snakes };
}

// ──────────────────────────────────────────────
// Tick principal
// ──────────────────────────────────────────────

/**
 * Avança o jogo em um tick. Função pura: recebe estado + inputs, devolve
 * novo estado. Não modifica o estado recebido.
 */
export function step(state: GameState, inputs: PlayerInput[] = []): GameState {
  if (state.phase === 'countdown') {
    return tickCountdown(state);
  }
  if (state.phase === 'play') {
    return tickPlay(applyInputs(state, inputs));
  }
  if (state.phase === 'round_end') {
    return tickRoundEnd(state);
  }
  // match_end: estado terminal, só avança via ação explícita (reiniciar partida)
  return state;
}

function tickCountdown(state: GameState): GameState {
  const next = state.countdownValue - 1;
  if (next <= 0) {
    return { ...state, phase: 'play', countdownValue: 0, tick: state.tick + 1 };
  }
  return { ...state, countdownValue: next as 3 | 2 | 1, tick: state.tick + 1 };
}

function tickRoundEnd(state: GameState): GameState {
  // A transição real (nova rodada ou fim de partida) é disparada pelo
  // chamador após roundEndDelayMs; aqui só avançamos o contador de tick
  // para manter o determinismo caso algo dependa dele.
  return { ...state, tick: state.tick + 1 };
}

function tickPlay(state: GameState): GameState {
  const resolved = resolveDirections(state);
  const [p1, p2] = resolved.snakes;
  const h1 = p1.cells[0];
  const h2 = p2.cells[0];
  const n1 = addVec(h1, p1.dir);
  const n2 = addVec(h2, p2.dir);

  // ── Embate frontal tem prioridade sobre qualquer outra colisão ──
  if (isHeadOnClash(h1, n1, h2, n2)) {
    const { p1: newP1, p2: newP2, newObstacles } = resolveHeadOn(p1, p2, resolved.obstacles);
    const result = evaluateRoundResult(newP1.alive, newP2.alive);
    return {
      ...resolved,
      snakes: [newP1, newP2],
      obstacles: newObstacles,
      tick: resolved.tick + 1,
      phase: result !== null ? 'round_end' : 'play',
      roundWinner: result,
      roundScores: applyRoundScore(resolved.roundScores, result),
    };
  }

  // ── Movimento normal: checar colisão de cada cobra independentemente ──
  const willGrow1 = resolved.food !== null && vecEq(n1, resolved.food.pos);
  const willGrow2 = resolved.food !== null && vecEq(n2, resolved.food.pos);

  const coll1 = checkCollisions(n1, p1.cells, willGrow1, p2.cells, resolved.obstacles, resolved.config);
  const coll2 = checkCollisions(n2, p2.cells, willGrow2, p1.cells, resolved.obstacles, resolved.config);

  const p1Dies = coll1 !== null;
  const p2Dies = coll2 !== null;

  if (p1Dies || p2Dies) {
    const eliminatedObstacles: Obstacle[] = [];
    let newP1 = p1;
    let newP2 = p2;
    if (p1Dies) {
      eliminatedObstacles.push(...p1.cells.map((pos) => ({ pos, type: 'elimination' as const })));
      newP1 = { ...p1, cells: [], alive: false };
    }
    if (p2Dies) {
      eliminatedObstacles.push(...p2.cells.map((pos) => ({ pos, type: 'elimination' as const })));
      newP2 = { ...p2, cells: [], alive: false };
    }
    const result = evaluateRoundResult(newP1.alive, newP2.alive);
    return {
      ...resolved,
      snakes: [newP1, newP2],
      obstacles: [...resolved.obstacles, ...eliminatedObstacles],
      tick: resolved.tick + 1,
      phase: 'round_end',
      roundWinner: result,
      roundScores: applyRoundScore(resolved.roundScores, result),
    };
  }

  // ── Sem colisão: move as duas cobras normalmente ──
  let newP1: Snake = { ...p1, cells: [n1, ...p1.cells] };
  let newP2: Snake = { ...p2, cells: [n2, ...p2.cells] };
  let foodsEaten = resolved.foodsEaten;
  let food = resolved.food;
  let rngState = resolved.rngState;

  if (willGrow1) {
    foodsEaten += 1;
  } else {
    newP1 = { ...newP1, cells: newP1.cells.slice(0, -1) };
  }
  if (willGrow2) {
    foodsEaten += 1;
  } else {
    newP2 = { ...newP2, cells: newP2.cells.slice(0, -1) };
  }

  if (willGrow1 || willGrow2) {
    const [ns, pos] = spawnFood([newP1, newP2], resolved.obstacles, resolved.config, rngState);
    rngState = ns;
    food = pos.x === -1 ? null : { pos }; // tabuleiro cheio: sem nova comida
  }

  return {
    ...resolved,
    snakes: [newP1, newP2],
    foodsEaten,
    food,
    rngState,
    tick: resolved.tick + 1,
  };
}

function applyRoundScore(
  scores: [number, number],
  result: 1 | 2 | 0 | null
): [number, number] {
  if (result === 1) return [scores[0] + 1, scores[1]];
  if (result === 2) return [scores[0], scores[1] + 1];
  return scores; // null ou 0 (empate) não pontuam
}

// ──────────────────────────────────────────────
// Config padrão + RNG exportados para conveniência dos consumidores
// ──────────────────────────────────────────────

export { DEFAULT_GAME_CONFIG } from './types';
export { nextRandom, nextInt } from './rng';
