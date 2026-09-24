/**
 * main.ts — cola do Web Swing (Etapa 1).
 *
 * Único arquivo (junto com pose-viewer.ts) que conhece todas as camadas:
 * gera o nível, cria a cena, liga input → step() → render. A simulação roda
 * em ticks fixos (app/clock.ts); o render interpola entre o tick anterior e
 * o atual e usa o look ao vivo do mouse para a câmera.
 *
 * Ferramentas de dev (só em `npm run dev`):
 *   ?debug=1  painel + FPS     ?level=N  ?seed=N     ?cam=free  câmera livre
 *   ?slowmo=0.25              ?hz=120               ?record=1 + F9 baixa inputs
 *   ?view=pose visualizador de poses
 *   F1 wireframes/raios · F2 tuning · F3 congela · "." avança 1 tick
 */

import { Vector3 } from 'three';
import { advanceClock, createClock } from './app/clock';
import type { ClockConfig } from './app/clock';
import { parseFlags } from './app/flags';
import { createCameraFollow, updateCameraFollow } from './app/camera-follow';
import { interpolatePlayer } from './app/frame';
import { DEFAULT_GAME_CONFIG, secondsToTicks } from './logic/config';
import { createGame, step } from './logic/engine';
import { generateLevel } from './logic/level/generator';
import { getLevelSpec } from './logic/level/specs';
import { configHash, hashState, replayRecording } from './logic/replay';
import type { InputRecording } from './logic/replay';
import { attachPoint } from './logic/player/web';
import { safeCameraPivot } from './logic/camera-rig';
import type { GameConfig, GameEvent, GameState, InputFrame } from './logic/types';
import { createGameScene } from './render/scene';
import { createCityView } from './render/city';
import { createWebLine } from './render/web-line';
import { applyCameraPose } from './render/camera';
import { createCharacterRig } from './render/character/rig';
import { createAnimator, updateAnimator } from './render/character/animator';
import type { DebugDraw, DebugSegment } from './render/debug-draw';
import { createMouseKeyboardController } from './input/mouse-keyboard';
import { createOverlay } from './ui/overlay';
import { createCrosshair } from './ui/crosshair';
import type { DebugPanel } from './ui/debug-panel';
import type { TuningGui } from './ui/tuning-gui';

const canvas = document.getElementById('view') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui');
if (!canvas || !uiRoot) throw new Error('index.html precisa de <canvas id="view"> e <div id="ui">');

const DEV = import.meta.env.DEV;
const flags = parseFlags(window.location.search, DEV);

// DEV && …: condição estática para o Rollup remover os chunks de dev do build de produção
if (DEV && flags.view === 'pose') {
  import('./pose-viewer').then(({ runPoseViewer }) => runPoseViewer(canvas, uiRoot));
} else {
  startGame(canvas, uiRoot);
}

