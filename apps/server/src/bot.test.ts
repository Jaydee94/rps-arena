import { describe, expect, it } from 'vitest';
import { duel, getGestureSet } from '@rps/shared';
import type { BotLevel, GestureSet } from '@rps/shared';
import { chooseBotEmote, chooseBotGesture } from './bot';

type History = { human: string; bot: string }[];

/** Small seeded PRNG so every test is deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const classic = getGestureSet('classic');
const levels: BotLevel[] = ['easy', 'medium', 'hard'];

describe('chooseBotGesture', () => {
  it('easy covers every gesture over 3000 draws and never returns an invalid one', () => {
    const rng = mulberry32(1);
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const g = chooseBotGesture('easy', classic, [], rng);
      expect(classic.gestures).toContain(g);
      seen.add(g);
    }
    expect([...seen].sort()).toEqual([...classic.gestures].sort());
  });

  it('medium counters a human who played rock in each of the last 3 rounds', () => {
    const history: History = [
      { human: 'rock', bot: 'paper' },
      { human: 'rock', bot: 'rock' },
      { human: 'rock', bot: 'scissors' },
    ];
    for (let seed = 0; seed < 20; seed++) {
      const g = chooseBotGesture('medium', classic, history, mulberry32(seed));
      expect(duel(classic, g, 'rock')).toBe('a');
    }
  });

  it('medium only looks at the last 3 rounds', () => {
    const history: History = [
      { human: 'paper', bot: 'rock' },
      { human: 'paper', bot: 'rock' },
      { human: 'paper', bot: 'rock' },
      { human: 'rock', bot: 'rock' },
      { human: 'rock', bot: 'rock' },
      { human: 'rock', bot: 'rock' },
    ];
    const g = chooseBotGesture('medium', classic, history, mulberry32(3));
    expect(duel(classic, g, 'rock')).toBe('a');
  });

  it('hard counters a rock, paper, scissors cycle in at least 8 of 10 rounds after 6 warm-up rounds', () => {
    const rng = mulberry32(7);
    const cycle = ['rock', 'paper', 'scissors'];
    const history: History = [];
    for (let i = 0; i < 6; i++) {
      history.push({ human: cycle[i % 3]!, bot: chooseBotGesture('hard', classic, history, rng) });
    }
    let wins = 0;
    for (let i = 6; i < 16; i++) {
      const bot = chooseBotGesture('hard', classic, history, rng);
      const human = cycle[i % 3]!;
      if (duel(classic, bot, human) === 'a') wins++;
      history.push({ human, bot });
    }
    expect(wins).toBeGreaterThanOrEqual(8);
  });

  it('hard falls back to a valid gesture when the last human gesture has no transition data', () => {
    const history: History = [
      { human: 'rock', bot: 'paper' },
      { human: 'paper', bot: 'rock' },
    ];
    const g = chooseBotGesture('hard', classic, history, mulberry32(11));
    expect(classic.gestures).toContain(g);
  });

  it.each(levels)('%s returns a valid gesture on empty history', (level) => {
    for (let seed = 0; seed < 50; seed++) {
      expect(classic.gestures).toContain(chooseBotGesture(level, classic, [], mulberry32(seed)));
    }
  });

  it('is deterministic for a given rng seed', () => {
    const history: History = [
      { human: 'rock', bot: 'paper' },
      { human: 'paper', bot: 'rock' },
    ];
    for (const level of levels) {
      expect(chooseBotGesture(level, classic, history, mulberry32(5))).toBe(
        chooseBotGesture(level, classic, history, mulberry32(5)),
      );
    }
  });

  describe('wheel15', () => {
    const wheel: GestureSet = getGestureSet('wheel15');

    it('always picks a gesture from the set on every level', () => {
      const history: History = [
        { human: 'dragon', bot: 'rock' },
        { human: 'sponge', bot: 'fire' },
        { human: 'dragon', bot: 'gun' },
      ];
      for (const level of levels) {
        for (let seed = 0; seed < 50; seed++) {
          expect(wheel.gestures).toContain(chooseBotGesture(level, wheel, history, mulberry32(seed)));
        }
      }
    });

    it('medium beats a repeated rock', () => {
      const history: History = [
        { human: 'rock', bot: 'fire' },
        { human: 'rock', bot: 'gun' },
        { human: 'rock', bot: 'rock' },
      ];
      const picks = new Set<string>();
      for (let seed = 0; seed < 100; seed++) {
        const g = chooseBotGesture('medium', wheel, history, mulberry32(seed));
        expect(duel(wheel, g, 'rock')).toBe('a');
        picks.add(g);
      }
      // 7 gestures beat rock in wheel15; the counter is drawn from all of them.
      expect(picks.size).toBeGreaterThan(1);
    });
  });
});

describe('chooseBotEmote', () => {
  it('returns null or a gesture of the set, and both occur', () => {
    const rng = mulberry32(42);
    let nulls = 0;
    let gestures = 0;
    for (let i = 0; i < 400; i++) {
      const e = chooseBotEmote(classic, rng);
      if (e === null) nulls++;
      else {
        expect(classic.gestures).toContain(e);
        gestures++;
      }
    }
    expect(nulls).toBeGreaterThan(0);
    expect(gestures).toBeGreaterThan(nulls);
  });
});
