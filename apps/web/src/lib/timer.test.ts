import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fraction, phaseDuration, remainingMs, startCountdown } from './timer';

describe('timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('clamps remaining time to >= 0 (clock skew, late ticks)', () => {
    expect(remainingMs(10_000, 4_000)).toBe(6_000);
    expect(remainingMs(10_000, 12_000)).toBe(0);
  });

  it('computes a bar fraction within [0, 1]', () => {
    expect(fraction(5_000, 20_000)).toBe(0.25);
    expect(fraction(30_000, 20_000)).toBe(1);
    expect(fraction(-5, 20_000)).toBe(0);
  });

  it('has a duration per timed phase', () => {
    expect(phaseDuration('pick')).toBe(20_000);
    expect(phaseDuration('announce')).toBe(8_000);
    expect(phaseDuration('reveal')).toBe(4_000);
    expect(phaseDuration('finished')).toBe(0);
  });

  it('ticks immediately and every 250 ms, and stops when cleaned up', () => {
    vi.setSystemTime(1_000);
    const onTick = vi.fn();
    const stop = startCountdown(3_000, onTick);
    expect(onTick).toHaveBeenLastCalledWith(2_000);
    vi.advanceTimersByTime(500);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(onTick).toHaveBeenLastCalledWith(1_500);
    stop();
    vi.advanceTimersByTime(2_000);
    expect(onTick).toHaveBeenCalledTimes(3);
  });
});
