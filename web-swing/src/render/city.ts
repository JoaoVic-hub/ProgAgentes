/**
 * Visual da cidade a partir do Level lógico (só leitura).
 *
 * - Prédios comuns: um InstancedMesh de caixas unitárias, janelas desenhadas
 *   no shader a partir da posição de mundo (zero texturas externas).
 * - Prédios de vidro (não ancoram a teia): outro InstancedMesh, material
 *   espelhado e faixas verticais, para o jogador reconhecer de longe.
 * - Rua com textura procedural (faixas), calçada/chão e arco de chegada.
 * Paredes invisíveis ('bounds') não são desenhadas.
 */

import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Material, Texture } from 'three';
import type { Level, Solid } from '../logic/types';
import { PALETTE } from './palette';

export interface CityView {
  readonly group: Group;
  dispose(): void;
}

const BUILDING_TINTS = [0x5a5f7d, 0x6b5b73, 0x4f6a7a, 0x7a6a5c, 0x585f6e, 0x6e6e84, 0x4d5570];
const GLASS_TINTS = [0x7fd6e8, 0x8fc1f0, 0x6ecfd0];

/** Injeta o padrão de janelas (ou faixas de vidro) no MeshStandardMaterial. */
function withFacadePattern(material: MeshStandardMaterial, glass: boolean): MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWsPos;\nvarying vec3 vWsNormal;\nflat varying float vInstance;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wsPos4 = vec4(transformed, 1.0);
        vec3 wsN = objectNormal;
        #ifdef USE_INSTANCING
          wsPos4 = instanceMatrix * wsPos4;
          wsN = mat3(instanceMatrix) * wsN;
        #endif
        vWsPos = (modelMatrix * wsPos4).xyz;
        vWsNormal = normalize(mat3(modelMatrix) * wsN);
        #ifdef USE_INSTANCING
          vInstance = float(gl_InstanceID);
        #else
          vInstance = 0.0;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWsPos;\nvarying vec3 vWsNormal;\nflat varying float vInstance;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float vertical = 1.0 - step(0.5, abs(vWsNormal.y));
          vec2 facePos = abs(vWsNormal.x) > 0.5 ? vWsPos.zy : vWsPos.xy;
          ${glass
            ? `vec2 gcell = facePos / vec2(2.4, 3.5);
               vec2 gfw = fwidth(gcell);
               // longe (célula < ~2 px) o padrão vira a média, sem moiré
               float gaa = clamp(1.0 - max(gfw.x, gfw.y) * 2.5, 0.0, 1.0);
               float band = clamp(step(0.9, fract(gcell.x)) + step(0.94, fract(gcell.y)), 0.0, 1.0);
               band = mix(0.15, band, gaa);
               diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.35, band * vertical);
               totalEmissiveRadiance += diffuseColor.rgb * 0.12 * vertical;`
            : `vec2 cell = facePos / vec2(3.2, 3.6);
               vec2 fw = fwidth(cell);
               // longe (janela < ~2 px) o padrão vira a média, sem moiré
               float aa = clamp(1.0 - max(fw.x, fw.y) * 2.5, 0.0, 1.0);
               vec2 f = fract(cell);
               float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.82);
               // semente estável por prédio e por face (antes: floor(pos·normal) alternava pixel a
               // pixel quando a face caía exatamente num inteiro → "chuvisco" nas janelas acesas)
               vec2 id = floor(cell) + vec2(vInstance * 7.0, vInstance * 13.0) + dot(floor(vWsNormal + 0.5), vec3(17.0, 31.0, 47.0));
               float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
               float lit = win * step(0.62, h);
               const float COVERAGE = 0.6 * 0.54;
               win = mix(COVERAGE, win, aa) * vertical * step(4.0, vWsPos.y);
               lit = mix(COVERAGE * 0.38, lit, aa) * vertical * step(4.0, vWsPos.y);
               diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.09, 0.14), win * 0.9);
               totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * lit * 0.9;`}
        }`,
      );
  };
  // chave de cache distinta: os dois materiais geram programas diferentes
  material.customProgramCacheKey = () => (glass ? 'facade-glass' : 'facade-windows');
  return material;
}

function buildInstances(solids: readonly Solid[], material: Material, tints: readonly number[]): InstancedMesh {
  const geometry = new BoxGeometry(1, 1, 1);
  const mesh = new InstancedMesh(geometry, material, Math.max(1, solids.length));
  mesh.count = solids.length;
  const m = new Matrix4();
  const pos = new Vector3();
  const size = new Vector3();
  const q = new Quaternion();
  const color = new Color();
  solids.forEach((s, i) => {
    const { min, max } = s.box;
    pos.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    size.set(max.x - min.x, max.y - min.y, max.z - min.z);
    m.compose(pos, q, size);
    mesh.setMatrixAt(i, m);
    // tom estável por sólido (o id vem do gerador determinístico)
    mesh.setColorAt(i, color.setHex(tints[s.id % tints.length]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function roadTexture(maxAnisotropy: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = `#${PALETTE.asphalt.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, c.width, c.height);
  // grão do asfalto (determinístico: padrão fixo, sem Math.random)
  for (let i = 0; i < 1400; i++) {
    const x = (i * 97) % c.width;
    const y = (i * 181) % c.height;
    g.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.08)';
    g.fillRect(x, y, 2, 2);
  }
  const line = `#${PALETTE.laneLine.toString(16).padStart(6, '0')}`;
  g.fillStyle = line;
  g.fillRect(10, 0, 6, c.height); // bordas
  g.fillRect(c.width - 16, 0, 6, c.height);
  g.fillRect(c.width / 2 - 4, 40, 8, 180); // tracejado central
  g.fillRect(c.width / 2 - 4, 296, 8, 180);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function finishBannerTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d')!;
  const sq = 16;
  for (let y = 0; y < c.height; y += sq) {
    for (let x = 0; x < c.width; x += sq) {
      g.fillStyle = (x / sq + y / sq) % 2 === 0 ? '#f4f0e4' : '#16161d';
      g.fillRect(x, y, sq, sq);
    }
  }
  g.fillStyle = 'rgba(226,59,59,0.92)';
  g.fillRect(150, 8, 212, 48);
  g.fillStyle = '#ffffff';
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('CHEGADA', 256, 33);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function createCityView(level: Level, opts: { maxAnisotropy: number }): CityView {
  const group = new Group();
  group.name = 'city';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const buildings = level.solids.filter((s) => s.kind === 'building');
  const glass = level.solids.filter((s) => s.kind === 'glass');

  const buildingMat = track(withFacadePattern(new MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 }), false));
  const buildingMesh = buildInstances(buildings, buildingMat, BUILDING_TINTS);
  track(buildingMesh.geometry);
  track(buildingMesh); // InstancedMesh.dispose() libera os buffers instanceMatrix/instanceColor na GPU
  group.add(buildingMesh);

  if (glass.length > 0) {
    const glassMat = track(withFacadePattern(new MeshStandardMaterial({ roughness: 0.12, metalness: 0.7 }), true));
    const glassMesh = buildInstances(glass, glassMat, GLASS_TINTS);
    track(glassMesh.geometry);
    track(glassMesh);
    group.add(glassMesh);
  }

  // chão (calçadas/becos) e rua
  const street = level.solids.find((s) => s.kind === 'street');
  if (street) {
    const { min, max } = street.box;
    const lenZ = max.z - min.z;
    const midZ = (min.z + max.z) / 2;
    const groundGeo = track(new PlaneGeometry(max.x - min.x, lenZ));
    const groundMat = track(new MeshStandardMaterial({ color: PALETTE.ground, roughness: 0.95 }));
    const ground = new Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, midZ);
    ground.receiveShadow = true;
    group.add(ground);

    const tex: Texture = track(roadTexture(opts.maxAnisotropy));
    tex.repeat.set(1, lenZ / 24);
    const roadGeo = track(new PlaneGeometry(level.spec.avenueWidth, lenZ));
    const roadMat = track(new MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    const road = new Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, midZ);
    road.receiveShadow = true;
    group.add(road);
  }

  // arco de chegada: dois pilares e uma faixa quadriculada
  const halfW = level.spec.avenueWidth / 2;
  const pillarGeo = track(new BoxGeometry(1.4, 20, 1.4));
  const pillarMat = track(new MeshStandardMaterial({ color: PALETTE.hero, roughness: 0.5 }));
  for (const side of [-1, 1]) {
    const pillar = new Mesh(pillarGeo, pillarMat);
    pillar.position.set(side * (halfW - 1.2), 10, level.finishZ);
    pillar.castShadow = true;
    group.add(pillar);
  }
  const bannerTex = track(finishBannerTexture());
  const bannerGeo = track(new BoxGeometry(level.spec.avenueWidth - 1, 3, 0.4));
  const bannerMat = track(new MeshStandardMaterial({ map: bannerTex, emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: 0.35 }));
  const banner = new Mesh(bannerGeo, bannerMat);
  banner.position.set(0, 18.5, level.finishZ);
  banner.castShadow = true;
  group.add(banner);

  return {
    group,
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
