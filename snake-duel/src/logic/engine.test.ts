import { describe, it, expect } from 'vitest';
import { createGame, step, startNextRound, computeTickMs } from './engine';
import { DEFAULT_GAME_CONFIG } from './types';
import type { PlayerInput, GameConfig } from './types';

describe('Determinismo (Constitution Principle III)', () => {
  it('a mesma seed produz o mesmo estado inicial', () => {
    const g1 = createGame(DEFAULT_GAME_CONFIG, 42);
    const g2 = createGame(DEFAULT_GAME_CONFIG, 42);
    expect(g1).toEqual(g2);
  });

  it('a mesma sequência de ticks sem input produz o mesmo estado', () => {
    let s1 = createGame(DEFAULT_GAME_CONFIG, 42);
    let s2 = createGame(DEFAULT_GAME_CONFIG, 42);
    for (let i = 0; i < 20; i++) {
      s1 = step(s1, []);
      s2 = step(s2, []);
    }
    expect(s1).toEqual(s2);
  });
});

describe('Contagem regressiva e velocidade', () => {
  it('countdown desce 3 → 2 → 1 → play', () => {
    let s = createGame(DEFAULT_GAME_CONFIG, 1);
    expect(s.phase).toBe('countdown');
    expect(s.countdownValue).toBe(3);
    s = step(s, []);
    expect(s.countdownValue).toBe(2);
    s = step(s, []);
    expect(s.countdownValue).toBe(1);
    s = step(s, []);
    expect(s.phase).toBe('play');
  });

  it('tick inicial é 180ms e nunca cai abaixo do piso de 90ms', () => {
    const s = createGame(DEFAULT_GAME_CONFIG, 1);
    expect(computeTickMs(s)).toBe(180);
    expect(computeTickMs({ ...s, foodsEaten: 20 })).toBe(90);
    expect(computeTickMs({ ...s, foodsEaten: 5 })).toBe(180 - 5 * 8);
  });
});

describe('Crescimento (domínio crítico)', () => {
  it('cobra cresce um segmento ao comer', () => {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      p2Start: { head: { x: 22, y: 1 }, dir: { x: 0, y: 1 } }, // longe do caminho de P1
    };
    let s = createGame(cfg, 7);
    while (s.phase === 'countdown') s = step(s, []);
    const initialLen = s.snakes[0].cells.length;

    let ate = false;
    for (let i = 0; i < 200 && !ate; i++) {
      const food = s.food!.pos;
      const head = s.snakes[0].cells[0];
      const dir = s.snakes[0].dir;
      let wantDir = dir;
      if (head.y !== food.y) wantDir = { x: 0, y: food.y > head.y ? 1 : -1 };
      else if (head.x !== food.x) wantDir = { x: food.x > head.x ? 1 : -1, y: 0 };
      const inputs: PlayerInput[] = [{ player: 1, dir: wantDir }];
      const before = s.foodsEaten;
      s = step(s, inputs);
      if (s.foodsEaten > before) ate = true;
    }

    expect(ate).toBe(true);
    expect(s.snakes[0].cells.length).toBe(initialLen + 1);
  });

  it('exatamente uma comida existe no tabuleiro durante o jogo', () => {
    let s = createGame(DEFAULT_GAME_CONFIG, 3);
    while (s.phase === 'countdown') s = step(s, []);
    for (let i = 0; i < 10; i++) {
      s = step(s, []);
      if (s.phase === 'play') expect(s.food).not.toBeNull();
    }
  });
});

describe('Colisão (domínio crítico)', () => {
  it('colidir com a parede termina a rodada — oponente vence', () => {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      p1Start: { head: { x: 1, y: 5 }, dir: { x: -1, y: 0 } },
      p2Start: { head: { x: 20, y: 10 }, dir: { x: 0, y: 1 } },
    };
    let s = createGame(cfg, 9);
    while (s.phase === 'countdown') s = step(s, []);
    let guard = 0;
    while (s.phase === 'play' && guard < 10) {
      s = step(s, []);
      guard++;
    }
    expect(s.phase).toBe('round_end');
    expect(s.roundWinner).toBe(2);
  });

  it('reversão de 180° é bloqueada — direção não muda', () => {
    let s = createGame(DEFAULT_GAME_CONFIG, 2);
    while (s.phase === 'countdown') s = step(s, []);
    const dirBefore = s.snakes[0].dir;
    s = step(s, [{ player: 1, dir: { x: -dirBefore.x, y: -dirBefore.y } }]);
    expect(s.snakes[0].dir).toEqual(dirBefore);
  });
});

