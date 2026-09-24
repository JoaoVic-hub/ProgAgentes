/**
 * Motor de áudio (Etapa 4): WebAudio 100% sintetizado (sem arquivos).
 *
 * - O AudioContext só nasce num gesto do usuário (unlock(), chamado nos
 *   cliques de menu/"Jogar"), como os navegadores exigem.
 * - Cadeia: vozes → master → compressor → saída. O compressor segura picos
 *   (várias explosões juntas no L5) e o master faz o mudo (M).
 * - Vento contínuo: ruído em loop → passa-banda → ganho, seguindo a
 *   velocidade (audio/mapping.ts: windParams).
 * - Cada cue vira osciladores/ruído com envelope curto; os nós somem sozinhos
 *   ao terminar. Há um teto de vozes simultâneas.
 * O QUE tocar vem de audio/mapping.ts (puro e testado); aqui é só síntese.
 */

import type { Cue } from './mapping';
import { windParams } from './mapping';

export interface AudioEngine {
  /** Cria/retoma o contexto. Chamar dentro de um gesto do usuário. */
  unlock(): void;
  play(cue: Cue): void;
  /** Velocidade do jogador (m/s); 0 = sem vento. */
  setWind(speed: number): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** Depuração: estado do contexto e os últimos cues sintetizados. */
  stats(): { readonly context: AudioContextState | 'none'; readonly recent: readonly string[] };
  dispose(): void;
}

const MASTER_VOLUME = 0.7;
const MAX_VOICES = 32;

