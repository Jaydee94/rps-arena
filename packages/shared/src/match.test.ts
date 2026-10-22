import { describe, expect, it } from 'vitest';
import { BLUFF_EMOTES } from './constants';
import {
  activeSeats,
  advance,
  announce,
  createMatch,
  forfeitSeat,
  pick,
  RuleError,
  scoreWinner,
  timeoutPhase,
} from './match';
import type { MatchState, SeatId } from './match';

/** Deep copy for asserting that inputs are not mutated. */
function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function ruleCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof RuleError) return error.code;
    throw error;
  }
  return undefined;
}

/** Plays a 1v1 round to reveal: a0 plays `a`, b0 plays `b`. */
function playRound(s: MatchState, a: string, b: string): MatchState {
  return pick(pick(s, 'a0', a), 'b0', b);
}

/** a0 wins in classic (rock beats scissors). */
const A_WINS: [string, string] = ['rock', 'scissors'];

describe('activeSeats', () => {
  it('has two seats for 1v1 modes and four for team2v2', () => {
    expect(activeSeats('classic')).toEqual(['a0', 'b0']);
    expect(activeSeats('bluff')).toEqual(['a0', 'b0']);
    expect(activeSeats('team2v2')).toEqual(['a0', 'a1', 'b0', 'b1']);
  });
});

describe('createMatch', () => {
  it('starts in pick for non-bluff modes', () => {
    const s = createMatch({ mode: 'classic', bestOf: 3 });
    expect(s).toMatchObject({
      phase: 'pick',
      round: 1,
      score: { a: 0, b: 0 },
      picks: {},
      announces: {},
      lastRound: null,
      winner: null,
    });
  });

  it('starts in announce for bluff', () => {
    expect(createMatch({ mode: 'bluff', bestOf: 3 }).phase).toBe('announce');
  });
});

describe('series length', () => {
  it('best of 3: first side with 2 round wins finishes the match after advance', () => {
    let s = createMatch({ mode: 'classic', bestOf: 3 });
    s = advance(playRound(s, ...A_WINS));
    expect(s.phase).toBe('pick');
    expect(s.score).toEqual({ a: 1, b: 0 });
    s = playRound(s, ...A_WINS);
    expect(s.phase).toBe('reveal');
    expect(s.winner).toBeNull();
    s = advance(s);
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe('a');
    expect(s.score).toEqual({ a: 2, b: 0 });
  });

  it('best of 7 needs 4 round wins', () => {
    let s = createMatch({ mode: 'classic', bestOf: 7 });
    for (let i = 0; i < 3; i++) s = advance(playRound(s, 'scissors', 'rock'));
    expect(s.phase).toBe('pick');
    expect(s.score).toEqual({ a: 0, b: 3 });
    s = advance(playRound(s, 'scissors', 'rock'));
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe('b');
  });

  it('draw repeats until someone wins', () => {
    let s = createMatch({ mode: 'classic', bestOf: 3 });
    s = playRound(s, 'rock', 'rock');
    expect(s.lastRound?.winner).toBe('draw');
    expect(s.score).toEqual({ a: 0, b: 0 });
    s = advance(s);
    expect(s.phase).toBe('pick');
    expect(s.round).toBe(2);
    expect(s.picks).toEqual({});
    s = advance(playRound(s, 'paper', 'paper'));
    expect(s.round).toBe(3);
    s = advance(playRound(s, ...A_WINS));
    expect(s.round).toBe(4);
    s = advance(playRound(s, ...A_WINS));
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe('a');
  });

  it('advance outside reveal throws wrong_phase', () => {
    const s = createMatch({ mode: 'classic', bestOf: 3 });
    expect(ruleCode(() => advance(s))).toBe('wrong_phase');
  });
});

