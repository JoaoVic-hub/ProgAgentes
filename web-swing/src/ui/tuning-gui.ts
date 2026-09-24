/**
 * Painel de tuning ao vivo (F2, só em DEV) com lil-gui dos addons do three.
 * Edita uma CÓPIA da GameConfig e devolve um objeto novo a cada mudança —
 * o estado do jogo continua imutável. "Copiar JSON" coloca a config no
 * clipboard para colar em logic/config.ts.
 */

import GUI from 'three/addons/libs/lil-gui.module.min.js';
import type { GameConfig } from '../logic/types';

type NumRange = [min: number, max: number, step: number];

const RANGES: Record<string, Record<string, NumRange>> = {
  physics: {
    gravity: [5, 60, 0.5],
    runMax: [2, 25, 0.5],
    airAccel: [0, 30, 0.5],
    airDragQuad: [0, 0.02, 0.0005],
    maxSpeed: [10, 100, 1],
    jumpSpeed: [2, 25, 0.5],
    bonkSpeed: [5, 60, 1],
    ledgeAssist: [0, 3, 0.1],
  },
  web: {
    maxRange: [10, 120, 1],
    lateralPull: [0, 1, 0.05],
    autoReel: [0, 40, 0.5],
    groundReel: [0, 40, 0.5],
    reelRampTime: [0, 1, 0.01],
    streetClearance: [0, 10, 0.1],
    steer: [0, 30, 0.5],
    pump: [0, 20, 0.5],
    swingAssist: [0, 10, 0.1],
    brake: [0, 20, 0.5],
    swingMaxSpeed: [10, 80, 1],
    impulse: [0, 20, 0.5],
    releaseBoostMin: [0, 10, 0.1],
    releaseBoostMax: [0, 15, 0.1],
    releaseUpBoost: [0, 10, 0.1],
    releaseIdealAngleDeg: [0, 80, 1],
    flipUpSpeed: [0, 15, 0.5],
    flipForwardBoost: [0, 15, 0.5],
    ropeSubsteps: [1, 8, 1],
  },
  aim: {
    snapToTop: [0, 30, 0.5],
    coneDeg: [0, 30, 0.5],
    fallbackConeDeg: [0, 45, 0.5],
    preferredDistance: [5, 60, 1],
    hysteresisDeg: [0, 10, 0.5],
    switchImprovement: [0, 1, 0.05],
    bufferTime: [0, 0.5, 0.01],
  },
};

export interface TuningGui {
  toggle(): void;
  dispose(): void;
}

export function createTuningGui(initial: GameConfig, onChange: (config: GameConfig) => void): TuningGui {
  const working = JSON.parse(JSON.stringify(initial)) as Record<string, Record<string, number | boolean>> & { tickHz: number };
  const gui = new GUI({ title: 'Tuning (F2)', width: 300 });
  const emit = () => onChange(JSON.parse(JSON.stringify(working)) as GameConfig);

  for (const [group, ranges] of Object.entries(RANGES)) {
    const folder = gui.addFolder(group);
    for (const [key, [min, max, step]] of Object.entries(ranges)) {
      if (!(key in working[group])) continue;
      folder.add(working[group] as Record<string, number>, key, min, max, step).onChange(emit);
    }
    if (group === 'aim') folder.add(working.aim as Record<string, boolean>, 'assistEnabled').onChange(emit);
    folder.close();
  }
  gui.add(
    {
      copiar: () => {
        void navigator.clipboard?.writeText(JSON.stringify(working, null, 2));
      },
    },
    'copiar',
  ).name('Copiar JSON');
  gui.hide();

  let visible = false;
  return {
    toggle() {
      visible = !visible;
      if (visible) gui.show();
      else gui.hide();
    },
    dispose() {
      gui.destroy();
    },
  };
}