interface Chain {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly noise: AudioBuffer;
  readonly windGain: GainNode;
  readonly windFilter: BiquadFilterNode;
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createAudioEngine(initiallyMuted = false): AudioEngine {
  let chain: Chain | null = null;
  let muted = initiallyMuted;
  let voices = 0;
  const recent: string[] = [];

  function build(): Chain | null {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;
    compressor.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(compressor);
    const noise = makeNoise(ctx);
    // vento: ruído em loop, filtrado, ganho controlado pela velocidade
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noise;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.7;
    windFilter.frequency.value = 300;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(windGain).connect(master);
    windSrc.start();
    return { ctx, master, noise, windGain, windFilter };
  }

  /** Envelope ataque/decaimento exponencial. */
  function envelope(g: GainNode, t0: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function track(node: AudioScheduledSourceNode) {
    voices++;
    node.onended = () => {
      voices--;
    };
  }

  /** Tom com glissando f0 → f1. */
  function tone(c: Chain, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0, attack = 0.005) {
    if (peak <= 0.0005) return;
    const t0 = c.ctx.currentTime + delay;
    const osc = c.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.ctx.createGain();
    envelope(g, t0, peak, attack, dur);
    osc.connect(g).connect(c.master);
    track(osc);
    osc.start(t0);
    osc.stop(t0 + attack + dur + 0.05);
  }

  /** Ruído filtrado com varredura do filtro f0 → f1. */
  function noise(c: Chain, type: BiquadFilterType, f0: number, f1: number, q: number, dur: number, peak: number, delay = 0, attack = 0.004) {
    if (peak <= 0.0005) return;
    const t0 = c.ctx.currentTime + delay;
    const src = c.ctx.createBufferSource();
    src.buffer = c.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = c.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.ctx.createGain();
    envelope(g, t0, peak, attack, dur);
    src.connect(filter).connect(g).connect(c.master);
    track(src);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + attack + dur + 0.05);
  }

  function synth(c: Chain, cue: Cue) {
    switch (cue.kind) {
      case 'thwip':
        noise(c, 'bandpass', 4200, 900, 2, 0.13, 0.35);
        tone(c, 'sine', 1900, 600, 0.08, 0.1);
        break;
      case 'release':
        noise(c, 'lowpass', 600, 2400, 0.8, 0.18, 0.16);
        if (cue.perfect) {
          tone(c, 'triangle', 1318.5, 1318.5, 0.22, 0.1, 0.02);
          tone(c, 'triangle', 1760, 1760, 0.3, 0.09, 0.08);
        }
        break;
      case 'flip':
        noise(c, 'bandpass', 500, 3200, 1.2, 0.28, 0.2);
        break;
      case 'jump':
        tone(c, 'sine', 220, 330, 0.08, 0.06);
        break;
      case 'land':
        tone(c, 'sine', 110, 45, 0.18, 0.15 + 0.4 * cue.intensity);
        noise(c, 'lowpass', 900, 200, 0.7, 0.15, 0.08 + 0.25 * cue.intensity);
        break;
      case 'bonk':
        tone(c, 'square', 170, 85, 0.12, 0.12 + 0.12 * cue.intensity);
        noise(c, 'lowpass', 2200, 300, 0.8, 0.22, 0.25 + 0.2 * cue.intensity);
        break;
      case 'miss':
        noise(c, 'highpass', 2600, 2600, 0.7, 0.04, 0.1);
        break;
      case 'gain':
        tone(c, 'triangle', cue.freq, cue.freq, 0.16, 0.16);
        tone(c, 'sine', cue.freq * 2, cue.freq * 2, 0.12, 0.04, 0.01);
        if (cue.levelUp) {
          tone(c, 'triangle', cue.freq * 1.25, cue.freq * 1.25, 0.16, 0.14, 0.07);
          tone(c, 'triangle', cue.freq * 1.5, cue.freq * 1.5, 0.3, 0.14, 0.14);
        }
        break;
      case 'loss':
        tone(c, 'sawtooth', 520, 170, 0.3, 0.05 + 0.1 * cue.amount);
        tone(c, 'triangle', 260, 90, 0.3, 0.06 + 0.1 * cue.amount);
        break;
      case 'warn':
        tone(c, 'square', 1250, 1250, 0.06, 0.08 * cue.gain);
        tone(c, 'square', 1250, 1250, 0.06, 0.08 * cue.gain, 0.12);
        break;
      case 'proximity':
        tone(c, 'sine', 1650, 1650, 0.045, 0.09);
        break;
      case 'launch':
        noise(c, 'bandpass', 300, 1800, 1, 0.5, 0.3 * cue.gain);
        tone(c, 'sine', 90, 50, 0.4, 0.18 * cue.gain);
        break;
      case 'explosion':
        noise(c, 'lowpass', 2600, 150, 0.7, 0.9, 0.75 * cue.gain);
        tone(c, 'sine', 70, 30, 0.6, 0.55 * cue.gain);
        break;
      case 'hit':
        noise(c, 'lowpass', 3000, 120, 0.7, 1.0, 0.9);
        tone(c, 'sine', 80, 28, 0.7, 0.7);
        tone(c, 'sine', 3100, 3000, 1.1, 0.035, 0.05, 0.05); // zumbido no ouvido
        break;
      case 'checkpoint':
        tone(c, 'triangle', 1318.5, 1318.5, 0.12, 0.15);
        tone(c, 'triangle', 1975.5, 1975.5, 0.22, 0.13, 0.1);
        break;
      case 'countdown':
        tone(c, 'sine', 660, 660, 0.14, 0.22);
        break;
      case 'go':
        tone(c, 'sine', 990, 990, 0.35, 0.26);
        tone(c, 'triangle', 1980, 1980, 0.22, 0.07);
        break;
      case 'fall':
        tone(c, 'sine', 1300, 180, 0.9, 0.16);
        break;
      case 'finish':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, 'triangle', f, f, i === 3 ? 0.55 : 0.16, 0.18, i * 0.11));
        break;
      case 'victory':
        [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(c, 'triangle', f, f, 0.2, 0.17, i * 0.1));
        [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(c, 'triangle', f, f, 1.2, 0.1, 0.65));
        break;
      case 'ui':
        tone(c, 'sine', 880, 880, 0.03, 0.05);
        break;
    }
  }

  return {
    unlock() {
      if (!chain) {
        try {
          chain = build();
        } catch {
          chain = null;
        }
      }
      if (chain && chain.ctx.state === 'suspended') void chain.ctx.resume();
    },
    play(cue) {
      if (!chain || muted || chain.ctx.state !== 'running' || voices > MAX_VOICES) return;
      synth(chain, cue);
      recent.push(cue.kind);
      if (recent.length > 24) recent.shift();
    },
    setWind(speed) {
      if (!chain) return;
      const w = windParams(speed);
      const t = chain.ctx.currentTime;
      chain.windGain.gain.setTargetAtTime(w.gain, t, 0.15);
      chain.windFilter.frequency.setTargetAtTime(w.cutoff, t, 0.15);
    },
    setMuted(m) {
      muted = m;
      if (chain) chain.master.gain.setTargetAtTime(m ? 0 : MASTER_VOLUME, chain.ctx.currentTime, 0.03);
    },
    isMuted: () => muted,
    stats: () => ({ context: chain ? chain.ctx.state : 'none', recent: [...recent] }),
    dispose() {
      if (chain) void chain.ctx.close();
      chain = null;
    },
  };
}
