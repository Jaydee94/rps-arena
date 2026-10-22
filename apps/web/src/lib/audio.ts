import { writable, type Readable } from 'svelte/store';

/**
 * Synthesized comic sound effects and an optional generative music loop (Web Audio only,
 * no audio files). Nothing sounds, and no AudioContext exists, until `unlock()` ran from a
 * user gesture.
 */
export type SoundName = 'click' | 'lock' | 'reveal' | 'win' | 'lose' | 'draw';
export interface AudioSettings {
  sfx: boolean;
  music: boolean;
}

/** Approximate duration in seconds, so callers can queue sounds one after another. */
export const SOUND_LENGTH: Record<SoundName, number> = {
  click: 0.06,
  lock: 0.2,
  reveal: 0.75,
  win: 0.7,
  lose: 1.0,
  draw: 0.45,
};

const STORAGE_KEY = 'rps.audio';
const DEFAULTS: AudioSettings = { sfx: true, music: false };
const MASTER_GAIN = 0.25;
const MUSIC_GAIN = 0.3;

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data: unknown = JSON.parse(raw);
      if (typeof data === 'object' && data !== null) {
        const { sfx, music } = data as Partial<Record<keyof AudioSettings, unknown>>;
        return {
          sfx: typeof sfx === 'boolean' ? sfx : DEFAULTS.sfx,
          music: typeof music === 'boolean' ? music : DEFAULTS.music,
        };
      }
    }
  } catch {
    // storage unavailable or malformed: use the defaults
  }
  return { ...DEFAULTS };
}

function saveSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // without storage the choice just won't survive a reload
  }
}

let settings = loadSettings();
const settingsStore = writable<AudioSettings>(settings);

export const audioSettings: Readable<AudioSettings> = { subscribe: settingsStore.subscribe };

function update(patch: Partial<AudioSettings>): void {
  settings = { ...settings, ...patch };
  settingsStore.set(settings);
  saveSettings(settings);
}

// --- Web Audio graph ---------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let visibilityBound = false;

function createContext(): AudioContext | null {
  const Ctor =
    typeof AudioContext === 'undefined'
      ? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : AudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

interface ToneOptions {
  type: OscillatorType;
  freq: number;
  /** Optional glide target reached at the end of the tone. */
  freqEnd?: number;
  start: number;
  dur: number;
  gain: number;
  attack?: number;
  filter?: { type: BiquadFilterType; from: number; to: number; q?: number };
}

function tone(c: AudioContext, dest: AudioNode, o: ToneOptions): void {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.freq, o.start);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, o.start + o.dur);
  amp.gain.setValueAtTime(0.0001, o.start);
  amp.gain.linearRampToValueAtTime(o.gain, o.start + (o.attack ?? 0.005));
  amp.gain.exponentialRampToValueAtTime(0.0001, o.start + o.dur);
  if (o.filter) {
    const filter = c.createBiquadFilter();
    filter.type = o.filter.type;
    filter.Q.setValueAtTime(o.filter.q ?? 4, o.start);
    filter.frequency.setValueAtTime(o.filter.from, o.start);
    filter.frequency.linearRampToValueAtTime(o.filter.to, o.start + o.dur / 2);
    filter.frequency.linearRampToValueAtTime(o.filter.from, o.start + o.dur);
    osc.connect(filter);
    filter.connect(amp);
  } else {
    osc.connect(amp);
  }
  amp.connect(dest);
  osc.start(o.start);
  osc.stop(o.start + o.dur + 0.02);
}

interface NoiseOptions {
  start: number;
  dur: number;
  gain: number;
  filter: BiquadFilterType;
  from: number;
  to: number;
  q?: number;
}