function startGame(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
  // ------------------------------------------------------------ simulação
  const spec = getLevelSpec(flags.level ?? 1);
  const level = generateLevel(spec, flags.seed);
  let config: GameConfig = { ...DEFAULT_GAME_CONFIG, tickHz: flags.hz };
  let state: GameState = createGame(level, config);
  let prevState = state;
  const clockConfig: ClockConfig = {
    tickMs: 1000 / config.tickHz,
    maxCatchUpTicks: Math.round((5 * config.tickHz) / 60),
    maxDeltaMs: 250,
  };
  let clock = createClock();
  let alpha = 0;
  let frozen = false;
  let stepRequested = false;
  const recording: InputFrame[] | null = DEV && flags.record ? [] : null;
  const recordingConfigHash = configHash(config);
  let recordingReproducible = true;

  // ------------------------------------------------------------ cena
  const view = createGameScene(canvas);
  const city = createCityView(level, { maxAnisotropy: view.renderer.capabilities.getMaxAnisotropy() });
  view.scene.add(city.group);
  const rig = createCharacterRig();
  const webLine = createWebLine();
  // no voo livre (verificação da 1A) só a cidade é desenhada: as draw calls medidas são as dela
  if (flags.cam !== 'free') {
    view.scene.add(rig.root);
    view.scene.add(webLine.group);
  }
  let animState = createAnimator(0);
  const handPos = new Vector3();

  // ------------------------------------------------------------ input e UI
  const controller = createMouseKeyboardController(canvas);
  controller.setLook(0, 0.15);
  const overlay = createOverlay(uiRoot);
  const crosshair = createCrosshair(uiRoot);
  const levelLabel = `Nível ${spec.index} — ${spec.name}`;
  let camState = createCameraFollow(level, { feet: level.start, vel: state.player.vel, yaw: 0, pitch: 0.15 }, config.rig);
  let freeControls: { update(): void } | null = null;

  if (DEV && flags.cam === 'free') {
    crosshair.setVisible(false);
    import('three/addons/controls/MapControls.js').then(({ MapControls }) => {
      const controls = new MapControls(view.camera, canvas);
      view.camera.position.set(0, 70, -40);
      controls.target.set(0, 0, 60);
      controls.maxDistance = 500;
      controls.keyPanSpeed = 60;
      controls.listenToKeyEvents(window);
      controls.update();
      freeControls = controls;
    });
  } else {
    overlay.show('start', levelLabel);
  }
  overlay.onActivate(async () => {
    // o Chrome recusa o lock por ~1 s depois de um Esc: avisa em vez de parecer quebrado
    if (!(await controller.requestLock())) overlay.setHint('Não deu para capturar o mouse — aguarde um instante e clique de novo.');
  });
  controller.onLockChange((locked) => {
    if (locked) {
      overlay.hide();
      lastFrameTime = null; // retoma sem "pular" o tempo parado
    } else {
      overlay.show('paused', levelLabel);
    }
  });

  // ------------------------------------------------------------ ferramentas de dev
  let debugPanel: DebugPanel | null = null;
  let debugDraw: DebugDraw | null = null;
  if (DEV && flags.debug) {
    import('./ui/debug-panel').then(({ createDebugPanel }) => {
      debugPanel = createDebugPanel(uiRoot);
    });
  }
  if (DEV) {
    (window as unknown as { __webSwing: unknown }).__webSwing = {
      getState: () => state,
      hashState: () => hashState(state),
      /** Reexecuta uma gravação (JSON do F9) e devolve o hash final e se a config bate. */
      loadReplay: (rec: InputRecording) => {
        const r = replayRecording(rec, config);
        return { hash: r.hash, tick: r.state.tick, configMatches: r.configMatches, reproducible: rec.reproducible };
      },
    };
    // carregamento preguiçoso com a promise guardada: F1/F2 apertados de novo antes do
    // import terminar não criam uma segunda instância
    let debugDrawLoading: Promise<DebugDraw> | null = null;
    let tuningLoading: Promise<TuningGui> | null = null;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.code === 'F1') {
        e.preventDefault();
        debugDrawLoading ??= import('./render/debug-draw').then(({ createDebugDraw }) => {
          const d = createDebugDraw(level);
          view.scene.add(d.group);
          debugDraw = d;
          return d;
        });
        void debugDrawLoading.then((d) => d.setVisible(!d.isVisible()));
      } else if (e.code === 'F2') {
        e.preventDefault();
        tuningLoading ??= import('./ui/tuning-gui').then(({ createTuningGui }) => {
          const t = createTuningGui(config, (next) => {
            config = { ...next, tickHz: config.tickHz };
            state = { ...state, config };
            if (recording) recordingReproducible = false; // a gravação deixa de reproduzir o run
          });
          return t;
        });
        void tuningLoading.then((t) => t.toggle());
      } else if (e.code === 'F3') {
        e.preventDefault();
        frozen = !frozen;
      } else if (e.code === 'Period' && frozen) {
        stepRequested = true;
      } else if (e.code === 'F9' && recording) {
        e.preventDefault();
        downloadRecording(recording);
      }
    });
  }

  function downloadRecording(inputs: readonly InputFrame[]) {
    const rec: InputRecording = {
      version: 1,
      levelIndex: spec.index,
      seed: level.seed,
      tickHz: config.tickHz,
      configHash: recordingConfigHash,
      reproducible: recordingReproducible,
      inputs,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(rec)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `web-swing-L${spec.index}-t${state.tick}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ------------------------------------------------------------ loop
  function tickOnce(out: GameEvent[]) {
    const input = controller.consumeInput();
    recording?.push(input);
    prevState = state;
    state = step(state, input);
    for (const e of state.events) out.push(e);
  }

  let lastFrameTime: number | null = null;
  document.addEventListener('visibilitychange', () => {
    lastFrameTime = null;
  });

  function loop(now: number) {
    debugPanel?.begin();
    const realDtMs = lastFrameTime === null ? 0 : Math.min(now - lastFrameTime, 250);
    lastFrameTime = now;
    const running = flags.cam === 'free' || controller.isLocked();
    const events: GameEvent[] = [];
    let ticksThisFrame = 0;

    if (running && !frozen) {
      const adv = advanceClock(clock, realDtMs * flags.slowmo, clockConfig);
      clock = adv.clock;
      for (let i = 0; i < adv.ticks; i++) tickOnce(events);
      ticksThisFrame = adv.ticks;
      alpha = adv.alpha;
    } else if (frozen && stepRequested) {
      tickOnce(events);
      ticksThisFrame = 1;
      stepRequested = false;
      alpha = 1;
    }

    // animação anda no tempo da SIMULAÇÃO (parada na pausa/F3, lenta no slowmo); a câmera usa o tempo real
    const simDtSec = running && !frozen ? (realDtMs * flags.slowmo) / 1000 : ticksThisFrame / config.tickHz;
    renderFrame(realDtMs / 1000, simDtSec, events);
    if (debugPanel) {
      debugPanel.setLines(debugLines(ticksThisFrame));
      debugPanel.end();
    }
    requestAnimationFrame(loop);
  }

  /** Progresso do flip em [0, 1], interpolado entre ticks pelo alpha (sem degraus a 144 Hz). */
  function flipProgress(): number | null {
    const curr = state.player.flipTicks;
    if (curr <= 0) return null;
    const total = secondsToTicks(config.web.flipDuration, config.tickHz);
    const currP = 1 - curr / total;
    const prevTicks = prevState.player.flipTicks;
    if (prevTicks <= 0) return currP;
    const prevP = 1 - prevTicks / total;
    return prevP + (currP - prevP) * alpha;
  }

  function renderFrame(dtSec: number, simDtSec: number, events: readonly GameEvent[]) {
    const p = state.player;
    const interp = interpolatePlayer(prevState.player, p, alpha);
    const look = controller.getLiveLook();

    if (flags.cam === 'free') {
      freeControls?.update();
    } else {
      const r = updateCameraFollow(camState, { feet: interp.feet, vel: interp.vel, yaw: look.yaw, pitch: look.pitch }, level, config.rig, dtSec);
      camState = r.state;
      applyCameraPose(view.camera, r.pose);
    }
    view.setShadowFocus(interp.feet);

    const anim = updateAnimator(
      animState,
      {
        mode: p.mode,
        grounded: p.grounded,
        vel: interp.vel,
        flipProgress: flipProgress(),
        stunTicks: p.stunTicks,
        lookYaw: look.yaw,
        events,
        chest: attachPoint(interp.feet, config.web),
        ropeContact: p.rope ? p.rope.contact : null,
      },
      simDtSec,
    );
    animState = anim.state;
    const contact = p.rope ? p.rope.contact : null;
    rig.update(interp.feet, anim.pose, animState.orientation, contact, simDtSec);
    rig.handWorld(handPos);
    webLine.update(contact ? handPos : null, contact, simDtSec);
    webLine.updateMarker(p.rope ? null : state.aim.point, view.camera, state.aim.source === 'assist');
    crosshair.update(state.aim, p.rope !== null);

    if (debugDraw?.isVisible()) debugDraw.setDynamic(debugSegments());
    view.render();
  }

  function debugSegments(): DebugSegment[] {
    const p = state.player;
    const segs: DebugSegment[] = [];
    const pivot = safeCameraPivot(level, p.pos, p.yaw, config.rig);
    segs.push({ a: pivot, b: state.aim.rayEnd, color: state.aim.point ? 0xffd166 : 0xef476f });
    if (state.aim.point) {
      const c = state.aim.point;
      segs.push({ a: { x: c.x - 0.8, y: c.y, z: c.z }, b: { x: c.x + 0.8, y: c.y, z: c.z }, color: 0x06d6a0 });
      segs.push({ a: { x: c.x, y: c.y - 0.8, z: c.z }, b: { x: c.x, y: c.y + 0.8, z: c.z }, color: 0x06d6a0 });
    }
    const chest = attachPoint(p.pos, config.web);
    if (p.rope) {
      segs.push({ a: chest, b: p.rope.anchor, color: 0x4cc9f0 }); // corda física (âncora virtual)
      segs.push({ a: p.rope.anchor, b: p.rope.contact, color: 0xf72585 }); // deslocamento virtual → contato
    }
    const v = p.vel;
    segs.push({ a: chest, b: { x: chest.x + v.x * 0.1, y: chest.y + v.y * 0.1, z: chest.z + v.z * 0.1 }, color: 0x80ff72 });
    return segs;
  }

  let lastHash = '…';
  function debugLines(ticksThisFrame: number): string[] {
    const p = state.player;
    if (state.tick % 30 === 0 || lastHash === '…') lastHash = hashState(state);
    const f = (n: number) => n.toFixed(1);
    const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    const info = view.info();
    const shots = state.stats.webShots;
    const missPct = shots ? Math.round((100 * state.stats.webMisses) / shots) : 0;
    return [
      `L${spec.index} ${spec.name} · seed ${level.seed} · ${config.tickHz} Hz${flags.slowmo !== 1 ? ` · slowmo ${flags.slowmo}` : ''}${frozen ? ' · CONGELADO (F3)' : ''}`,
      `tick ${state.tick} (+${ticksThisFrame}) · alpha ${alpha.toFixed(2)}`,
      `modo ${p.mode}${p.grounded ? ` (${p.groundKind})` : ''} · anim ${animState.current}${p.stunTicks ? ' · ATORDOADO' : ''}`,
      `pos (${f(p.pos.x)}, ${f(p.pos.y)}, ${f(p.pos.z)}) · |v| ${f(speed)} m/s · chegada ${f(level.finishZ - p.pos.z)} m`,
      p.rope ? `teia L ${f(p.rope.length)} / alvo ${f(p.rope.targetLength)} · impulso ${p.rope.impulseUsed ? 'usado' : 'disponível'}` : 'teia —',
      `mira ${state.aim.source}${state.aim.fail ? ` (direto: ${state.aim.fail})` : ''}`,
      `cliques ${shots} · sem alvo ${state.stats.webMisses} (${missPct}%)`,
      `hash ${lastHash} (a cada 30 ticks)`,
      `draw calls ${info.calls} · triângulos ${(info.triangles / 1000).toFixed(1)}k · geo ${info.geometries} · tex ${info.textures}`,
    ];
  }

  requestAnimationFrame(loop);
}
