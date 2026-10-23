/**
 * Pool de partículas de tamanho FIXO (Etapa 4) — puro, sem three: testável
 * em Node. Arrays tipados alocados uma vez; quando o pool enche, a
 * partícula nova ocupa o lugar da mais antiga (fila circular). Nada de
 * alocação por frame.
 */

export interface ParticleSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  /** Duração (s). */
  readonly life: number;
  /** Tamanho inicial (m). */
  readonly size: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** Aceleração para baixo (m/s²). */
  readonly gravity: number;
  /** Arrasto exponencial (1/s). */
  readonly drag: number;
}

export interface ParticlePool {
  readonly capacity: number;
  spawn(p: ParticleSpec): void;
  step(dt: number): void;
  alive(): number;
  /** Visita as vivas: índice, posição, tamanho atual e progresso t ∈ [0, 1). */
  forEachAlive(fn: (i: number, x: number, y: number, z: number, size: number, t: number, r: number, g: number, b: number) => void): void;
  clear(): void;
}

export function createParticlePool(capacity: number): ParticlePool {
  const n = Math.max(1, Math.floor(capacity));
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const age = new Float32Array(n);
  const life = new Float32Array(n);
  const size = new Float32Array(n);
  const gravity = new Float32Array(n);
  const drag = new Float32Array(n);
  const live = new Uint8Array(n);
  let next = 0;
  let count = 0;

  return {
    capacity: n,
    spawn(p) {
      if (!(p.life > 0)) return;
      const i = next;
      next = (next + 1) % n;
      if (!live[i]) count++;
      live[i] = 1;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      vel[i * 3] = p.vx;
      vel[i * 3 + 1] = p.vy;
      vel[i * 3 + 2] = p.vz;
      col[i * 3] = p.r;
      col[i * 3 + 1] = p.g;
      col[i * 3 + 2] = p.b;
      age[i] = 0;
      life[i] = p.life;
      size[i] = p.size;
      gravity[i] = p.gravity;
      drag[i] = p.drag;
    },
    step(dt) {
      if (!(dt > 0)) return;
      for (let i = 0; i < n; i++) {
        if (!live[i]) continue;
        age[i] += dt;
        if (age[i] >= life[i]) {
          live[i] = 0;
          count--;
          continue;
        }
        const k = Math.exp(-drag[i] * dt);
        vel[i * 3] *= k;
        vel[i * 3 + 1] = (vel[i * 3 + 1] - gravity[i] * dt) * k;
        vel[i * 3 + 2] *= k;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
    },
    alive: () => count,
    forEachAlive(fn) {
      for (let i = 0; i < n; i++) {
        if (!live[i]) continue;
        const t = age[i] / life[i];
        fn(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], size[i] * (1 - t * t), t, col[i * 3], col[i * 3 + 1], col[i * 3 + 2]);
      }
    },
    clear() {
      live.fill(0);
      count = 0;
    },
  };
}
