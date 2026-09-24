/**
 * main.ts — cola do Web Swing (Etapa 4: áudio, partículas e "juice").
 *
 * Único arquivo (junto com pose-viewer.ts) que conhece todas as camadas:
 * liga input → step() → render/UI e aplica o fluxo de telas. A simulação
 * roda em ticks fixos (app/clock.ts); o render interpola entre o tick
 * anterior e o atual e usa o look ao vivo do mouse para a câmera.
 *
 * Telas: o reducer puro app/screens.ts decide a próxima tela e os efeitos
 * (criar/reiniciar/avançar o run, pedir/soltar o pointer lock); aqui só se
 * aplicam os efeitos. Nos menus livres (título, seleção, recordes, como
 * jogar), o fundo é a demonstração: o replay dourado do L1 (app/demo.ts).
 *
 * Juice (Etapa 4): os eventos do tick viram sons (audio/mapping.ts → engine),
 * partículas (render/fx), trauma de câmera e roll (app/juice.ts); a
 * velocidade vira vento e speed lines. A demonstração não faz som nem treme.
 * `prefers-reduced-motion` desliga tremor, roll e speed lines. M = mudo.
 *
 * Ferramentas de dev (só em `npm run dev`):
 *   ?debug=1  painel + FPS     ?level=N (pula o título)  ?seed=N  ?cam=free  câmera livre
 *   ?slowmo=0.25              ?hz=120               ?record=1 + F9 baixa inputs
 *   ?god=1 mísseis não acertam ?resetScores=1       ?view=pose visualizador de poses
 *   F1 wireframes/raios/lançadores · F2 tuning · F3 congela · "." avança 1 tick
 *   N pula para a chegada · J avança 60 m · K simula um acerto de míssil · R volta ao checkpoint
 */