describe('scoreWinner', () => {
  it('is null until a side has the round wins the best-of needs, even in the last reveal', () => {
    let s = createMatch({ mode: 'classic', bestOf: 5 });
    expect(scoreWinner(s)).toBeNull();
    for (let won = 1; won <= 2; won++) {
      s = advance(playRound(s, ...A_WINS));
      expect(scoreWinner(s)).toBeNull();
    }
    s = playRound(s, ...A_WINS); // third round win: decided while still in the reveal phase
    expect(s.phase).toBe('reveal');
    expect(scoreWinner(s)).toBe('a');
    expect(scoreWinner(advance(s))).toBe('a');
  });
});

describe('pick (review focus)', () => {
  it('rejects a second pick of the same seat and leaves picks unchanged', () => {
    const s = pick(createMatch({ mode: 'classic', bestOf: 3 }), 'a0', 'rock');
    const before = snapshot(s);
    expect(ruleCode(() => pick(s, 'a0', 'paper'))).toBe('already_picked');
    expect(s.picks).toEqual({ a0: 'rock' });
    expect(s).toEqual(before);
  });

  it('rejects a gesture outside the set', () => {
    const s = createMatch({ mode: 'classic', bestOf: 3 });
    expect(ruleCode(() => pick(s, 'a0', 'fire'))).toBe('invalid_gesture');
    expect(ruleCode(() => pick(s, 'a0', 'lizard'))).toBe('invalid_gesture');
    expect(s.picks).toEqual({});
  });

  it('rejects a pick in reveal with wrong_phase', () => {
    const s = playRound(createMatch({ mode: 'classic', bestOf: 3 }), ...A_WINS);
    expect(s.phase).toBe('reveal');
    expect(ruleCode(() => pick(s, 'a0', 'rock'))).toBe('wrong_phase');
  });

  it('rejects a pick in announce with wrong_phase', () => {
    const s = createMatch({ mode: 'bluff', bestOf: 3 });
    expect(ruleCode(() => pick(s, 'a0', 'rock'))).toBe('wrong_phase');
  });

  it('rejects a seat that is not active in the mode', () => {
    const s = createMatch({ mode: 'classic', bestOf: 3 });
    expect(ruleCode(() => pick(s, 'a1', 'rock'))).toBe('unknown_seat');
  });

  it('does not mutate its input', () => {
    const s = createMatch({ mode: 'classic', bestOf: 3 });
    const before = snapshot(s);
    const next = pick(s, 'a0', 'rock');
    expect(s).toEqual(before);
    expect(next).not.toBe(s);
  });

  it('reveal data is absent until every active seat has picked', () => {
    let s = createMatch({ mode: 'classic', bestOf: 3 });
    s = pick(s, 'a0', 'rock');
    expect(s.phase).toBe('pick');
    expect(s.lastRound).toBeNull();
    expect(s.score).toEqual({ a: 0, b: 0 });
    s = pick(s, 'b0', 'scissors');
    expect(s.phase).toBe('reveal');
    expect(s.lastRound).toEqual({
      picks: { a0: 'rock', b0: 'scissors' },
      duels: [{ seats: ['a0', 'b0'], result: 'a' }],
      winner: 'a',
    });
    expect(s.score).toEqual({ a: 1, b: 0 });
  });

  it('team2v2 waits for all four seats', () => {
    let s = createMatch({ mode: 'team2v2', bestOf: 3 });
    for (const seat of ['a0', 'a1', 'b0'] as const) {
      s = pick(s, seat, 'rock');
      expect(s.phase).toBe('pick');
      expect(s.lastRound).toBeNull();
    }
    s = pick(s, 'b1', 'rock');
    expect(s.phase).toBe('reveal');
  });
});