function noise(c: AudioContext, dest: AudioNode, o: NoiseOptions): void {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const amp = c.createGain();
  source.buffer = noiseBuffer;
  source.loop = true;
  filter.type = o.filter;
  filter.Q.setValueAtTime(o.q ?? 1, o.start);
  filter.frequency.setValueAtTime(o.from, o.start);
  filter.frequency.exponentialRampToValueAtTime(o.to, o.start + o.dur);
  amp.gain.setValueAtTime(0.0001, o.start);
  amp.gain.linearRampToValueAtTime(o.gain, o.start + Math.min(0.03, o.dur / 2));
  amp.gain.exponentialRampToValueAtTime(0.0001, o.start + o.dur);
  source.connect(filter);
  filter.connect(amp);
  amp.connect(dest);
  source.start(o.start);
  source.stop(o.start + o.dur + 0.02);
}

const RECIPES: Record<SoundName, (c: AudioContext, out: AudioNode, t: number) => void> = {
  // Short square blip.
  click(c, out, t) {
    tone(c, out, { type: 'square', freq: 880, freqEnd: 660, start: t, dur: 0.05, gain: 0.25 });
  },
  // Rubber stamp thump: low sine drop plus a noise burst.
  lock(c, out, t) {
    tone(c, out, { type: 'sine', freq: 190, freqEnd: 50, start: t, dur: 0.18, gain: 0.9 });
    noise(c, out, { start: t, dur: 0.06, gain: 0.4, filter: 'lowpass', from: 2200, to: 400 });
  },
  // Rising whoosh followed by an impact.
  reveal(c, out, t) {
    noise(c, out, { start: t, dur: 0.45, gain: 0.5, filter: 'bandpass', from: 300, to: 3200, q: 2 });
    tone(c, out, { type: 'sawtooth', freq: 160, freqEnd: 720, start: t, dur: 0.45, gain: 0.2, attack: 0.2 });
    tone(c, out, { type: 'sine', freq: 140, freqEnd: 40, start: t + 0.45, dur: 0.28, gain: 1 });
    noise(c, out, { start: t + 0.45, dur: 0.12, gain: 0.5, filter: 'lowpass', from: 3000, to: 300 });
  },
  // Bright rising arpeggio.
  win(c, out, t) {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      const last = i === 4;
      tone(c, out, { type: 'square', freq, start: t + i * 0.08, dur: last ? 0.3 : 0.12, gain: 0.3 });
    });
  },
  // Descending "wah wah wah waaah".
  lose(c, out, t) {
    const notes: [number, number, number][] = [
      [392, 0, 0.2],
      [370, 0.22, 0.2],
      [349.23, 0.44, 0.2],
      [311.13, 0.66, 0.34],
    ];
    notes.forEach(([freq, offset, dur], i) => {
      tone(c, out, {
        type: 'sawtooth',
        freq,
        freqEnd: i === notes.length - 1 ? freq * 0.7 : undefined,
        start: t + offset,
        dur,
        gain: 0.35,
        filter: { type: 'lowpass', from: 350, to: 1600 },
      });
    });
  },
  // Two flat notes.
  draw(c, out, t) {
    tone(c, out, { type: 'triangle', freq: 220, start: t, dur: 0.16, gain: 0.5 });
    tone(c, out, { type: 'triangle', freq: 220, start: t + 0.2, dur: 0.22, gain: 0.5 });
  },
};

function ready(): { c: AudioContext; out: AudioNode } | null {
  return ctx && master ? { c: ctx, out: master } : null;
}

// --- Music -------------------------------------------------------------------

const STEP = 0.25; // seconds per eighth note (120 bpm)
const STEPS_PER_BAR = 8;
const BARS = 8;
const LOOKAHEAD = 0.4;
const TICK_MS = 100;
// C - Am - F - G, two bars each, as bass roots and pentatonic melody pools.
const BASS = [130.81, 130.81, 110, 110, 87.31, 87.31, 98, 98];
const MELODY_POOL: number[][] = [
  [523.25, 659.25, 783.99, 880],
  [523.25, 659.25, 880, 1046.5],
  [523.25, 698.46, 880, 1046.5],
  [587.33, 783.99, 987.77, 1174.7],
];

