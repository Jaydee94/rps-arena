import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { GESTURE_ATTACK } from '@rps/shared';

/** Hand-written stand-in for the Web Audio API: records every node that gets created. */
class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}

class FakeNode {
  kind = '';
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  threshold = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  knee = new FakeParam();
  type = '';
  buffer: unknown = null;
  loop = false;
  connect = vi.fn((node: unknown) => node);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static created: string[] = [];
  static nodes: FakeNode[] = [];
  state: 'suspended' | 'running' = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  private make(kind: string): FakeNode {
    FakeAudioContext.created.push(kind);
    const node = new FakeNode();
    node.kind = kind;
    FakeAudioContext.nodes.push(node);
    return node;
  }
  createOscillator = () => this.make('oscillator');
  createGain = () => this.make('gain');
  createBiquadFilter = () => this.make('filter');
  createBufferSource = () => this.make('bufferSource');
  createDynamicsCompressor = () => this.make('compressor');
  createBuffer = (_channels: number, length: number) => {
    FakeAudioContext.created.push('buffer');
    return { getChannelData: () => new Float32Array(length) };
  };
}

const created = () => FakeAudioContext.created;

async function load() {
  vi.resetModules();
  return import('./audio');
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

// Every `load()` re-evaluates the module, which binds another visibilitychange listener.
const bound: EventListener[] = [];

beforeEach(() => {
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'visibilitychange') bound.push(listener as EventListener);
    add(type, listener, options);
  });
  FakeAudioContext.instances = [];
  FakeAudioContext.created = [];
  FakeAudioContext.nodes = [];
  vi.stubGlobal('AudioContext', FakeAudioContext);
  localStorage.clear();
});

afterEach(() => {
  for (const listener of bound.splice(0)) document.removeEventListener('visibilitychange', listener);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setHidden(false);
});

describe('audio defaults and unlock', () => {
  it('defaults to sfx on and music off', async () => {
    const { audioSettings } = await load();
    expect(get(audioSettings)).toEqual({ sfx: true, music: false });
  });

  it('creates no context and no nodes before unlock()', async () => {
    const { audio } = await load();
    audio.play('click');
    audio.play('win');
    audio.setMusic(true);
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(created()).toHaveLength(0);
  });

  it('creates and resumes the context on unlock(), idempotently', async () => {
    const { audio } = await load();
    audio.unlock();
    audio.unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0]?.resume).toHaveBeenCalled();
  });

  it('plays every sound with nodes after unlock()', async () => {
    const { audio } = await load();
    audio.unlock();
    for (const name of ['click', 'lock', 'reveal', 'win', 'lose', 'draw', 'clash', 'attack-smash'] as const) {
      const before = created().length;
      audio.play(name);
      expect(created().length, name).toBeGreaterThan(before);
    }
  });

  it('survives a browser without AudioContext', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const { audio } = await load();
    expect(() => {
      audio.unlock();
      audio.play('click');
      audio.setMusic(true);
    }).not.toThrow();
  });
});

describe('suspended context', () => {
  const context = () => {
    const instance = FakeAudioContext.instances[0];
    if (!instance) throw new Error('no context');
    return instance;
  };

  it('creates no nodes while the context is not running, and drops those sounds', async () => {
    const { audio } = await load();
    audio.unlock();
    context().state = 'suspended';
    const before = created().length;
    audio.play('click');
    audio.play('win', 0.5);
    expect(created()).toHaveLength(before);

    context().state = 'running';
    expect(created()).toHaveLength(before); // nothing is replayed on resume
    audio.play('click');
    expect(created().length).toBeGreaterThan(before);
  });

  it('also stays silent while the context is interrupted', async () => {
    const { audio } = await load();
    audio.unlock();
    (context() as { state: string }).state = 'interrupted';
    const before = created().length;
    audio.play('click');
    expect(created()).toHaveLength(before);
  });

  it('does nothing when unlock() is called on a running context', async () => {
    const { audio } = await load();
    audio.unlock();
    context().resume.mockClear();
    audio.unlock();
    expect(context().resume).not.toHaveBeenCalled();
  });

  it('retries resume() on a later unlock() after a rejected one', async () => {
    const { audio } = await load();
    audio.unlock();
    const c = context();
    c.state = 'suspended';
    c.resume.mockImplementationOnce(() => Promise.reject(new Error('not allowed')));
    audio.unlock();
    await Promise.resolve();
    expect(c.state).toBe('suspended');
    audio.unlock();
    expect(c.resume).toHaveBeenCalledTimes(3);
    expect(c.state).toBe('running');
    const before = created().length;
    audio.play('click');
    expect(created().length).toBeGreaterThan(before);
  });
});