describe('bluff announce phase', () => {
  const bluff = () => createMatch({ mode: 'bluff', bestOf: 3 });

  it('uses the lizard-spock gestures as emotes', () => {
    expect(BLUFF_EMOTES).toEqual(['rock', 'scissors', 'lizard', 'paper', 'spock']);
  });

  it('accepts valid emotes or null and moves to pick once everyone announced', () => {
    let s = announce(bluff(), 'a0', 'spock');
    expect(s.phase).toBe('announce');
    expect(s.announces).toEqual({ a0: 'spock' });
    s = announce(s, 'b0', null);
    expect(s.phase).toBe('pick');
    expect(s.announces).toEqual({ a0: 'spock', b0: null });
  });

  it('rejects invalid emotes', () => {
    expect(ruleCode(() => announce(bluff(), 'a0', 'fire'))).toBe('invalid_emote');
  });

  it('rejects a second announcement of the same seat', () => {
    const s = announce(bluff(), 'a0', 'rock');
    expect(ruleCode(() => announce(s, 'a0', 'paper'))).toBe('already_picked');
    expect(ruleCode(() => announce(announce(bluff(), 'a0', null), 'a0', 'rock'))).toBe(
      'already_picked',
    );
    expect(s.announces).toEqual({ a0: 'rock' });
  });

  it('rejects announce outside the announce phase and for unknown seats', () => {
    const pickState = createMatch({ mode: 'classic', bestOf: 3 });
    expect(ruleCode(() => announce(pickState, 'a0', null))).toBe('wrong_phase');
    expect(ruleCode(() => announce(bluff(), 'a1', null))).toBe('unknown_seat');
  });

  it('does not mutate its input', () => {
    const s = bluff();
    const before = snapshot(s);
    announce(s, 'a0', 'rock');
    expect(s).toEqual(before);
  });

  it('timeoutPhase in announce jumps to pick', () => {
    const s = timeoutPhase(announce(bluff(), 'a0', 'rock'));
    expect(s.phase).toBe('pick');
    expect(s.announces).toEqual({ a0: 'rock', b0: null });
  });

  it('keeps the announce phase on the next round after advance', () => {
    let s = bluff();
    s = announce(announce(s, 'a0', null), 'b0', null);
    s = advance(playRound(s, ...A_WINS));
    expect(s.phase).toBe('announce');
    expect(s.announces).toEqual({});
    expect(s.picks).toEqual({});
  });
});

describe('team2v2', () => {
  const team = () => createMatch({ mode: 'team2v2', bestOf: 3 });
  const play = (s: MatchState, picks: Record<SeatId, string>): MatchState =>
    (['a0', 'a1', 'b0', 'b1'] as const).reduce((acc, seat) => pick(acc, seat, picks[seat]), s);

  it('duels a0 vs b0 and a1 vs b1; 2:0 wins the round', () => {
    const s = play(team(), { a0: 'rock', a1: 'paper', b0: 'scissors', b1: 'rock' });
    expect(s.lastRound?.duels).toEqual([
      { seats: ['a0', 'b0'], result: 'a' },
      { seats: ['a1', 'b1'], result: 'a' },
    ]);
    expect(s.lastRound?.winner).toBe('a');
    expect(s.score).toEqual({ a: 1, b: 0 });
  });

  it('1:1 duels make the round a draw', () => {
    const s = play(team(), { a0: 'rock', a1: 'rock', b0: 'scissors', b1: 'paper' });
    expect(s.lastRound?.winner).toBe('draw');
    expect(s.score).toEqual({ a: 0, b: 0 });
  });

  it('1:0 with one drawn duel wins the round', () => {
    const s = play(team(), { a0: 'rock', a1: 'rock', b0: 'rock', b1: 'scissors' });
    expect(s.lastRound?.winner).toBe('a');
  });

  it('b can win the round', () => {
    const s = play(team(), { a0: 'rock', a1: 'rock', b0: 'paper', b1: 'paper' });
    expect(s.lastRound?.winner).toBe('b');
    expect(s.score).toEqual({ a: 0, b: 1 });
  });
});

