/**
 * Paleta e parâmetros visuais centralizados (GUIDELINES §5: não hardcodar
 * cores no renderer). Tema: avenida ao entardecer.
 */

export const PALETTE = {
  sky: 0x1b2144,
  fog: 0x2a2f5a,
  hemiSky: 0xa9b8ff,
  hemiGround: 0x3b2f4f,
  sun: 0xffd6a5,
  ground: 0x2b2d42,
  asphalt: 0x23252f,
  laneLine: 0xf2e6c9,
  hero: 0xe23b3b,
  heroAccent: 0x2250c8,
  ring: 0x5ee6ff,
  ringRisky: 0xff7ad9,
  ringGold: 0xffc93c,
  crane: 0xf2b134,
  water: 0x0b1030,
  checkpoint: 0x7cffb2,
} as const;

export const RENDER_CONFIG = {
  maxPixelRatio: 2,
  fov: 70,
  near: 0.1,
  far: 320,
  fogNear: 60,
  fogFar: 300,
  hemiIntensity: 1.1,
  sunIntensity: 2.2,
  shadowMapSize: 2048,
  /** Meia-largura da caixa de sombra ortográfica que segue o foco da câmera. */
  shadowHalfExtent: 70,
} as const;
