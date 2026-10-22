import { describe, expect, it } from 'vitest';
import { createHoldConfirmer } from './hold';

const make = () => createHoldConfirmer({ holdMs: 900, minScore: 0.7 });

describe('createHoldConfirmer', () => {
  it('fires a gesture held without interruption for holdMs', () => {
    const hold = make();
    expect(hold.push('rock', 0.9, 0)).toBeNull();
    expect(hold.push('rock', 0.9, 450)).toBeNull();
    expect(hold.push('rock', 0.9, 899)).toBeNull();
    expect(hold.push('rock', 0.9, 900)).toBe('rock');
  });

  it('restarts the timer when the gesture changes before holdMs', () => {
    const hold = make();
    hold.push('rock', 0.9, 0);
    expect(hold.push('paper', 0.9, 800)).toBeNull();
    // 900 ms after the first rock, but only 100 ms after the switch to paper
    expect(hold.push('paper', 0.9, 900)).toBeNull();
    expect(hold.push('paper', 0.9, 1699)).toBeNull();
    expect(hold.push('paper', 0.9, 1700)).toBe('paper');
  });

  it('counts the time anew after rock -> null -> rock', () => {
    const hold = make();
    hold.push('rock', 0.9, 0);
    expect(hold.push(null, 0, 500)).toBeNull();
    expect(hold.push('rock', 0.9, 600)).toBeNull();
    expect(hold.push('rock', 0.9, 1000)).toBeNull(); // 1000 ms after the first start, 400 ms after the restart
    expect(hold.push('rock', 0.9, 1499)).toBeNull();
    expect(hold.push('rock', 0.9, 1500)).toBe('rock');
  });

  it('is interrupted by a score below minScore', () => {
    const hold = make();
    hold.push('scissors', 0.9, 0);
    expect(hold.push('scissors', 0.69, 500)).toBeNull();
    expect(hold.push('scissors', 0.9, 600)).toBeNull();
    expect(hold.push('scissors', 0.9, 1400)).toBeNull();
    expect(hold.push('scissors', 0.9, 1500)).toBe('scissors');
  });

  it('accepts a score exactly at minScore', () => {
    const hold = make();
    hold.push('paper', 0.7, 0);
    expect(hold.push('paper', 0.7, 900)).toBe('paper');
  });

  it('does not start holding on a low score', () => {
    const hold = make();
    hold.push('rock', 0.5, 0);
    expect(hold.push('rock', 0.5, 2000)).toBeNull();
  });

  it('fires only once and gives no second result without reset()', () => {
    const hold = make();
    hold.push('rock', 0.9, 0);
    expect(hold.push('rock', 0.9, 900)).toBe('rock');
    expect(hold.push('rock', 0.9, 1800)).toBeNull();
    expect(hold.push(null, 0, 2000)).toBeNull();
    hold.push('paper', 0.9, 2100);
    expect(hold.push('paper', 0.9, 5000)).toBeNull();
  });

  it('can fire again after reset()', () => {
    const hold = make();
    hold.push('rock', 0.9, 0);
    expect(hold.push('rock', 0.9, 900)).toBe('rock');
    hold.reset();
    expect(hold.push('rock', 0.9, 1000)).toBeNull();
    expect(hold.push('rock', 0.9, 1900)).toBe('rock');
  });

  it('never fires for null', () => {
    const hold = make();
    for (let now = 0; now <= 5000; now += 100) expect(hold.push(null, 1, now)).toBeNull();
  });

  it('reports the hold progress between 0 and 1', () => {
    const hold = make();
    expect(hold.progress()).toBe(0);
    hold.push('rock', 0.9, 0);
    expect(hold.progress()).toBe(0);
    hold.push('rock', 0.9, 450);
    expect(hold.progress()).toBeCloseTo(0.5);
    hold.push(null, 0, 500);
    expect(hold.progress()).toBe(0);
    hold.push('rock', 0.9, 600);
    hold.push('rock', 0.9, 1500);
    expect(hold.progress()).toBe(1);
    hold.reset();
    expect(hold.progress()).toBe(0);
  });
});
