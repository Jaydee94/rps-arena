import { describe, expect, it } from 'vitest';
import type { RoundResult } from '@rps/shared';
import { duelViews, outcomeFor } from './board';

const round = (overrides: Partial<RoundResult> = {}): RoundResult => ({
  picks: { a0: 'rock', b0: 'scissors' },
  duels: [{ seats: ['a0', 'b0'], result: 'a' }],
  winner: 'a',
  ...overrides,
});

describe('board helpers', () => {
  it('judges a round from the own team perspective', () => {
    expect(outcomeFor('a', 'a')).toBe('win');
    expect(outcomeFor('a', 'b')).toBe('lose');
    expect(outcomeFor('draw', 'b')).toBe('draw');
  });

  it('maps a duel to mine/theirs and flips the result for team b', () => {
    expect(duelViews(round(), 'a0')).toEqual([{ mine: 'a0', theirs: 'b0', outcome: 'win' }]);
    expect(duelViews(round(), 'b0')).toEqual([{ mine: 'b0', theirs: 'a0', outcome: 'lose' }]);
  });

  it('handles drawn duels', () => {
    expect(duelViews(round({ duels: [{ seats: ['a0', 'b0'], result: 'draw' }] }), 'a0')[0]?.outcome).toBe('draw');
  });

  it('lists the own duel first in team2v2', () => {
    const r = round({
      duels: [
        { seats: ['a0', 'b0'], result: 'a' },
        { seats: ['a1', 'b1'], result: 'b' },
      ],
    });
    expect(duelViews(r, 'b1')).toEqual([
      { mine: 'b1', theirs: 'a1', outcome: 'win' },
      { mine: 'b0', theirs: 'a0', outcome: 'lose' },
    ]);
  });
});