describe('sfx switch', () => {
  it('creates no nodes after setSfx(false)', async () => {
    const { audio } = await load();
    audio.unlock();
    audio.setSfx(false);
    const before = created().length;
    audio.play('click');
    audio.play('win');
    expect(created()).toHaveLength(before);
  });

  it('plays again after setSfx(true)', async () => {
    const { audio } = await load();
    audio.unlock();
    audio.setSfx(false);
    audio.setSfx(true);
    const before = created().length;
    audio.play('click');
    expect(created().length).toBeGreaterThan(before);
  });
});

describe('persistence', () => {
  it('survives a reload', async () => {
    const first = await load();
    first.audio.setSfx(false);
    first.audio.setMusic(true);
    const second = await load();
    expect(get(second.audioSettings)).toEqual({ sfx: false, music: true });
  });

  it('falls back to defaults for garbage in storage', async () => {
    localStorage.setItem('rps.audio', '{nope');
    const { audioSettings } = await load();
    expect(get(audioSettings)).toEqual({ sfx: true, music: false });
  });

  it('keeps working when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { audio, audioSettings } = await load();
    expect(get(audioSettings)).toEqual({ sfx: true, music: false });
    expect(() => audio.setSfx(false)).not.toThrow();
    expect(get(audioSettings).sfx).toBe(false);
    audio.setSfx(true);
    audio.unlock();
    const before = created().length;
    audio.play('click');
    expect(created().length).toBeGreaterThan(before);
  });
});

