/**
 * Speed lines (Etapa 4): riscos radiais nas bordas da tela, num canvas 2D
 * por cima do jogo, com opacidade pela intensidade (app/juice.ts:
 * speedLinesIntensity). Com intensidade 0 o canvas some e não custa nada.
 * O centro fica sempre livre (a mira).
 */

export interface SpeedLines {
  update(intensity: number, dtSec: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const COUNT = 48;

interface Streak {
  angle: number;
  /** Distância do centro (fração da meia-diagonal). */
  r: number;
  len: number;
  speed: number;
  width: number;
}

export function createSpeedLines(root: HTMLElement): SpeedLines {
  const canvas = document.createElement('canvas');
  canvas.className = 'speed-lines';
  canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const streaks: Streak[] = [];
  const spawn = (s?: Streak): Streak => {
    const n = s ?? ({} as Streak);
    n.angle = Math.random() * Math.PI * 2;
    n.r = 0.55 + Math.random() * 0.45;
    n.len = 0.08 + Math.random() * 0.14;
    n.speed = 0.9 + Math.random() * 1.2;
    n.width = 1 + Math.random() * 1.5;
    return n;
  };
  for (let i = 0; i < COUNT; i++) streaks.push(spawn());
  let shown = false;
  let visible = true;

  function resize() {
    const w = Math.max(1, Math.floor(window.innerWidth));
    const h = Math.max(1, Math.floor(window.innerHeight));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  return {
    update(intensity, dtSec) {
      const on = visible && intensity > 0.01 && ctx !== null;
      if (on !== shown) {
        shown = on;
        canvas.style.display = on ? '' : 'none';
      }
      if (!on || !ctx) return;
      resize();
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const half = Math.hypot(cx, cy);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(235, 240, 255, ${(0.35 * intensity).toFixed(3)})`;
      ctx.lineCap = 'round';
      for (const s of streaks) {
        s.r += s.speed * (0.6 + intensity) * dtSec;
        if (s.r - s.len > 1.05) {
          spawn(s);
          s.r = 0.5 + Math.random() * 0.1;
        }
        const c = Math.cos(s.angle);
        const si = Math.sin(s.angle);
        const r0 = Math.max(0.45, s.r - s.len * (0.5 + intensity)) * half;
        const r1 = s.r * half;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(cx + c * r0, cy + si * r0);
        ctx.lineTo(cx + c * r1, cy + si * r1);
        ctx.stroke();
      }
    },
    setVisible(v) {
      visible = v;
    },
    dispose() {
      canvas.remove();
    },
  };
}
