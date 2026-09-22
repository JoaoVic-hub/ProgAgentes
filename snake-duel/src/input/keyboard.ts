/**
 * Input de teclado — Duelo da Cobrinha
 *
 * Traduz teclas em PlayerInput normalizado. A validação de reversão de
 * 180° acontece no motor (logic/engine.ts), não aqui — este módulo só
 * captura a intenção bruta do jogador.
 */

import type { PlayerInput, Vec2 } from '../logic/types';

const KEY_MAP: Record<string, PlayerInput> = {
  KeyW: { player: 1, dir: { x: 0, y: -1 } },
  KeyS: { player: 1, dir: { x: 0, y: 1 } },
  KeyA: { player: 1, dir: { x: -1, y: 0 } },
  KeyD: { player: 1, dir: { x: 1, y: 0 } },
  ArrowUp: { player: 2, dir: { x: 0, y: -1 } },
  ArrowDown: { player: 2, dir: { x: 0, y: 1 } },
  ArrowLeft: { player: 2, dir: { x: -1, y: 0 } },
  ArrowRight: { player: 2, dir: { x: 1, y: 0 } },
};

export interface KeyboardController {
  /** Retorna e limpa a fila de inputs pendentes (um por jogador, o mais recente). */
  consumeInputs(): PlayerInput[];
  /** Verifica se a tecla de "jogar de novo" (Espaço) foi pressionada desde a última checagem. */
  consumeRestartPressed(): boolean;
  dispose(): void;
}

export function createKeyboardController(target: Window = window): KeyboardController {
  const pending = new Map<1 | 2, Vec2>();
  let restartPressed = false;

  function onKeyDown(e: KeyboardEvent) {
    const mapped = KEY_MAP[e.code];
    if (mapped) {
      e.preventDefault();
      pending.set(mapped.player, mapped.dir);
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      restartPressed = true;
    }
  }

  target.addEventListener('keydown', onKeyDown);

  return {
    consumeInputs() {
      const inputs: PlayerInput[] = [];
      for (const [player, dir] of pending) inputs.push({ player, dir });
      pending.clear();
      return inputs;
    },
    consumeRestartPressed() {
      const v = restartPressed;
      restartPressed = false;
      return v;
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
    },
  };
}
