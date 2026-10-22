import type { PublicMatch, PublicPlayer, RoomView, SeatId } from '@rps/shared';

export function makePlayer(seat: SeatId, overrides: Partial<PublicPlayer> = {}): PublicPlayer {
  return {
    seat,
    nickname: `Spieler-${seat}`,
    avatar: 'fox',
    connected: true,
    disconnectedAt: null,
    isBot: false,
    ...overrides,
  };
}

export function makeMatch(overrides: Partial<PublicMatch> = {}): PublicMatch {
  return {
    config: { mode: 'classic', bestOf: 3 },
    phase: 'pick',
    round: 1,
    score: { a: 0, b: 0 },
    announces: {},
    lockedSeats: [],
    yourPick: null,
    lastRound: null,
    winner: null,
    forfeited: [],
    ...overrides,
  };
}

/** A room for `you` (default a0) in the given mode; all required seats are filled. */
export function makeRoom(
  overrides: Partial<Omit<RoomView, 'match'>> & { match?: Partial<PublicMatch> | null } = {},
): RoomView {
  const { match, ...rest } = overrides;
  const config = rest.config ?? { mode: 'classic', bestOf: 3 };
  const seats: SeatId[] = config.mode === 'team2v2' ? ['a0', 'a1', 'b0', 'b1'] : ['a0', 'b0'];
  return {
    code: 'ABCDE',
    config,
    you: 'a0',
    hostSeat: 'a0',
    players: Object.fromEntries(seats.map((s) => [s, makePlayer(s)])),
    match: match === null ? null : makeMatch({ config, ...match }),
    deadline: null,
    ...rest,
  };
}