describe('timeoutPhase in pick', () => {
  it('a seat without a pick loses its duel', () => {
    const s = timeoutPhase(pick(createMatch({ mode: 'classic', bestOf: 3 }), 'a0', 'rock'));
    expect(s.phase).toBe('reveal');
    expect(s.lastRound?.duels).toEqual([{ seats: ['a0', 'b0'], result: 'a' }]);
    expect(s.lastRound?.picks).toEqual({ a0: 'rock' });
    expect(s.lastRound?.winner).toBe('a');
    expect(s.score).toEqual({ a: 1, b: 0 });
  });

  it('a duel where both sides are missing is a draw', () => {
    const s = timeoutPhase(createMatch({ mode: 'classic', bestOf: 3 }));
    expect(s.lastRound?.duels).toEqual([{ seats: ['a0', 'b0'], result: 'draw' }]);
    expect(s.lastRound?.winner).toBe('draw');
  });

  it('works per duel in team2v2', () => {
    let s = createMatch({ mode: 'team2v2', bestOf: 3 });
    s = pick(s, 'a0', 'rock');
    s = pick(s, 'b1', 'rock');
    s = timeoutPhase(s);
    expect(s.lastRound?.duels).toEqual([
      { seats: ['a0', 'b0'], result: 'a' },
      { seats: ['a1', 'b1'], result: 'b' },
    ]);
    expect(s.lastRound?.winner).toBe('draw');
  });

  it('returns the state unchanged in reveal and finished', () => {
    const reveal = playRound(createMatch({ mode: 'classic', bestOf: 3 }), ...A_WINS);
    expect(timeoutPhase(reveal)).toEqual(reveal);
    const finished = advance(playRound(advance(reveal), ...A_WINS));
    expect(finished.phase).toBe('finished');
    expect(timeoutPhase(finished)).toEqual(finished);
  });

  it('does not mutate its input', () => {
    const s = createMatch({ mode: 'classic', bestOf: 3 });
    const before = snapshot(s);
    timeoutPhase(s);
    expect(s).toEqual(before);
  });
});

describe('forfeitSeat', () => {
  it('makes the seat lose its duel and resolves once the others have picked', () => {
    let s = forfeitSeat(createMatch({ mode: 'classic', bestOf: 3 }), 'a0');
    expect(s.phase).toBe('pick');
    s = pick(s, 'b0', 'rock');
    expect(s.phase).toBe('reveal');
    expect(s.lastRound?.duels).toEqual([{ seats: ['a0', 'b0'], result: 'b' }]);
    expect(s.lastRound?.winner).toBe('b');
  });

  it('resolves immediately when all other seats already picked', () => {
    let s = pick(createMatch({ mode: 'classic', bestOf: 3 }), 'b0', 'rock');
    s = forfeitSeat(s, 'a0');
    expect(s.phase).toBe('reveal');
    expect(s.lastRound?.winner).toBe('b');
  });

  it('a forfeited seat that had already picked still loses its duel', () => {
    let s = pick(createMatch({ mode: 'team2v2', bestOf: 3 }), 'a0', 'rock');
    s = forfeitSeat(s, 'a0');
    for (const seat of ['a1', 'b0', 'b1'] as const) s = pick(s, seat, 'rock');
    expect(s.lastRound?.duels[0]).toEqual({ seats: ['a0', 'b0'], result: 'b' });
    expect(s.lastRound?.duels[1]).toEqual({ seats: ['a1', 'b1'], result: 'draw' });
    expect(s.lastRound?.winner).toBe('b');
  });

  it('stays forfeited in later rounds', () => {
    let s = forfeitSeat(createMatch({ mode: 'classic', bestOf: 5 }), 'a0');
    s = advance(pick(s, 'b0', 'rock'));
    expect(s.phase).toBe('pick');
    s = pick(s, 'b0', 'rock');
    expect(s.phase).toBe('reveal');
    expect(s.score).toEqual({ a: 0, b: 2 });
  });

  it('moves on from announce when the remaining seats have announced', () => {
    let s = announce(createMatch({ mode: 'bluff', bestOf: 3 }), 'b0', null);
    s = forfeitSeat(s, 'a0');
    expect(s.phase).toBe('pick');
  });

  it('rejects unknown seats and does not mutate its input', () => {
    const s = createMatch({ mode: 'classic', bestOf: 3 });
    const before = snapshot(s);
    expect(ruleCode(() => forfeitSeat(s, 'b1'))).toBe('unknown_seat');
    forfeitSeat(s, 'a0');
    expect(s).toEqual(before);
  });
});
