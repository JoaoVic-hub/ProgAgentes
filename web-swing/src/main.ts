/**
 * main.ts — cola do Web Swing (Etapa 2: campanha com pontuação e recordes).
 *
 * Único arquivo (junto com pose-viewer.ts) que conhece todas as camadas:
 * cria a campanha, liga input → step() → render/UI. A simulação roda em
 * ticks fixos (app/clock.ts); o render interpola entre o tick anterior e o
 * atual e usa o look ao vivo do mouse para a câmera. As fases terminais
 * (nível concluído/falhado, fim de jogo, vitória) só saem por aqui:
 * Enter → advanceAfterLevel/restartLevel; fim de run → placar e recordes.
 *
 * Ferramentas de dev (só em `npm run dev`):
 *   ?debug=1  painel + FPS     ?level=N  ?seed=N     ?cam=free  câmera livre
 *   ?slowmo=0.25              ?hz=120               ?record=1 + F9 baixa inputs
 *   ?god=1 sem perder vidas   ?resetScores=1        ?view=pose visualizador de poses
 *   F1 wireframes/raios/anéis · F2 tuning · F3 congela · "." avança 1 tick
 *   N pula para a chegada · K perde vida · R volta ao checkpoint
 */

import { Vector3 } from 'three';
import { advanceClock, createClock } from './app/clock';
import type { ClockConfig } from './app/clock';
import { flagsAffectGameplay, parseFlags } from './app/flags';
import { createCameraFollow, updateCameraFollow } from './app/camera-follow';
import type { CameraFollowState } from './app/camera-follow';
import { interpolatePlayer } from './app/frame';
import { loadSave, recordHighscore, recordLevelBests, resetSave, runQualifies, writeSave } from './app/save';
import { DEFAULT_GAME_CONFIG, secondsToTicks } from './logic/config';
import { advanceAfterLevel, createRun, restartLevel, step } from './logic/engine';
import { debugJumpToFinish, debugLoseLife, debugRespawn } from './logic/progression';
import { multiplierFor } from './logic/scoring';
import { LEVEL_SPECS } from './logic/level/specs';
import { configHash, encodeInputs, hashState, replayRecording } from './logic/replay';
import type { InputRecording } from './logic/replay';
import { attachPoint } from './logic/player/web';
import { safeCameraPivot } from './logic/camera-rig';
import type { GameConfig, GameEvent, GameState, InputFrame, Level } from './logic/types';
import { createGameScene } from './render/scene';
import { createCityView } from './render/city';
import type { CityView } from './render/city';
import { createRingsView } from './render/rings';
import type { RingsView } from './render/rings';
import { createWebLine } from './render/web-line';
import { applyCameraPose } from './render/camera';
import { createCharacterRig } from './render/character/rig';
import { createAnimator, updateAnimator } from './render/character/animator';
import type { DebugDraw, DebugSegment } from './render/debug-draw';
import { createMouseKeyboardController } from './input/mouse-keyboard';
import { createStore } from './storage/store';
import { createOverlay } from './ui/overlay';
import { createCrosshair } from './ui/crosshair';
import { createHud } from './ui/hud';
import { createBanner } from './ui/banner';
import { createScoreboard } from './ui/scoreboard';
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
  // ------------------------------------------------------------ campanha
  let config: GameConfig = { ...DEFAULT_GAME_CONFIG, tickHz: flags.hz };
  const runOptions = {
    startLevel: flags.level ?? 1,
    seedOverride: flags.seed,
    ranked: !flagsAffectGameplay(flags),
    god: flags.god,
  };
  let state: GameState = createRun(config, runOptions);
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
  let runEnded = false;

  // gravação de inputs (?record=1): sempre desde o início da campanha
  const recordingOn = DEV && flags.record;
  let recording: InputFrame[] = [];
  let recordingConfigHash = configHash(config);
  let recordingReproducible = true;
  let recordingSeed = state.level.seed;

  // recordes
  const store = createStore();
  if (flags.resetScores) resetSave(store);
  let save = loadSave(store).data;

  // ------------------------------------------------------------ cena
  const view = createGameScene(canvas);
  const maxAnisotropy = view.renderer.capabilities.getMaxAnisotropy();
  const rig = createCharacterRig();
  const webLine = createWebLine();
  // no voo livre (verificação da 1A) só a cidade é desenhada: as draw calls medidas são as dela
  if (flags.cam !== 'free') {
    view.scene.add(rig.root);
    view.scene.add(webLine.group);
  }
  let animState = createAnimator(0);
  const handPos = new Vector3();

  // views que dependem do nível: recriadas quando state.level muda
  let viewLevel: Level | null = null;
  let city: CityView | null = null;
  let ringsView: RingsView | null = null;
  let debugDraw: DebugDraw | null = null;
  let makeDebugDraw: ((level: Level, ringSlack: number) => DebugDraw) | null = null;
  let camState: CameraFollowState = createCameraFollow(state.level, { feet: state.level.start, vel: state.player.vel, yaw: 0, pitch: 0.15 }, config.rig);

  function resetCamera() {
    const p = state.player;
    const look = controller.getLiveLook();
    camState = createCameraFollow(state.level, { feet: p.pos, vel: p.vel, yaw: look.yaw, pitch: look.pitch }, config.rig);
  }

  function syncLevelViews() {
    if (state.level === viewLevel) return;
    const level = state.level;
    viewLevel = level;
    city?.dispose();
    ringsView?.dispose();
    city = createCityView(level, { maxAnisotropy });
    view.scene.add(city.group);
    ringsView = createRingsView(level);
    view.scene.add(ringsView.group);
    if (debugDraw && makeDebugDraw) {
      const visible = debugDraw.isVisible();
      debugDraw.dispose();
      debugDraw = makeDebugDraw(level, config.scoring.ringSlack);
      view.scene.add(debugDraw.group);
      debugDraw.setVisible(visible);
    }
    prevState = state; // nada de interpolar entre níveis
    animState = createAnimator(0);
    controller.setLook(0, 0.15);
    resetCamera();
  }

  // ------------------------------------------------------------ input e UI
  const controller = createMouseKeyboardController(canvas);
  controller.setLook(0, 0.15);
  const hud = createHud(uiRoot);
  const banner = createBanner(uiRoot);
  const crosshair = createCrosshair(uiRoot);
  const scoreboard = createScoreboard(uiRoot);
  const overlay = createOverlay(uiRoot);
  const levelLabel = () => `Nível ${state.level.spec.index} — ${state.level.spec.name}`;
  let freeControls: { update(): void } | null = null;
  let goBannerUntil = 0;

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
    overlay.show('start', levelLabel());
  }

  async function requestLock() {
    // o Chrome recusa o lock por ~1 s depois de um Esc: avisa em vez de parecer quebrado
    if (!(await controller.requestLock())) overlay.setHint('Não deu para capturar o mouse — aguarde um instante e clique de novo.');
  }
  overlay.onActivate(() => void requestLock());
  controller.onLockChange((locked) => {
    if (locked) {
      overlay.hide();
      lastFrameTime = null; // retoma sem "pular" o tempo parado
    } else if (!scoreboard.isVisible()) {
      overlay.show('paused', levelLabel());
    }
  });

  // Enter segue depois do resumo do nível (só com o jogo em foco, não na pausa)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    if (!(controller.isLocked() || flags.cam === 'free')) return;
    if (state.phase === 'level_complete') {
      e.preventDefault();
      state = advanceAfterLevel(state);
    } else if (state.phase === 'level_failed') {
      e.preventDefault();
      state = restartLevel(state);
    }
  });

  // fim de run: solta o mouse, grava os melhores por nível e mostra o placar
  function handleRunEnd() {
    runEnded = true;
    save = recordLevelBests(save, state);
    writeSave(store, save);
    if (document.pointerLockElement) document.exitPointerLock();
    overlay.hide();
    scoreboard.show({
      victory: state.phase === 'victory',
      runScore: state.runScore,
      results: state.results,
      qualifies: runQualifies(save, state),
      ranked: state.ranked,
      highscores: save.highscores,
      highlight: null,
      persistent: store.persistent,
    });
  }
  scoreboard.onSubmitName((name) => {
    const r = recordHighscore(save, state, name, Date.now());
    save = r.save;
    writeSave(store, save);
    scoreboard.show({
      victory: state.phase === 'victory',
      runScore: state.runScore,
      results: state.results,
      qualifies: false,
      ranked: state.ranked,
      highscores: save.highscores,
      highlight: r.position,
      persistent: store.persistent,
    });
  });
  scoreboard.onPlayAgain(() => {
    scoreboard.hide();
    state = createRun(config, runOptions);
    prevState = state;
    runEnded = false;
    recording = [];
    recordingConfigHash = configHash(config);
    recordingReproducible = true;
    recordingSeed = state.level.seed;
    void requestLock(); // dentro do gesto do clique
  });

  // ------------------------------------------------------------ ferramentas de dev
  let debugPanel: DebugPanel | null = null;
  const eventLog: string[] = [];
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
        return { hash: r.hash, tick: r.state.tick, phase: r.state.phase, levelScore: r.state.levelScore, configMatches: r.configMatches, reproducible: rec.reproducible };
      },
    };
    // carregamento preguiçoso com a promise guardada: F1/F2 apertados de novo antes do
    // import terminar não criam uma segunda instância
    let debugDrawLoading: Promise<DebugDraw> | null = null;
    let tuningLoading: Promise<TuningGui> | null = null;
    /** Atalhos que mexem no estado por fora dos inputs: o run sai do ranking e a gravação deixa de reproduzir. */
    const cheat = (fn: (s: GameState) => GameState) => {
      state = fn(state);
      recordingReproducible = false;
    };
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.code === 'F1') {
        e.preventDefault();
        debugDrawLoading ??= import('./render/debug-draw').then(({ createDebugDraw }) => {
          makeDebugDraw = createDebugDraw;
          const d = createDebugDraw(state.level, config.scoring.ringSlack);
          view.scene.add(d.group);
          debugDraw = d;
          return d;
        });
        void debugDrawLoading.then(() => debugDraw?.setVisible(!debugDraw.isVisible()));
      } else if (e.code === 'F2') {
        e.preventDefault();
        tuningLoading ??= import('./ui/tuning-gui').then(({ createTuningGui }) =>
          createTuningGui(config, (next) => {
            config = { ...next, tickHz: config.tickHz };
            state = { ...state, config };
            recordingReproducible = false; // a gravação deixa de reproduzir o run
          }),
        );
        void tuningLoading.then((t) => t.toggle());
      } else if (e.code === 'F3') {
        e.preventDefault();
        frozen = !frozen;
      } else if (e.code === 'Period' && frozen) {
        stepRequested = true;
      } else if (e.code === 'F9' && recordingOn) {
        e.preventDefault();
        downloadRecording();
      } else if (e.code === 'KeyN') {
        cheat(debugJumpToFinish);
      } else if (e.code === 'KeyK') {
        cheat(debugLoseLife);
      } else if (e.code === 'KeyR') {
        cheat(debugRespawn);
      }
    });
  }

  function downloadRecording() {
    const rec: InputRecording = {
      version: 2,
      levelIndex: runOptions.startLevel,
      seed: recordingSeed,
      tickHz: config.tickHz,
      god: runOptions.god,
      configHash: recordingConfigHash,
      reproducible: recordingReproducible,
      inputs: encodeInputs(recording),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(rec)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `web-swing-L${runOptions.startLevel}-t${state.tick}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ------------------------------------------------------------ loop
  function tickOnce(out: GameEvent[]) {
    const input = controller.consumeInput();
    if (recordingOn) recording.push(input);
    prevState = state;
    state = step(state, input);
    for (const e of state.events) out.push(e);
  }

  let lastFrameTime: number | null = null;
  let timeSec = 0;
  document.addEventListener('visibilitychange', () => {
    lastFrameTime = null;
  });

  function loop(now: number) {
    debugPanel?.begin();
    const realDtMs = lastFrameTime === null ? 0 : Math.min(now - lastFrameTime, 250);
    lastFrameTime = now;
    const running = (flags.cam === 'free' || controller.isLocked()) && !runEnded;
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

    syncLevelViews();
    handleEvents(events, now);
    if ((state.phase === 'game_over' || state.phase === 'victory') && !runEnded) handleRunEnd();

    // animação anda no tempo da SIMULAÇÃO (parada na pausa/F3, lenta no slowmo); a câmera usa o tempo real
    const simDtSec = running && !frozen ? (realDtMs * flags.slowmo) / 1000 : ticksThisFrame / config.tickHz;
    timeSec += simDtSec;
    renderFrame(realDtMs / 1000, simDtSec, events);
    updateUi(now);
    if (debugPanel) {
      debugPanel.setLines(debugLines(ticksThisFrame));
      debugPanel.end();
    }
    requestAnimationFrame(loop);
  }

  function handleEvents(events: readonly GameEvent[], now: number) {
    for (const e of events) {
      if (e.type === 'go') goBannerUntil = now + 700;
      else if (e.type === 'respawned') {
        prevState = state;
        resetCamera();
      } else if (e.type === 'level_complete' && state.ranked) {
        // melhor por nível salvo na hora (não depende de terminar a campanha)
        save = recordLevelBests(save, state);
        writeSave(store, save);
      }
      if (DEV && e.type !== 'web_missed') {
        eventLog.push(`${state.tick} ${e.type}${'points' in e ? ` +${e.points}` : ''}${'reason' in e ? ` (${e.reason})` : ''}`);
        if (eventLog.length > 8) eventLog.shift();
      }
    }
    hud.popups(events);
  }

  function updateUi(now: number) {
    const s = state;
    const cfg = config;
    const playingLike = s.phase === 'countdown' || s.phase === 'playing' || s.phase === 'respawning';
    hud.setVisible(!runEnded && flags.cam !== 'free');
    crosshair.setVisible(playingLike && flags.cam !== 'free');
    const chainStep = cfg.scoring.chainPerStep;
    hud.update({
      levelLabel: levelLabel(),
      levelScore: s.levelScore,
      runScore: s.runScore,
      lives: s.lives,
      maxLives: cfg.progression.lives,
      multiplier: multiplierFor(s.style.chain, cfg.scoring),
      chain: s.style.chain,
      chainProgress: multiplierFor(s.style.chain, cfg.scoring) >= cfg.scoring.maxMultiplier ? 1 : (s.style.chain % chainStep) / chainStep,
      rings: s.ringsCollected.filter(Boolean).length,
      ringsTotal: s.level.rings.length,
      quota: s.level.ringQuota,
    });

    if (s.phase === 'countdown') banner.showCountdown(levelLabel(), Math.max(1, Math.ceil(s.phaseTicks / cfg.tickHz)));
    else if (s.phase === 'respawning') banner.showRespawn(s.lives);
    else if (s.phase === 'level_complete') {
      const r = s.results[s.results.length - 1];
      banner.showLevelComplete(r, s.runScore, s.level.spec.index === LEVEL_SPECS.length, r.timeTicks / cfg.tickHz);
    } else if (s.phase === 'level_failed') banner.showLevelFailed(s.ringsCollected.filter(Boolean).length, s.level.ringQuota, s.lives);
    else if (s.phase === 'playing' && now < goBannerUntil) banner.showGo();
    else banner.hide();
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
    } else if (state.phase === 'respawning') {
      // caiu no vão: a câmera fica onde estava (não mergulha atrás do jogador) até o respawn
    } else {
      const r = updateCameraFollow(camState, { feet: interp.feet, vel: interp.vel, yaw: look.yaw, pitch: look.pitch }, state.level, config.rig, dtSec);
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
    const aiming = state.phase === 'playing' && !p.rope;
    webLine.updateMarker(aiming ? state.aim.point : null, view.camera, state.aim.source === 'assist');
    crosshair.update(state.aim, p.rope !== null);
    ringsView?.update(state.ringsCollected, timeSec, simDtSec);

    if (debugDraw?.isVisible()) debugDraw.setDynamic(debugSegments());
    view.render();
  }

  function debugSegments(): DebugSegment[] {
    const p = state.player;
    const segs: DebugSegment[] = [];
    const pivot = safeCameraPivot(state.level, p.pos, p.yaw, config.rig);
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
    const s = state;
    const p = s.player;
    if (s.tick % 30 === 0 || lastHash === '…') lastHash = hashState(s);
    const f = (n: number) => n.toFixed(1);
    const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    const info = view.info();
    const shots = s.stats.webShots;
    const missPct = shots ? Math.round((100 * s.stats.webMisses) / shots) : 0;
    return [
      `L${s.level.spec.index} ${s.level.spec.name} · seed ${s.level.seed} · ${config.tickHz} Hz${flags.slowmo !== 1 ? ` · slowmo ${flags.slowmo}` : ''}${frozen ? ' · CONGELADO (F3)' : ''}`,
      `fase ${s.phase}${s.phaseTicks ? ` (${s.phaseTicks})` : ''} · vidas ${s.lives}${s.god ? ' (god)' : ''} · ${s.ranked ? 'ranqueado' : 'NÃO ranqueado'} · cp ${s.checkpointIndex}`,
      `tick ${s.tick} (+${ticksThisFrame}) · alpha ${alpha.toFixed(2)}`,
      `modo ${p.mode}${p.grounded ? ` (${p.groundKind})` : ''} · anim ${animState.current}${p.stunTicks ? ' · ATORDOADO' : ''}`,
      `pos (${f(p.pos.x)}, ${f(p.pos.y)}, ${f(p.pos.z)}) · |v| ${f(speed)} m/s · chegada ${f(s.level.finishZ - p.pos.z)} m`,
      p.rope ? `teia L ${f(p.rope.length)} / alvo ${f(p.rope.targetLength)} · impulso ${p.rope.impulseUsed ? 'usado' : 'disponível'}` : 'teia —',
      `pontos ${s.levelScore} (anéis ${s.progress.ringPoints} + estilo ${s.progress.stylePoints}) · chain ${s.style.chain} · timer ${s.style.comboTimerTicks}`,
      `mira ${s.aim.source}${s.aim.fail ? ` (direto: ${s.aim.fail})` : ''} · cliques ${shots} · sem alvo ${s.stats.webMisses} (${missPct}%)`,
      `hash ${lastHash} (a cada 30 ticks)`,
      `draw calls ${info.calls} · triângulos ${(info.triangles / 1000).toFixed(1)}k · geo ${info.geometries} · tex ${info.textures}`,
      '— eventos —',
      ...eventLog,
    ];
  }

  requestAnimationFrame(loop);
}