import { Vector3 } from 'three';
import goldenFixture from './logic/__fixtures__/replay-l1.json';
import { advanceClock, createClock } from './app/clock';
import type { ClockConfig } from './app/clock';
import { flagsAffectGameplay, parseFlags } from './app/flags';
import { createCameraFollow, updateCameraFollow } from './app/camera-follow';
import type { CameraFollowState } from './app/camera-follow';
import { interpolateMissiles, interpolatePlayer } from './app/frame';
import { loadSave, recordHighscore, recordLevelBests, resetSave, runQualifies, runTimeMs, writeSave } from './app/save';
import { threatRadar } from './app/threat-radar';
import { addTrauma, lateralSpeed, NO_SHAKE, shakeOffsets, speedLinesIntensity, stepRoll, stepShake, traumaFor } from './app/juice';
import type { ShakeState } from './app/juice';
import { INITIAL_SCREEN, isMenuScreen, screenReducer } from './app/screens';
import type { Screen, ScreenAction, ScreenEffect } from './app/screens';
import { nextDemoInput, startDemo } from './app/demo';
import type { DemoPlayback } from './app/demo';
import { DEFAULT_GAME_CONFIG, secondsToTicks } from './logic/config';
import { advanceAfterLevel, createRun, restartLevel, step } from './logic/engine';
import { debugHit, debugJumpToFinish, debugRespawn, debugWarpAhead, isTerminal } from './logic/progression';
import { chestOf } from './logic/threats';
import { ticksToMs, unlockedLevels } from './logic/highscores';
import { LEVEL_SPECS } from './logic/level/specs';
import { configHash, encodeInputs, hashState, replayRecording } from './logic/replay';
import type { InputRecording } from './logic/replay';
import { attachPoint } from './logic/player/web';
import { safeCameraPivot } from './logic/camera-rig';
import type { GameConfig, GameEvent, GameState, InputFrame, Level } from './logic/types';
import { createGameScene } from './render/scene';
import { createCityView } from './render/city';
import type { CityView } from './render/city';
import { createThreatsView } from './render/threats';
import type { ThreatsView } from './render/threats';
import { createWebLine } from './render/web-line';
import { applyCameraPose } from './render/camera';
import { createParticlesView } from './render/fx/particles';
import { createAudioEngine } from './audio/engine';
import { countdownValue, cuesFor, proximityInterval } from './audio/mapping';
import { createCharacterRig } from './render/character/rig';
import { createAnimator, updateAnimator } from './render/character/animator';
import type { DebugDraw, DebugSegment } from './render/debug-draw';
import { createMouseKeyboardController } from './input/mouse-keyboard';
import { createStore } from './storage/store';
import { createCrosshair } from './ui/crosshair';
import { createHud } from './ui/hud';
import { createBanner } from './ui/banner';
import { createMenus } from './ui/menus';
import type { LevelCard, MenuData, MenuIntent } from './ui/menus';
import { createThreatIndicator } from './ui/threat-indicator';
import { createSpeedLines } from './ui/speed-lines';
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
  // ------------------------------------------------------------ campanha e telas
  let config: GameConfig = { ...DEFAULT_GAME_CONFIG, tickHz: flags.hz };
  const runOptions = { seedOverride: flags.seed, ranked: !flagsAffectGameplay(flags), god: flags.god };
  const demoRecording = (goldenFixture as unknown as { recording: InputRecording }).recording;
  // ?level=N e ?cam=free (dev) pulam o título e vão direto ao jogo
  const devDirect = DEV && (flags.level !== null || flags.cam === 'free');

  let screen: Screen = devDirect ? { kind: 'game', paused: flags.cam !== 'free' } : INITIAL_SCREEN;
  let state: GameState;
  let demo: DemoPlayback | null = null;
  let demoLook = { yaw: 0, pitch: 0.15 };
  if (devDirect) {
    state = createRun(config, { ...runOptions, startLevel: flags.level ?? 1 });
  } else {
    const d = startDemo(demoRecording, config);
    state = d.state;
    demo = d.playback;
  }
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
  let menuHint = '';

  // gravação de inputs (?record=1): sempre desde o início do run do jogador (nunca a demonstração)
  const recordingOn = DEV && flags.record;
  let recording: InputFrame[] = [];
  let recordingConfigHash = configHash(config);
  let recordingReproducible = true;
  let recordingSeed = state.level.seed;
  let recordingStartLevel = state.startLevel;

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
  const particles = createParticlesView();
  if (flags.cam !== 'free') {
    view.scene.add(rig.root);
    view.scene.add(webLine.group);
    view.scene.add(particles.group);
  }
  // juice visual (Etapa 4): trauma → tremor, roll pela velocidade lateral
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shake: ShakeState = NO_SHAKE;
  let roll = 0;
  let animState = createAnimator(0);
  const handPos = new Vector3();

  // views que dependem do nível: recriadas quando state.level muda
  let viewLevel: Level | null = null;
  let city: CityView | null = null;
  let threatsView: ThreatsView | null = null;
  let debugDraw: DebugDraw | null = null;
  let makeDebugDraw: ((level: Level, activationRange: number) => DebugDraw) | null = null;
  let camState: CameraFollowState = createCameraFollow(state.level, { feet: state.level.start, vel: state.player.vel, yaw: 0, pitch: 0.15 }, config.rig);

  /** Look da câmera: o do mouse no jogo, o da gravação na demonstração. */
  const currentLook = () => (demo ? demoLook : controller.getLiveLook());

  function resetCamera() {
    const p = state.player;
    const look = currentLook();
    camState = createCameraFollow(state.level, { feet: p.pos, vel: p.vel, yaw: look.yaw, pitch: look.pitch }, config.rig);
  }

  /** Estado novo sem continuidade com o anterior (novo run, reinício, troca de nível). */
  function resetView() {
    prevState = state;
    animState = createAnimator(0);
    if (!demo) controller.setLook(state.player.yaw, 0.15);
    threatsView?.reset();
    particles.clear();
    shake = NO_SHAKE;
    roll = 0;
    lastCountdown = null;
    resetCamera();
    clock = createClock();
  }

  function syncLevelViews() {
    if (state.level === viewLevel) return;
    const level = state.level;
    viewLevel = level;
    city?.dispose();
    threatsView?.dispose();
    city = createCityView(level, { maxAnisotropy });
    view.scene.add(city.group);
    threatsView = createThreatsView(level);
    if (flags.cam !== 'free') view.scene.add(threatsView.group);
    if (debugDraw && makeDebugDraw) {
      const visible = debugDraw.isVisible();
      debugDraw.dispose();
      debugDraw = makeDebugDraw(level, config.missiles.activationRange);
      view.scene.add(debugDraw.group);
      debugDraw.setVisible(visible);
    }
    resetView();
    // compila os shaders do nível agora (countdown/menu), não no meio do primeiro swing
    view.renderer.compile(view.scene, view.camera);
  }

  // ------------------------------------------------------------ input e UI
  const controller = createMouseKeyboardController(canvas);
  controller.setLook(0, 0.15);
  const speedLines = createSpeedLines(uiRoot); // primeiro: fica embaixo do HUD e dos menus
  const hud = createHud(uiRoot);
  const banner = createBanner(uiRoot);
  const crosshair = createCrosshair(uiRoot);
  const threatIndicator = createThreatIndicator(uiRoot);
  const menus = createMenus(uiRoot);
  const AUDIO_KEY = 'web-swing:v1:audio';
  const audio = createAudioEngine(store.get(AUDIO_KEY) === 'muted');
  /** Último número do countdown já anunciado (bipe a cada troca). */
  let lastCountdown: number | null = null;
  /** Tempo até o próximo bipe de proximidade de míssil. */
  let proximityTimer = 0;
  let maxMissileUrgency = 0;
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (e.code !== 'KeyM' || e.repeat || (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'))) return;
    audio.unlock();
    const muted = !audio.isMuted();
    audio.setMuted(muted);
    store.set(AUDIO_KEY, muted ? 'muted' : 'on');
    hud.notice(muted ? 'Som desligado (M)' : 'Som ligado (M)');
  });
  const levelLabel = () => `Nível ${state.level.spec.index} — ${state.level.spec.name}`;
  const msOf = (ticks: number) => ticksToMs(ticks, config.tickHz);
  const levelBestMs = (index: number): number | null => save.bestByLevel[String(index)]?.bestTimeMs ?? null;
  let freeControls: { update(): void } | null = null;
  let goBannerUntil = 0;
  /** Recorde do nível antes da tentativa que acabou de terminar (para o "vs. recorde"). */
  let previousBestMs: number | null = null;

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
  }

  // ------------------------------------------------------------ fluxo de telas
  function beginDemo() {
    const d = startDemo(demoRecording, config);
    state = d.state;
    demo = d.playback;
    demoLook = { yaw: state.player.yaw, pitch: state.player.pitch };
    resetView();
  }

  function applyEffect(effect: ScreenEffect) {
    switch (effect.type) {
      case 'new_run':
        demo = null;
        state = createRun(config, { ...runOptions, startLevel: effect.startLevel });
        recording = [];
        recordingConfigHash = configHash(config);
        recordingReproducible = true;
        recordingSeed = state.level.seed;
        recordingStartLevel = state.startLevel;
        resetView();
        break;
      case 'restart_level':
        state = restartLevel(state);
        recordingReproducible = false; // o replay gravado não sabe de reinícios
        resetView();
        break;
      case 'advance_level':
        state = advanceAfterLevel(state);
        resetView();
        break;
      case 'request_lock':
        void requestLock();
        break;
      case 'release_lock':
        if (document.pointerLockElement) document.exitPointerLock();
        break;
    }
  }

  function dispatch(action: ScreenAction) {
    const before = screen;
    const t = screenReducer(screen, action);
    if (t.screen === before && t.effects.length === 0) return;
    screen = t.screen;
    for (const e of t.effects) applyEffect(e);
    if (!isMenuScreen(before) && isMenuScreen(screen)) beginDemo();
    if (screen.kind === 'victory' && before.kind !== 'victory') audio.play({ kind: 'victory' });
    if (screen.kind !== 'game' || !screen.paused) menuHint = '';
    refreshMenus();
  }

  function levelCards(): LevelCard[] {
    const unlocked = unlockedLevels(save.bestByLevel, LEVEL_SPECS.length);
    return LEVEL_SPECS.map((spec) => {
      const best = save.bestByLevel[String(spec.index)];
      return {
        index: spec.index,
        name: spec.name,
        unlocked: unlocked.includes(spec.index),
        stars: best?.stars ?? 0,
        bestMs: best?.bestTimeMs ?? null,
        goldMs: spec.goldTime * 1000,
        silverMs: spec.silverTime * 1000,
        launchers: spec.threats.launchers,
        voids: spec.voids.count,
      };
    });
  }

  function menuData(): MenuData {
    const s = state;
    const last = s.results[s.results.length - 1];
    return {
      levels: levelCards(),
      times: save.times,
      persistent: store.persistent,
      results:
        screen.kind === 'results' && last
          ? {
              result: last,
              timeMs: msOf(last.timeTicks),
              previousBestMs,
              goldMs: s.level.spec.goldTime * 1000,
              silverMs: s.level.spec.silverTime * 1000,
              runTimeMs: runTimeMs(s),
              isLastLevel: s.level.spec.index === LEVEL_SPECS.length,
              ranked: s.ranked,
            }
          : null,
      campaign:
        screen.kind === 'victory'
          ? { runTimeMs: runTimeMs(s), results: s.results, tickHz: config.tickHz, fullCampaign: s.startLevel === 1, ranked: s.ranked }
          : null,
      pause: screen.kind === 'game' ? { levelLabel: levelLabel(), levelTimeMs: msOf(s.progress.ticks), runTimeMs: runTimeMs(s) } : null,
      hint: menuHint,
    };
  }

  function refreshMenus() {
    if (screen.kind === 'game' && (!screen.paused || flags.cam === 'free')) menus.hide();
    else menus.show(screen, menuData());
  }

  function onIntent(intent: MenuIntent) {
    switch (intent.type) {
      case 'pick_level': {
        const unlocked = unlockedLevels(save.bestByLevel, LEVEL_SPECS.length).includes(intent.level);
        dispatch({ type: 'select_level', level: intent.level, unlocked });
        break;
      }
      case 'next_level': {
        const last = state.level.spec.index === LEVEL_SPECS.length;
        const qualifies = last && runQualifies(save, advanceAfterLevel(state));
        dispatch({ type: 'next_level', last, qualifies });
        break;
      }
      case 'submit_name': {
        const r = recordHighscore(save, state, intent.name, Date.now());
        save = r.save;
        writeSave(store, save);
        dispatch({ type: 'name_submitted', position: r.position });
        break;
      }
      default:
        dispatch(intent);
    }
  }
  menus.onIntent((intent) => {
    // todo clique/tecla de menu é um gesto do usuário: é aqui que o áudio pode nascer
    audio.unlock();
    audio.play({ kind: 'ui' });
    onIntent(intent);
  });

  async function requestLock() {
    // o Chrome recusa o lock por ~1 s depois de um Esc: avisa em vez de parecer quebrado
    if (!(await controller.requestLock())) {
      menuHint = 'Não deu para capturar o mouse — aguarde um instante e clique em Continuar de novo.';
      dispatch({ type: 'lock_failed' });
      refreshMenus();
    }
  }
  controller.onLockChange((locked) => {
    if (locked) {
      lastFrameTime = null; // retoma sem "pular" o tempo parado
      audio.unlock();
      dispatch({ type: 'lock_acquired' });
    } else {
      dispatch({ type: 'lock_lost' });
    }
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
      getScreen: () => screen,
      audio: () => ({ muted: audio.isMuted(), ...audio.stats() }),
      hashState: () => hashState(state),
      /** Reexecuta uma gravação (JSON do F9) e devolve o hash final e se a config bate. */
      loadReplay: (rec: InputRecording) => {
        const r = replayRecording(rec, config);
        const last = r.state.results[r.state.results.length - 1];
        return { hash: r.hash, tick: r.state.tick, phase: r.state.phase, timeTicks: last?.timeTicks ?? null, configMatches: r.configMatches, reproducible: rec.reproducible };
      },
    };
    // carregamento preguiçoso com a promise guardada: F1/F2 apertados de novo antes do
    // import terminar não criam uma segunda instância
    let debugDrawLoading: Promise<DebugDraw> | null = null;
    let tuningLoading: Promise<TuningGui> | null = null;
    /** Atalhos que mexem no estado por fora dos inputs: o run sai do ranking e a gravação deixa de reproduzir. */
    const cheat = (fn: (s: GameState) => GameState) => {
      if (screen.kind !== 'game') return; // nunca na demonstração nem nos menus
      const before = state.events.length;
      state = fn(state);
      recordingReproducible = false;
      // eventos criados pelo atalho (ex.: K = acerto) também têm som, partículas e tremor
      handleEvents(state.events.slice(before), performance.now());
    };
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.code === 'F1') {
        e.preventDefault();
        debugDrawLoading ??= import('./render/debug-draw').then(({ createDebugDraw }) => {
          makeDebugDraw = createDebugDraw;
          const d = createDebugDraw(state.level, config.missiles.activationRange);
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
      } else if (e.code === 'KeyJ') {
        cheat((st) => debugWarpAhead(st));
        prevState = state; // teleporte: sem interpolar
        resetCamera();
      } else if (e.code === 'KeyK') {
        cheat(debugHit);
      } else if (e.code === 'KeyR' && screen.kind === 'game') {
        cheat(debugRespawn);
      }
    });
  }

  function downloadRecording() {
    const rec: InputRecording = {
      version: 2,
      levelIndex: recordingStartLevel,
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
    a.download = `web-swing-L${recordingStartLevel}-t${state.tick}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ------------------------------------------------------------ loop
  function tickOnce(out: GameEvent[]) {
    let input: InputFrame;
    if (demo) {
      const n = nextDemoInput(demo);
      if (!n.input || isTerminal(state.phase)) {
        beginDemo(); // acabou a gravação (ou o nível): recomeça a demonstração
        return;
      }
      demo = n.playback;
      input = n.input;
      demoLook = { yaw: input.yaw, pitch: input.pitch };
    } else {
      input = controller.consumeInput();
      if (recordingOn) recording.push(input);
    }
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
    const inGame = screen.kind === 'game' && !screen.paused && (flags.cam === 'free' || controller.isLocked());
    const running = inGame || demo !== null;
    const events: GameEvent[] = [];
    let ticksThisFrame = 0;

    if (running && !frozen) {
      const adv = advanceClock(clock, realDtMs * flags.slowmo, clockConfig);
      clock = adv.clock;
      for (let i = 0; i < adv.ticks; i++) tickOnce(events);
      ticksThisFrame = adv.ticks;
      alpha = adv.alpha;
    } else if (frozen && stepRequested && running) {
      tickOnce(events);
      ticksThisFrame = 1;
      stepRequested = false;
      alpha = 1;
    }

    syncLevelViews();
    handleEvents(events, now);
    if (screen.kind === 'game' && state.phase === 'level_complete') dispatch({ type: 'level_complete' });

    // animação anda no tempo da SIMULAÇÃO (parada na pausa/F3, lenta no slowmo); a câmera usa o tempo real
    const simDtSec = running && !frozen ? (realDtMs * flags.slowmo) / 1000 : ticksThisFrame / config.tickHz;
    timeSec += simDtSec;
    updateJuice(realDtMs / 1000, simDtSec, inGame);
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
        threatsView?.reset();
      } else if (e.type === 'missile_exploded') {
        threatsView?.explode(e.pos, e.hitPlayer);
      } else if (e.type === 'level_complete' && !demo) {
        previousBestMs = levelBestMs(e.result.levelIndex);
        if (state.ranked) {
          // melhor por nível salvo na hora (não depende de terminar a campanha)
          save = recordLevelBests(save, state);
          writeSave(store, save);
        }
      }
      if (DEV && !demo && e.type !== 'web_missed') {
        const extra = e.type === 'momentum_gain' ? ` +${e.gain} → ${e.value.toFixed(2)}` : e.type === 'momentum_loss' ? ` ${e.from.toFixed(2)} → ${e.to.toFixed(2)}` : '';
        eventLog.push(`${state.tick} ${e.type}${'kind' in e ? ` ${String(e.kind)}` : ''}${'reason' in e ? ` (${e.reason})` : ''}${extra}`);
        if (eventLog.length > 8) eventLog.shift();
      }
    }
    if (!demo) hud.popups(events, config.tickHz);
    juiceEvents(events);
  }

  /** Eventos do frame → partículas (também na demonstração), sons e trauma (só no jogo). */
  function juiceEvents(events: readonly GameEvent[]) {
    if (events.length === 0) return;
    const p = state.player;
    const chest = chestOf(p.pos);
    for (const e of events) {
      if (e.type === 'web_attached') particles.anchorPuff(e.anchor);
      else if (e.type === 'landed' && e.speed > 8) particles.landingDust(p.pos, Math.min(1, (e.speed - 8) / 18));
      else if (e.type === 'bonk') particles.sparks(chest, 16);
      else if (e.type === 'player_hit') particles.hit(chest);
      else if (e.type === 'web_released' && e.perfect && e.fullSwing) {
        particles.perfect(chest);
        if (!demo) crosshair.pulse();
      } else if (e.type === 'momentum_gain' && Math.floor(e.value + 1e-9) > Math.floor(e.value - e.gain + 1e-9)) {
        particles.levelUp(chest, Math.floor(e.value + 1e-9));
      }
      if (!demo && !reducedMotion) shake = addTrauma(shake, traumaFor(e, p.pos));
    }
    if (demo) return;
    const cues = cuesFor(events, {
      listener: chest,
      launcherPos: (id) => state.level.launchers[id]?.pos ?? null,
      momentumMax: config.momentum.max,
    });
    for (const c of cues) audio.play(c);
  }

  /** Por frame: vento, bipes (countdown e míssil perto), tremor, roll, speed lines, partículas. */
  function updateJuice(realDt: number, simDt: number, inGame: boolean) {
    const p = state.player;
    const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    const active = inGame && !demo;
    audio.setWind(active && state.phase === 'playing' ? speed : 0);

    // countdown: um bipe a cada número (o "Já!" vem do evento go)
    if (active && state.phase === 'countdown') {
      const v = countdownValue(state.phaseTicks, config.tickHz);
      if (v !== lastCountdown) audio.play({ kind: 'countdown' });
      lastCountdown = v;
    } else if (state.phase !== 'countdown') {
      lastCountdown = null;
    }

    // míssil chegando: bipe cada vez mais rápido
    const interval = active ? proximityInterval(maxMissileUrgency) : null;
    if (interval === null) proximityTimer = 0;
    else {
      proximityTimer -= realDt;
      if (proximityTimer <= 0) {
        audio.play({ kind: 'proximity' });
        proximityTimer = interval;
      }
    }

    shake = stepShake(shake, realDt);
    roll = reducedMotion || !active ? 0 : stepRoll(roll, lateralSpeed(p.vel, controller.getLiveLook().yaw), realDt);
    speedLines.setVisible(active && !reducedMotion && flags.cam !== 'free');
    speedLines.update(active ? speedLinesIntensity(speed) : 0, realDt);
    particles.update(simDt);
  }

  function updateUi(now: number) {
    const s = state;
    const cfg = config;
    const game = screen.kind === 'game' && flags.cam !== 'free';
    const active = game && !(screen.kind === 'game' && screen.paused);
    const spec = s.level.spec;
    hud.setVisible(game);
    crosshair.setVisible(active && (s.phase === 'countdown' || s.phase === 'playing' || s.phase === 'respawning'));
    threatIndicator.setVisible(active);
    if (!game) {
      banner.hide();
      maxMissileUrgency = 0;
      return;
    }
    const timeMs = msOf(s.progress.ticks);
    const goldMs = spec.goldTime * 1000;
    const silverMs = spec.silverTime * 1000;
    const v = s.player.vel;
    hud.update({
      levelLabel: levelLabel(),
      timeMs,
      targetStars: timeMs <= goldMs ? 3 : timeMs <= silverMs ? 2 : 1,
      targetMs: timeMs <= goldMs ? goldMs : timeMs <= silverMs ? silverMs : null,
      bestMs: levelBestMs(spec.index),
      speed: Math.hypot(v.x, v.y, v.z),
      momentum: s.momentum.value,
      momentumMax: cfg.momentum.max,
      chain: s.momentum.chain,
      stunned: s.player.stunTicks > 0,
    });
    const blips = threatRadar(s, controller.getLiveLook().yaw, cfg);
    threatIndicator.update(blips);
    maxMissileUrgency = blips.reduce((m, b) => (b.kind === 'missile' ? Math.max(m, b.urgency) : m), 0);

    if (s.phase === 'countdown') {
      banner.showCountdown({ levelLabel: levelLabel(), value: Math.max(1, Math.ceil(s.phaseTicks / cfg.tickHz)), goldMs, silverMs, bestMs: levelBestMs(spec.index) });
    } else if (s.phase === 'respawning') banner.showRespawn();
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
    const look = currentLook();

    if (flags.cam === 'free') {
      freeControls?.update();
    } else if (state.phase === 'respawning') {
      // caiu no vão: a câmera fica onde estava (não mergulha atrás do jogador) até o respawn
    } else {
      const r = updateCameraFollow(camState, { feet: interp.feet, vel: interp.vel, yaw: look.yaw, pitch: look.pitch }, state.level, config.rig, dtSec);
      camState = r.state;
      const sh = shakeOffsets(shake);
      applyCameraPose(view.camera, r.pose, { right: sh.right, up: sh.up, yaw: sh.yaw, pitch: sh.pitch, roll: sh.roll + roll });
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
    const aiming = !demo && screen.kind === 'game' && state.phase === 'playing' && !p.rope;
    webLine.updateMarker(aiming ? state.aim.point : null, view.camera, state.aim.source === 'assist');
    crosshair.update(state.aim, p.rope !== null);
    const warnTicks = Math.max(1, secondsToTicks(config.missiles.warnTime, config.tickHz));
    threatsView?.update(
      {
        launchers: state.threats.launchers.map((ls) => ({
          phase: ls.phase,
          warn: ls.phase === 'aiming' ? Math.min(1, (ls.ticks + alpha) / warnTicks) : ls.phase === 'firing' ? 1 : 0,
        })),
        target: chestOf(interp.feet),
        missiles: interpolateMissiles(prevState.threats.missiles, state.threats.missiles, alpha),
      },
      timeSec,
      simDtSec,
    );

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
    const screenLabel = screen.kind === 'game' ? `game${screen.paused ? ' (pausa)' : ''}` : screen.kind;
    return [
      `L${s.level.spec.index} ${s.level.spec.name} · seed ${s.level.seed} · ${config.tickHz} Hz${flags.slowmo !== 1 ? ` · slowmo ${flags.slowmo}` : ''}${frozen ? ' · CONGELADO (F3)' : ''}`,
      `tela ${screenLabel}${demo ? ' · DEMONSTRAÇÃO' : ''} · fase ${s.phase}${s.phaseTicks ? ` (${s.phaseTicks})` : ''}${s.god ? ' · god' : ''} · ${s.ranked ? 'ranqueado' : 'NÃO ranqueado'} · cp ${s.checkpointIndex} · tempo ${(s.progress.ticks / config.tickHz).toFixed(2)} s`,
      `tick ${s.tick} (+${ticksThisFrame}) · alpha ${alpha.toFixed(2)}`,
      `modo ${p.mode}${p.grounded ? ` (${p.groundKind})` : ''} · anim ${animState.current}${p.stunTicks ? ' · ATORDOADO' : ''}`,
      `pos (${f(p.pos.x)}, ${f(p.pos.y)}, ${f(p.pos.z)}) · |v| ${f(speed)} m/s · chegada ${f(s.level.finishZ - p.pos.z)} m`,
      p.rope ? `teia L ${f(p.rope.length)} / alvo ${f(p.rope.targetLength)} · impulso ${p.rope.impulseUsed ? 'usado' : 'disponível'}` : 'teia —',
      `impulso ${s.momentum.value.toFixed(2)} (máx ${s.momentum.best.toFixed(1)}) · combo ${s.momentum.chain} · ocioso ${s.momentum.idleTicks} · desde soltura ${Math.min(s.momentum.sinceReleaseTicks, 9999)}`,
      `mísseis ${s.threats.missiles.length} · lançadores ${s.threats.launchers.map((l) => l.phase[0]).join('')} · invulnerável ${s.threats.invulnerableTicks} · acertos ${s.progress.hits} · quedas ${s.progress.falls}`,
      `mira ${s.aim.source}${s.aim.fail ? ` (direto: ${s.aim.fail})` : ''} · cliques ${shots} · sem alvo ${s.stats.webMisses} (${missPct}%)`,
      `hash ${lastHash} (a cada 30 ticks)`,
      `draw calls ${info.calls} · triângulos ${(info.triangles / 1000).toFixed(1)}k · geo ${info.geometries} · tex ${info.textures}`,
      '— eventos —',
      ...eventLog,
    ];
  }

  refreshMenus();
  requestAnimationFrame(loop);
}
