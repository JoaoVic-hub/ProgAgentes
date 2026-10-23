/**
 * Orientação do corpo do boneco — PURA (quatérnios como tuplas, sem three),
 * testável em Node. O corpo fica virado para o yaw e, no swing, inclina o
 * eixo "para cima" em direção ao ponto da teia; a mudança é suavizada por
 * slerp exponencial (independente de FPS).
 */

export type Quat = readonly [x: number, y: number, z: number, w: number];
export interface V3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

export function quatFromAxisAngle(axis: V3, angle: number): Quat {
  const h = angle / 2;
  const s = Math.sin(h);
  return [axis.x * s, axis.y * s, axis.z * s, Math.cos(h)];
}

/** Rotação mínima que leva o vetor unitário `from` em `to`. */
export function quatFromUnitVectors(from: V3, to: V3): Quat {
  let r = from.x * to.x + from.y * to.y + from.z * to.z + 1;
  let x: number;
  let y: number;
  let z: number;
  if (r < 1e-8) {
    // vetores opostos: qualquer eixo perpendicular serve
    r = 0;
    if (Math.abs(from.x) > Math.abs(from.z)) {
      x = -from.y;
      y = from.x;
      z = 0;
    } else {
      x = 0;
      y = -from.z;
      z = from.y;
    }
  } else {
    x = from.y * to.z - from.z * to.y;
    y = from.z * to.x - from.x * to.z;
    z = from.x * to.y - from.y * to.x;
  }
  return normalizeQuat([x, y, z, r]);
}

export function normalizeQuat(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/** a·b (aplica b e depois a). */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    // caminho mais curto
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    cos = -cos;
  }
  if (cos > 0.9995) {
    return normalizeQuat([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
  }
  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

export function rotateVector(q: Quat, v: V3): V3 {
  const [x, y, z, w] = q;
  // v' = v + 2w(q×v) + 2q×(q×v)
  const cx = y * v.z - z * v.y;
  const cy = z * v.x - x * v.z;
  const cz = x * v.y - y * v.x;
  const ccx = y * cz - z * cy;
  const ccy = z * cx - x * cz;
  const ccz = x * cy - y * cx;
  return { x: v.x + 2 * (w * cx + ccx), y: v.y + 2 * (w * cy + ccy), z: v.z + 2 * (w * cz + ccz) };
}

const UP: V3 = { x: 0, y: 1, z: 0 };

/**
 * Orientação-alvo do corpo: yaw em torno de Y e, com teia, inclinação do
 * eixo "para cima" em direção ao contato (lean = fração do caminho; 1 = o
 * corpo deitaria alinhado com a teia).
 */
export function bodyOrientationTarget(facingYaw: number, chest: V3, ropeContact: V3 | null, lean: number): Quat {
  const yawQ = quatFromAxisAngle(UP, facingYaw);
  if (!ropeContact) return yawQ;
  const dx = ropeContact.x - chest.x;
  const dy = ropeContact.y - chest.y;
  const dz = ropeContact.z - chest.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return yawQ;
  const tilt = quatSlerp(IDENTITY_QUAT, quatFromUnitVectors(UP, { x: dx / len, y: dy / len, z: dz / len }), lean);
  return quatMultiply(tilt, yawQ);
}

/** Aproxima a orientação atual da alvo (fator 1 − e^(−k·dt)). */
export function smoothOrientation(current: Quat, target: Quat, sharpness: number, dt: number): Quat {
  return quatSlerp(current, target, 1 - Math.exp(-sharpness * dt));
}
