import { duel, gestureSetFor } from './gestures';
import type { ModeId } from './gestures';
import { BLUFF_EMOTES } from './constants';

export type SeatId = 'a0' | 'a1' | 'b0' | 'b1';
export type Team = 'a' | 'b';

export interface RoomConfig {
  mode: ModeId;
  bestOf: 3 | 5 | 7;
}

export interface RoundResult {
  picks: Partial<Record<SeatId, string>>;
  duels: { seats: [SeatId, SeatId]; result: 'a' | 'b' | 'draw' }[];
  winner: Team | 'draw';
}

export interface MatchState {
  config: RoomConfig;
  phase: 'announce' | 'pick' | 'reveal' | 'finished';
  round: number;
  score: Record<Team, number>;
  announces: Partial<Record<SeatId, string | null>>;
  picks: Partial<Record<SeatId, string>>;
  lastRound: RoundResult | null;
  winner: Team | null;
  /** Seats that left the match; they lose every duel from now on. */
  forfeited: SeatId[];
}

export type RuleErrorCode =
  | 'wrong_phase'
  | 'invalid_gesture'
  | 'already_picked'
  | 'unknown_seat'
  | 'invalid_emote';

export class RuleError extends Error {
  readonly code: RuleErrorCode;

  constructor(code: RuleErrorCode) {
    super(code);
    this.name = 'RuleError';
    this.code = code;
  }
}

export function activeSeats(mode: ModeId): SeatId[] {
  return mode === 'team2v2' ? ['a0', 'a1', 'b0', 'b1'] : ['a0', 'b0'];
}

export function createMatch(config: RoomConfig): MatchState {
  return {
    config,
    phase: config.mode === 'bluff' ? 'announce' : 'pick',
    round: 1,
    score: { a: 0, b: 0 },
    announces: {},
    picks: {},
    lastRound: null,
    winner: null,
    forfeited: [],
  };
}

function assertSeat(s: MatchState, seat: SeatId): void {
  if (!activeSeats(s.config.mode).includes(seat)) throw new RuleError('unknown_seat');
}

/** Seats of the same index face each other: a0 vs b0, a1 vs b1. */
function duelPairs(mode: ModeId): [SeatId, SeatId][] {
  return mode === 'team2v2'
    ? [
        ['a0', 'b0'],
        ['a1', 'b1'],
      ]
    : [['a0', 'b0']];
}

/** A seat counts as done once it has a value or has forfeited. */
function everyoneDone(s: MatchState, values: Partial<Record<SeatId, unknown>>): boolean {
  return activeSeats(s.config.mode).every((seat) => seat in values || s.forfeited.includes(seat));
}

/** Resolves the round from the current picks; missing or forfeited seats lose their duel. */
function resolveRound(s: MatchState): MatchState {
  const set = gestureSetFor(s.config.mode);
  const picks: Partial<Record<SeatId, string>> = {};
  for (const seat of activeSeats(s.config.mode)) {
    const gesture = s.picks[seat];
    if (gesture !== undefined && !s.forfeited.includes(seat)) picks[seat] = gesture;
  }

  const duels = duelPairs(s.config.mode).map(([x, y]) => {
    const gx = picks[x];
    const gy = picks[y];
    let result: 'a' | 'b' | 'draw';
    if (gx !== undefined && gy !== undefined) result = duel(set, gx, gy);
    else if (gx !== undefined) result = 'a';
    else if (gy !== undefined) result = 'b';
    else result = 'draw';
    return { seats: [x, y] as [SeatId, SeatId], result };
  });

  const aWins = duels.filter((d) => d.result === 'a').length;
  const bWins = duels.filter((d) => d.result === 'b').length;
  const winner: Team | 'draw' = aWins > bWins ? 'a' : bWins > aWins ? 'b' : 'draw';

  return {
    ...s,
    phase: 'reveal',
    picks,
    lastRound: { picks, duels, winner },
    score: winner === 'draw' ? s.score : { ...s.score, [winner]: s.score[winner] + 1 },
  };
}

export function announce(s: MatchState, seat: SeatId, emote: string | null): MatchState {
  if (s.phase !== 'announce') throw new RuleError('wrong_phase');
  assertSeat(s, seat);
  if (seat in s.announces) throw new RuleError('already_picked');
  if (emote !== null && !BLUFF_EMOTES.includes(emote)) throw new RuleError('invalid_emote');

  const announces = { ...s.announces, [seat]: emote };
  return { ...s, announces, phase: everyoneDone(s, announces) ? 'pick' : 'announce' };
}

export function pick(s: MatchState, seat: SeatId, gesture: string): MatchState {
  if (s.phase !== 'pick') throw new RuleError('wrong_phase');
  assertSeat(s, seat);
  // A forfeited seat can no longer act.
  if (seat in s.picks || s.forfeited.includes(seat)) throw new RuleError('already_picked');
  if (!gestureSetFor(s.config.mode).gestures.includes(gesture)) {
    throw new RuleError('invalid_gesture');
  }

  const next = { ...s, picks: { ...s.picks, [seat]: gesture } };
  return everyoneDone(next, next.picks) ? resolveRound(next) : next;
}

/** The team that has reached the round wins needed for the best-of, if any (the score decides). */
export function scoreWinner(s: MatchState): Team | null {
  const needed = Math.ceil(s.config.bestOf / 2);
  if (s.score.a >= needed) return 'a';
  if (s.score.b >= needed) return 'b';
  return null;
}

export function advance(s: MatchState): MatchState {
  if (s.phase !== 'reveal') throw new RuleError('wrong_phase');

  const decided = scoreWinner(s);
  if (decided !== null) return { ...s, phase: 'finished', winner: decided };
  return {
    ...s,
    phase: s.config.mode === 'bluff' ? 'announce' : 'pick',
    round: s.round + 1,
    announces: {},
    picks: {},
  };
}

/** Ends the current time-limited phase: silent seats announce nothing / lose their duel. */
export function timeoutPhase(s: MatchState): MatchState {
  if (s.phase === 'announce') {
    const announces = { ...s.announces };
    for (const seat of activeSeats(s.config.mode)) announces[seat] ??= null;
    return { ...s, announces, phase: 'pick' };
  }
  if (s.phase === 'pick') return resolveRound(s);
  return s;
}

/** A seat leaves for good: it loses its duel this round and in every later round. */
export function forfeitSeat(s: MatchState, seat: SeatId): MatchState {
  assertSeat(s, seat);
  if (s.phase === 'finished' || s.forfeited.includes(seat)) return s;

  const next = { ...s, forfeited: [...s.forfeited, seat] };
  if (next.phase === 'announce' && everyoneDone(next, next.announces)) {
    return { ...next, phase: 'pick' };
  }
  if (next.phase === 'pick' && everyoneDone(next, next.picks)) return resolveRound(next);
  return next;
}
