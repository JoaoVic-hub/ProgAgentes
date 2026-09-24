/**
 * Cena three.js base: renderer, câmera, luzes, fog e resize.
 *
 * Não conhece regras do jogo; recebe dados prontos (foco da sombra, pose da
 * câmera) de main.ts. DPR limitado a 2 (mesma decisão do snake-duel) e
 * resize via ResizeObserver no próprio canvas.
 */

import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { PALETTE, RENDER_CONFIG } from './palette';

export interface SceneFocus {
  x: number;
  y: number;
  z: number;
}

export interface GameScene {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Faz a caixa de sombra do sol acompanhar o ponto de interesse. */
  setShadowFocus(focus: SceneFocus): void;
  render(): void;
  info(): { calls: number; triangles: number; geometries: number; textures: number };
  dispose(): void;
}

export function createGameScene(canvas: HTMLCanvasElement): GameScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER_CONFIG.maxPixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.background = new Color(PALETTE.sky);
  scene.fog = new Fog(PALETTE.fog, RENDER_CONFIG.fogNear, RENDER_CONFIG.fogFar);

  const camera = new PerspectiveCamera(RENDER_CONFIG.fov, 1, RENDER_CONFIG.near, RENDER_CONFIG.far);
  camera.position.set(0, 6, -10);
  camera.lookAt(0, 2, 10);

  const hemi = new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, RENDER_CONFIG.hemiIntensity);
  scene.add(hemi);

  const sun = new DirectionalLight(PALETTE.sun, RENDER_CONFIG.sunIntensity);
  // luz bem afastada do foco: o volume de sombra cobre as torres de 120 m do L5
  const SUN_OFFSET = new Vector3(-100, 225, -75);
  sun.castShadow = true;
  sun.shadow.mapSize.set(RENDER_CONFIG.shadowMapSize, RENDER_CONFIG.shadowMapSize);
  const ext = RENDER_CONFIG.shadowHalfExtent;
  sun.shadow.camera.left = -ext;
  sun.shadow.camera.right = ext;
  sun.shadow.camera.top = ext;
  sun.shadow.camera.bottom = -ext;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 450;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  // base do espaço da luz (a mesma que o lookAt da câmera de sombra monta)
  const lightDir = SUN_OFFSET.clone().negate().normalize();
  const lightRight = new Vector3().crossVectors(lightDir, new Vector3(0, 1, 0)).normalize();
  const lightUp = new Vector3().crossVectors(lightRight, lightDir).normalize();
  const texel = (2 * ext) / RENDER_CONFIG.shadowMapSize;
  const snapped = new Vector3();

  /**
   * Foco da sombra "grudado" na grade de texels do mapa de sombra, no plano
   * da luz: sem isso, o deslocamento sub-texel a cada frame faz as bordas
   * das sombras tremerem ("shadow swimming") enquanto o jogador se move.
   */
  function setShadowFocus(focus: SceneFocus) {
    const r = Math.round((focus.x * lightRight.x + focus.y * lightRight.y + focus.z * lightRight.z) / texel) * texel;
    const u = Math.round((focus.x * lightUp.x + focus.y * lightUp.y + focus.z * lightUp.z) / texel) * texel;
    const d = focus.x * lightDir.x + focus.y * lightDir.y + focus.z * lightDir.z;
    snapped.copy(lightRight).multiplyScalar(r).addScaledVector(lightUp, u).addScaledVector(lightDir, d);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).add(SUN_OFFSET);
  }
  setShadowFocus({ x: 0, y: 0, z: 0 });

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    // o DPR muda com zoom e ao arrastar a janela para outro monitor
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER_CONFIG.maxPixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // troca de monitor não muda o tamanho CSS (o ResizeObserver não dispara): ouve o DPR
  let dprQuery: MediaQueryList | null = null;
  function watchDpr() {
    dprQuery?.removeEventListener('change', onDprChange);
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener('change', onDprChange);
  }
  function onDprChange() {
    resize();
    watchDpr();
  }
  watchDpr();

  return {
    renderer,
    scene,
    camera,
    setShadowFocus,
    render() {
      renderer.render(scene, camera);
    },
    info() {
      const { render, memory } = renderer.info;
      return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures };
    },
    dispose() {
      observer.disconnect();
      dprQuery?.removeEventListener('change', onDprChange);
      renderer.dispose();
    },
  };
}