describe('music', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('is not started by default, even after unlock()', async () => {
    const { audio } = await load();
    audio.unlock();
    expect(vi.getTimerCount()).toBe(0);
    expect(created().filter((k) => k === 'oscillator')).toHaveLength(0);
  });

  it('schedules notes with a lookahead timer and clears it when switched off', async () => {
    const { audio } = await load();
    audio.unlock();
    audio.setMusic(true);
    expect(vi.getTimerCount()).toBe(1);
    const afterStart = created().length;
    expect(afterStart).toBeGreaterThan(0);

    const context = FakeAudioContext.instances[0];
    if (!context) throw new Error('no context');
    context.currentTime = 5;
    vi.advanceTimersByTime(100);
    expect(created().length).toBeGreaterThan(afterStart);

    audio.setMusic(false);
    expect(vi.getTimerCount()).toBe(0);
    const afterStop = created().length;
    context.currentTime = 20;
    vi.advanceTimersByTime(1000);
    expect(created()).toHaveLength(afterStop);
  });

  it('starts when music was enabled before unlock() but plays nothing until then', async () => {
    const { audio } = await load();
    audio.setMusic(true);
    expect(vi.getTimerCount()).toBe(0);
    audio.unlock();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does not stack timers when switched on twice', async () => {
    const { audio } = await load();
    audio.unlock();
    audio.setMusic(true);
    audio.setMusic(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('stops while the page is hidden and resumes when visible again', async () => {
    const { audio } = await load();
    audio.unlock();
    audio.setMusic(true);
    setHidden(true);
    expect(vi.getTimerCount()).toBe(0);
    setHidden(false);
    expect(vi.getTimerCount()).toBe(1);
    audio.setMusic(false);
    setHidden(true);
    setHidden(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('matchup sounds', () => {
  const attacks = [...new Set(Object.values(GESTURE_ATTACK))];
  const names = [...attacks.map((attack) => `attack-${attack}`), 'clash'] as const;

  const context = () => {
    const instance = FakeAudioContext.instances[0];
    if (!instance) throw new Error('no context');
    return instance;
  };

  it('covers all 14 attacks', () => {
    expect(attacks).toHaveLength(14);
  });

  it('gives every attack sound and the clash a length and a recipe', async () => {
    const { audio, SOUND_LENGTH } = await load();
    audio.unlock();
    for (const name of names) {
      expect(SOUND_LENGTH[name as keyof typeof SOUND_LENGTH], name).toBeGreaterThan(0);
      const before = created().length;
      audio.play(name as Parameters<typeof audio.play>[0]);
      expect(created().length, name).toBeGreaterThan(before);
    }
  });

  it('keeps every sound short, within its length, and not louder than the existing ones', async () => {
    const { audio, SOUND_LENGTH } = await load();
    audio.unlock();
    const start = 10;
    context().currentTime = start;
    for (const name of names) {
      FakeAudioContext.nodes = [];
      audio.play(name as Parameters<typeof audio.play>[0]);
      const length = SOUND_LENGTH[name as keyof typeof SOUND_LENGTH];
      expect(length, name).toBeLessThanOrEqual(0.6);
      const sources = FakeAudioContext.nodes.filter((n) => n.kind === 'oscillator' || n.kind === 'bufferSource');
      expect(sources.length, name).toBeGreaterThan(0);
      let end = 0;
      for (const node of sources) {
        const stopAt = node.stop.mock.calls[0]?.[0] as number;
        const startAt = node.start.mock.calls[0]?.[0] as number;
        expect(startAt, name).toBeGreaterThanOrEqual(start);
        end = Math.max(end, stopAt);
        // oscillators and noise stop 20 ms after their envelope
        expect(stopAt - start - 0.02, name).toBeLessThanOrEqual(length + 1e-9);
      }
      // the declared length is the real one, so queued follow-ups neither overlap nor leave gaps
      expect(end - start - 0.02, name).toBeGreaterThanOrEqual(length - 0.06);
      for (const node of FakeAudioContext.nodes.filter((n) => n.kind === 'gain')) {
        for (const [peak] of node.gain.linearRampToValueAtTime.mock.calls) {
          expect(peak as number, name).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('gives every attack sound and the clash a hit that sits on a real transient of its recipe', async () => {
    const { audio, HIT_AT, SOUND_LENGTH } = await load();
    expect(Object.keys(HIT_AT).sort()).toEqual([...names].sort());
    audio.unlock();
    const start = 10;
    context().currentTime = start;
    for (const name of names) {
      const hitAt = HIT_AT[name as keyof typeof HIT_AT];
      expect(hitAt, name).toBeGreaterThanOrEqual(0);
      expect(hitAt, name).toBeLessThan(SOUND_LENGTH[name as keyof typeof SOUND_LENGTH]);
      FakeAudioContext.nodes = [];
      audio.play(name as Parameters<typeof audio.play>[0]);
      // the hit is where a source starts (a snap, a thud) or where a gain envelope peaks (a swell)
      const moments = FakeAudioContext.nodes.flatMap((node) => [
        ...node.start.mock.calls.map(([at]) => (at as number) - start),
        ...node.gain.linearRampToValueAtTime.mock.calls.map(([, at]) => (at as number) - start),
      ]);
      expect(moments.some((at) => Math.abs(at - hitAt) < 0.001), name).toBe(true);
      // sounds with hitAt 0 open with their hit: a source starts exactly at the recipe start
      if (hitAt === 0) expect(Math.min(...moments), name).toBeCloseTo(0);
    }
  });

  it('honours a start delay', async () => {
    const { audio } = await load();
    audio.unlock();
    FakeAudioContext.nodes = [];
    audio.play('attack-smash', 0.44);
    const starts = FakeAudioContext.nodes
      .filter((n) => n.kind === 'oscillator' || n.kind === 'bufferSource')
      .map((n) => n.start.mock.calls[0]?.[0] as number);
    expect(Math.min(...starts)).toBeCloseTo(0.44);
  });

  it('stays silent with sfx off or before unlock', async () => {
    const { audio } = await load();
    audio.play('attack-smash');
    audio.unlock();
    audio.setSfx(false);
    const before = created().length;
    for (const name of names) audio.play(name as Parameters<typeof audio.play>[0]);
    expect(created()).toHaveLength(before);
  });
});