describe('Embate frontal (domínio crítico)', () => {
  it('cobras do mesmo tamanho se destroem por atrito e terminam em empate mútuo', () => {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      p1Start: { head: { x: 10, y: 8 }, dir: { x: 1, y: 0 } },
      p2Start: { head: { x: 13, y: 8 }, dir: { x: -1, y: 0 } },
      initialSnakeLength: 3,
    };
    let s = createGame(cfg, 3);
    while (s.phase === 'countdown') s = step(s, []);

    let clashes = 0;
    let guard = 0;
    while (s.phase === 'play' && guard < 50) {
      const before = s.snakes[0].cells.length;
      s = step(s, []);
      if (s.snakes[0].cells.length < before) clashes++;
      guard++;
    }

    expect(s.phase).toBe('round_end');
    expect(clashes).toBeGreaterThanOrEqual(2); // atrito segmento a segmento, não elim. instantânea
    expect(s.roundWinner).toBe(0); // mesmo tamanho ⇒ nenhuma é "maior" ⇒ empate
    expect(s.obstacles.filter((o) => o.type === 'head_clash').length).toBeGreaterThanOrEqual(4);
  });

  it('a cobra MAIOR vence o embate frontal contra a menor', () => {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      p1Start: { head: { x: 10, y: 8 }, dir: { x: 1, y: 0 } },
      p2Start: { head: { x: 13, y: 8 }, dir: { x: -1, y: 0 } },
      initialSnakeLength: 3,
    };
    let s = createGame(cfg, 3);
    while (s.phase === 'countdown') s = step(s, []);
    // Comida bem à frente de P1: ele come uma vez e fica maior que P2 antes do encontro.
    s = { ...s, food: { pos: { x: 11, y: 8 } } };
    s = step(s, []);
    expect(s.snakes[0].cells.length).toBe(4);
    expect(s.snakes[1].cells.length).toBe(3);

    let guard = 0;
    while (s.phase === 'play' && guard < 50) {
      s = step(s, []);
      guard++;
    }
    expect(s.phase).toBe('round_end');
    expect(s.roundWinner).toBe(1); // P1 (4 segmentos) vence P2 (3 segmentos)
  });

  it('cobras de 1 segmento colidindo de frente: empate mútuo, sem ponto para ninguém', () => {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      p1Start: { head: { x: 10, y: 8 }, dir: { x: 1, y: 0 } },
      p2Start: { head: { x: 11, y: 8 }, dir: { x: -1, y: 0 } },
      initialSnakeLength: 1,
    };
    let s = createGame(cfg, 5);
    while (s.phase === 'countdown') s = step(s, []);
    s = step(s, []);
    expect(s.phase).toBe('round_end');
    expect(s.roundWinner).toBe(0);
    expect(s.roundScores).toEqual([0, 0]);
  });

  it('escombros de embate frontal não bloqueiam movimento (não são obstáculo letal)', () => {
    // Regressão do bug encontrado em testes manuais: se o escombro bloqueasse
    // movimento, a cobra andaria de volta sobre o PRÓPRIO escombro no tick
    // seguinte (geometricamente inevitável) e o duelo nunca teria mais de
    // um embate. Este teste garante que o duelo de 3 segmentos tem múltiplos
    // embates, não apenas um.
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      p1Start: { head: { x: 10, y: 8 }, dir: { x: 1, y: 0 } },
      p2Start: { head: { x: 13, y: 8 }, dir: { x: -1, y: 0 } },
      initialSnakeLength: 3,
    };
    let s = createGame(cfg, 3);
    while (s.phase === 'countdown') s = step(s, []);
    let clashes = 0;
    let guard = 0;
    while (s.phase === 'play' && guard < 50) {
      const before = s.snakes[0].cells.length;
      s = step(s, []);
      if (s.snakes[0].cells.length < before) clashes++;
      guard++;
    }
    expect(clashes).toBe(3); // 3 segmentos ⇒ exatamente 3 embates até ambas zerarem
  });
});

describe('Condição de vitória — melhor de três (domínio crítico)', () => {
  it('partida termina quando um jogador atinge 2 vitórias de rodada', () => {
    const cfg: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      p1Start: { head: { x: 1, y: 5 }, dir: { x: -1, y: 0 } }, // sempre bate na parede
      p2Start: { head: { x: 20, y: 10 }, dir: { x: 0, y: 1 } },
    };
    let s = createGame(cfg, 9);
    for (let round = 0; round < 2; round++) {
      while (s.phase === 'countdown') s = step(s, []);
      let guard = 0;
      while (s.phase === 'play' && guard < 10) {
        s = step(s, []);
        guard++;
      }
      expect(s.roundWinner).toBe(2);
      if (round === 0) s = startNextRound(s);
    }
    expect(s.roundScores).toEqual([0, 2]);
  });

  it('startNextRound preserva o placar e zera o tabuleiro', () => {
    let s = createGame(DEFAULT_GAME_CONFIG, 1);
    s = { ...s, roundScores: [1, 0] as [number, number] };
    const next = startNextRound(s);
    expect(next.roundScores).toEqual([1, 0]);
    expect(next.currentRound).toBe(s.currentRound + 1);
    expect(next.obstacles).toEqual([]);
    expect(next.phase).toBe('countdown');
  });
});
