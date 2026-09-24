/**
 * Input de mouse + teclado → InputFrame (mesma forma do KeyboardController
 * do snake-duel: consume*() + dispose()).
 *
 * - Pointer lock no canvas: tenta `unadjustedMovement` (sem aceleração do SO)
 *   e cai para o modo normal se o navegador recusar.
 * - Look absoluto (yaw/pitch acumulados); picos de movimento (bug conhecido
 *   de alguns navegadores ao travar/destravar) são descartados.
 * - Bordas rápidas entre dois ticks não se perdem: Espaço tem trava; o botão
 *   tem uma pequena fila (clique rápido = 1 tick preso; soltar+reapertar =
 *   1 tick solto e depois preso de novo).
 * - Teclas são registradas mesmo sem o lock (segurar W ao retomar já anda);
 *   só o que consumeInput expõe depende do jogo estar rodando.
 * - Só normaliza a intenção: nenhuma regra de jogo aqui.
 */

import type { InputFrame } from '../logic/types';

export interface MouseKeyboardConfig {
  /** Radianos por pixel. */
  readonly sensitivity: number;
  readonly invertY: boolean;
  /** Movimentos maiores que isto (px por evento) são descartados. */
  readonly spikeFilterPx: number;
  readonly pitchMin: number;
  readonly pitchMax: number;
}

export const DEFAULT_MOUSE_KEYBOARD: MouseKeyboardConfig = {
  sensitivity: 0.0022,
  invertY: false,
  spikeFilterPx: 300,
  pitchMin: (-65 * Math.PI) / 180,
  pitchMax: (75 * Math.PI) / 180,
};

export interface MouseKeyboardController {
  /** Intenção do tick; limpa as travas de borda (Espaço, clique rápido). */
  consumeInput(): InputFrame;
  /** Look deste instante (para a câmera, sem esperar o próximo tick). */
  getLiveLook(): { yaw: number; pitch: number };
  setLook(yaw: number, pitch: number): void;
  isLocked(): boolean;
  /** Pede o pointer lock (precisa ser chamado dentro de um gesto do usuário). */
  requestLock(): Promise<boolean>;
  onLockChange(listener: (locked: boolean) => void): void;
  dispose(): void;
}

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

function wrapAngle(a: number): number {
  const TWO_PI = Math.PI * 2;
  return a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
}

export function createMouseKeyboardController(
  canvas: HTMLCanvasElement,
  config: MouseKeyboardConfig = DEFAULT_MOUSE_KEYBOARD,
): MouseKeyboardController {
  const held = new Set<string>();
  let yaw = 0;
  let pitch = 0.15;
  let buttonDown = false;
  /** Estados do botão ainda não entregues a um tick (bordas entre ticks). */
  const buttonQueue: boolean[] = [];
  let jumpLatch = false;
  let locked = false;
  const listeners: ((locked: boolean) => void)[] = [];

  function releaseAll() {
    held.clear();
    buttonDown = false;
    buttonQueue.length = 0;
    jumpLatch = false;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (MOVE_KEYS.has(e.code)) {
      held.add(e.code);
      if (locked) e.preventDefault();
    } else if (e.code === 'Space' && locked) {
      if (!e.repeat) jumpLatch = true;
      e.preventDefault();
    }
  }

  function pushButton(down: boolean) {
    buttonDown = down;
    if (buttonQueue[buttonQueue.length - 1] !== down) buttonQueue.push(down);
    if (buttonQueue.length > 4) buttonQueue.shift();
  }

  function onKeyUp(e: KeyboardEvent) {
    held.delete(e.code);
  }

  function onMouseDown(e: MouseEvent) {
    // cliques só contam com o lock confirmado: o clique que PEDE o lock não dispara teia
    if (!locked || e.button !== 0) return;
    pushButton(true);
  }

  function onMouseUp(e: MouseEvent) {
    if (e.button === 0 && buttonDown) pushButton(false);
  }

  function onMouseMove(e: MouseEvent) {
    if (!locked) return;
    const mx = e.movementX;
    const my = e.movementY;
    if (Math.abs(mx) > config.spikeFilterPx || Math.abs(my) > config.spikeFilterPx) return;
    yaw = wrapAngle(yaw - mx * config.sensitivity);
    const dy = my * config.sensitivity * (config.invertY ? -1 : 1);
    pitch = Math.min(Math.max(pitch - dy, config.pitchMin), config.pitchMax);
  }

  function onLockChange() {
    const now = document.pointerLockElement === canvas;
    if (now === locked) return;
    locked = now;
    if (!locked) {
      // o botão e o pulo não sobrevivem à pausa; as teclas sim (keyup continua chegando)
      buttonDown = false;
      buttonQueue.length = 0;
      jumpLatch = false;
    }
    for (const l of listeners) l(locked);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', releaseAll);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    consumeInput() {
      const frame: InputFrame = {
        moveX: ((held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0)) as -1 | 0 | 1,
        moveZ: ((held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0)) as -1 | 0 | 1,
        yaw,
        pitch,
        webHeld: buttonQueue.length > 0 ? (buttonQueue.shift() as boolean) : buttonDown,
        jumpPressed: jumpLatch,
      };
      jumpLatch = false;
      return frame;
    },
    getLiveLook: () => ({ yaw, pitch }),
    setLook(newYaw, newPitch) {
      yaw = wrapAngle(newYaw);
      pitch = Math.min(Math.max(newPitch, config.pitchMin), config.pitchMax);
    },
    isLocked: () => locked,
    async requestLock() {
      try {
        await canvas.requestPointerLock({ unadjustedMovement: true });
      } catch {
        try {
          await canvas.requestPointerLock();
        } catch {
          return false;
        }
      }
      return true;
    },
    onLockChange(listener) {
      listeners.push(listener);
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
  };
}
