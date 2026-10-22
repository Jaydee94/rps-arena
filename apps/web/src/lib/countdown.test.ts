import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRoom } from '../test/fixtures';
import { shouldCountDown } from './countdown';
import { COUNTDOWN_BEATS, countdownMs, motion } from './motion';

function mockMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion: reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const pick = () => makeRoom({ match: { phase: 'pick' } });
const reveal = () => makeRoom({ match: { phase: 'reveal' } });

describe('shouldCountDown', () => {
  beforeEach(() => {
    motion.countdownBeatMs = 420;
  });

  afterEach(() => {
    motion.countdownBeatMs = 0;
    vi.unstubAllGlobals();
  });

  it('is true for pick -> reveal', () => {
    expect(shouldCountDown(pick(), reveal())).toBe(true);
  });

  it('is false without a previous state', () => {
    expect(shouldCountDown(null, reveal())).toBe(false);
  });

  it('is false while the phase stays reveal', () => {
    expect(shouldCountDown(reveal(), reveal())).toBe(false);
  });

  it('is false for reveal -> pick', () => {
    expect(shouldCountDown(reveal(), pick())).toBe(false);
  });

  it('is false when either room has no match', () => {
    expect(shouldCountDown(makeRoom({ match: null }), reveal())).toBe(false);
    expect(shouldCountDown(pick(), makeRoom({ match: null }))).toBe(false);
    expect(shouldCountDown(pick(), null)).toBe(false);
  });

  it('is false when the beat length is 0', () => {
    motion.countdownBeatMs = 0;
    expect(shouldCountDown(pick(), reveal())).toBe(false);
  });

  it('is false under prefers-reduced-motion: reduce', () => {
    mockMotion(true);
    expect(shouldCountDown(pick(), reveal())).toBe(false);
  });

  it('is true when reduced motion is not requested', () => {
    mockMotion(false);
    expect(shouldCountDown(pick(), reveal())).toBe(true);
  });
});

describe('countdownMs', () => {
  afterEach(() => {
    motion.countdownBeatMs = 0;
  });

  it('is three beats of 420 ms', () => {
    motion.countdownBeatMs = 420;
    expect(COUNTDOWN_BEATS).toBe(3);
    expect(countdownMs()).toBe(1260);
  });

  it('is 0 when the beat length is 0', () => {
    expect(countdownMs()).toBe(0);
  });
});

describe('motion defaults', () => {
  it('uses a 420 ms beat (must equal --dur-beat in styles/tokens.css)', async () => {
    // test/setup.ts zeroes the shared instance; a fresh module instance shows the source default.
    vi.resetModules();
    const fresh = await import('./motion');
    expect(fresh.motion.countdownBeatMs).toBe(420);
  });
});
