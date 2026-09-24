/**
 * Visualizador de poses (?view=pose, só em DEV): o boneco numa plataforma
 * giratória; teclas 1–8 escolhem o estado de animação, que é alimentado com
 * entradas sintéticas (ex.: flip em loop, pouso repetido). Cola de dev,
 * como main.ts — conhece render/ e ui/.
 */

import { CylinderGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { createGameScene } from './render/scene';
import { createCharacterRig } from './render/character/rig';
import { ANIM_STATES, createAnimator, updateAnimator } from './render/character/animator';
import { bodyOrientationTarget } from './render/character/orientation';
import type { AnimInput, AnimState } from './render/character/animator';
import { PALETTE } from './render/palette';

const FLIP_TICKS = 30;

function syntheticInput(state: AnimState, t: number): AnimInput {
  const base: AnimInput = {
    mode: 'ground',
    grounded: true,
    vel: { x: 0, y: 0, z: 0 },
    flipProgress: null,
    stunTicks: 0,
    lookYaw: 0,
    events: [],
    chest: { x: 0, y: 1.3, z: 0 },
    ropeContact: null,
  };
  switch (state) {
    case 'idle':
      return base;
    case 'run':
      return { ...base, vel: { x: 0, y: 0, z: 9 } };
    case 'jump':
      return { ...base, mode: 'air', grounded: false, vel: { x: 0, y: 6, z: 4 } };
    case 'fall':
      return { ...base, mode: 'air', grounded: false, vel: { x: 0, y: -8, z: 4 } };
    case 'swing':
      return { ...base, mode: 'swing', grounded: false, vel: { x: 0, y: -10 * Math.sin(t * 2), z: 15 }, ropeContact: { x: 0.8, y: 7, z: 2.5 } };
    case 'flip': {
      const cycle = (t * 60) % (FLIP_TICKS + 20);
      return { ...base, mode: 'air', grounded: false, vel: { x: 0, y: 2, z: 10 }, flipProgress: cycle < FLIP_TICKS ? cycle / FLIP_TICKS : null };
    }
    case 'land': {
      const fresh = (t % 1) < 1 / 60;
      return fresh ? { ...base, events: [{ type: 'landed', speed: 28, kind: 'roof' }] } : base;
    }
    case 'bonk':
      return { ...base, mode: 'air', grounded: false, stunTicks: 10 };
  }
}

export function runPoseViewer(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
  const view = createGameScene(canvas);
  const disc = new Mesh(new CylinderGeometry(1.4, 1.4, 0.1, 40), new MeshStandardMaterial({ color: PALETTE.ground }));
  disc.position.y = -0.05;
  disc.receiveShadow = true;
  view.scene.add(disc);
  const rig = createCharacterRig();
  view.scene.add(rig.root);
  view.camera.position.set(0, 1.6, 4.2);
  view.camera.lookAt(0, 1, 0);

  const label = document.createElement('div');
  label.className = 'pose-label';
  uiRoot.appendChild(label);

  let current: AnimState = 'idle';
  let anim = createAnimator(0);
  let t = 0;
  let last: number | null = null;
  const ropeContact = new Vector3();

  const renderLabel = () => {
    label.innerHTML = ANIM_STATES.map((s, i) => `<span class="${s === current ? 'on' : ''}">${i + 1} ${s}</span>`).join('');
  };
  renderLabel();
  window.addEventListener('keydown', (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= ANIM_STATES.length) {
      current = ANIM_STATES[n - 1];
      t = 0;
      renderLabel();
    }
  });

  function frame(now: number) {
    const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
    last = now;
    t += dt;
    const turntable = t * 0.5;
    const r = updateAnimator(anim, syntheticInput(current, t), dt);
    anim = r.state;
    // teia imaginária acima e à frente do boneco, girando junto com a plataforma
    ropeContact.set(Math.sin(turntable) * 3, 6, Math.cos(turntable) * 3);
    const contact = current === 'swing' ? ropeContact : null;
    rig.update({ x: 0, y: 0, z: 0 }, r.pose, bodyOrientationTarget(turntable, { x: 0, y: 1.3, z: 0 }, contact, 0.55), contact, dt);
    view.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