let musicBus: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | undefined;
let nextStepTime = 0;
let stepIndex = 0;
let loopCount = 0;

/** Small deterministic generator: every loop pass gets its own melody, tests stay repeatable. */
function rand(seed: number): number {
  let x = (seed * 1664525 + 1013904223) >>> 0;
  x = (Math.imul(x ^ (x >>> 15), 2246822519) >>> 0) ^ (x >>> 13);
  return (x >>> 0) / 4294967296;
}

function scheduleStep(c: AudioContext, bus: AudioNode, at: number, step: number, loop: number): void {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const inBar = step % STEPS_PER_BAR;
  if (inBar % 2 === 0) {
    const bass = BASS[bar] ?? BASS[0] ?? 130.81;
    tone(c, bus, { type: 'triangle', freq: bass, start: at, dur: STEP * 1.8, gain: 0.5 });
  }
  const pool = MELODY_POOL[Math.floor(bar / 2)] ?? MELODY_POOL[0] ?? [];
  const roll = rand(loop * 997 + step);
  if (roll < 0.65 && pool.length > 0) {
    const freq = pool[Math.floor(rand(loop * 31 + step * 7) * pool.length)] ?? pool[0] ?? 523.25;
    tone(c, bus, { type: 'square', freq, start: at, dur: STEP * 0.8, gain: 0.12 });
  }
  if (inBar % 4 === 2) {
    noise(c, bus, { start: at, dur: 0.04, gain: 0.08, filter: 'highpass', from: 6000, to: 7000 });
  }
}

function pump(): void {
  if (!ctx || !musicBus) return;
  while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(ctx, musicBus, nextStepTime, stepIndex, loopCount);
    nextStepTime += STEP;
    stepIndex += 1;
    if (stepIndex >= STEPS_PER_BAR * BARS) {
      stepIndex = 0;
      loopCount += 1;
    }
  }
}

function startMusic(): void {
  if (!ctx || !master || musicTimer !== undefined || !settings.music) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  musicBus = ctx.createGain();
  musicBus.gain.setValueAtTime(MUSIC_GAIN, ctx.currentTime);
  musicBus.connect(master);
  nextStepTime = ctx.currentTime + 0.05;
  stepIndex = 0;
  pump();
  musicTimer = setInterval(pump, TICK_MS);
}

function stopMusic(): void {
  if (musicTimer !== undefined) {
    clearInterval(musicTimer);
    musicTimer = undefined;
  }
  if (musicBus) {
    // Disconnecting the bus silences everything that was already scheduled within the lookahead.
    musicBus.disconnect();
    musicBus = null;
  }
}

function onVisibilityChange(): void {
  if (document.hidden) stopMusic();
  else startMusic();
}

// --- Public API --------------------------------------------------------------

function unlock(): void {
  if (!ctx) {
    ctx = createContext();
    if (!ctx) return;
    master = ctx.createGain();
    master.gain.setValueAtTime(MASTER_GAIN, ctx.currentTime);
    // Gentle limiter so stacked sounds never clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-14, ctx.currentTime);
    limiter.knee.setValueAtTime(12, ctx.currentTime);
    limiter.ratio.setValueAtTime(8, ctx.currentTime);
    limiter.attack.setValueAtTime(0.003, ctx.currentTime);
    limiter.release.setValueAtTime(0.15, ctx.currentTime);
    master.connect(limiter);
    limiter.connect(ctx.destination);
  }
  if (!visibilityBound && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
    visibilityBound = true;
  }
  if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  startMusic();
}

function play(name: SoundName, delay = 0): void {
  if (!settings.sfx) return;
  const graph = ready();
  if (!graph) return;
  RECIPES[name](graph.c, graph.out, graph.c.currentTime + Math.max(0, delay));
}

function setSfx(on: boolean): void {
  update({ sfx: on });
}

function setMusic(on: boolean): void {
  update({ music: on });
  if (on) startMusic();
  else stopMusic();
}

export const audio = { play, setSfx, setMusic, unlock };
