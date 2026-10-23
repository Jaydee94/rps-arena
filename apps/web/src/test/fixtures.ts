import type {
  PlayerView,
  PublicMatch,
  PublicPlayer,
  PublicTournament,
  RoomView,
  SeatId,
  SpectatorView,
} from '@rps/shared';

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

/**
 * A valid `PublicTournament`: by default a knockout lobby with `n` connected participants `p0..p(n-1)`
 * ("Spieler-p0" ...), viewed by `p0` (`youId`). Pass `participants` to replace the generated list.
 */
export function makeTournament(overrides: Partial<PublicTournament> & { n?: number } = {}): PublicTournament {
  const { n = 5, ...rest } = overrides;
  return {
    format: 'knockout',
    phase: 'lobby',
    participants: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      nickname: `Spieler-p${i}`,
      avatar: 'fox',
      connected: true,
      forfeited: false,
    })),
    pairings: [],
    currentPairingId: null,
    standings: [],
    podium: [],
    youId: 'p0',
    untilMs: null,
    ...rest,
  };
}

/** Seats of the room: a tournament room only has the running pairing's two seats, and none outside a match. */
function playersFor(seats: SeatId[], tournament: PublicTournament | null | undefined): Partial<Record<SeatId, PublicPlayer>> {
  const used = tournament ? (tournament.phase === 'match' ? (['a0', 'b0'] as SeatId[]) : []) : seats;
  return Object.fromEntries(used.map((s) => [s, makePlayer(s)]));
}

/** Distributes over the view union, so callers may pass `Partial<RoomView>`-typed overrides through. */
type Overrides<V> = V extends RoomView ? Partial<Omit<V, 'match'>> & { match?: Partial<PublicMatch> | null } : never;

/**
 * A player-view room for `you` (default a0) in the given mode; all required seats are filled.
 * Always a `PlayerView` (`role: 'player'`); use `makeSpectatorRoom` for the spectator view.
 */
export function makeRoom(overrides: Overrides<RoomView> = {}): PlayerView {
  const { match, ...rest } = overrides as Overrides<PlayerView>;
  const config = rest.config ?? { mode: 'classic', bestOf: 3 };
  const seats: SeatId[] = config.mode === 'team2v2' ? ['a0', 'a1', 'b0', 'b1'] : ['a0', 'b0'];
  const you = rest.you ?? 'a0';
  const hostSeat = rest.hostSeat ?? 'a0';
  return {
    code: 'ABCDE',
    config,
    you,
    hostSeat,
    isHost: you === hostSeat,
    players: playersFor(seats, rest.tournament),
    spectators: [],
    match: match === null ? null : makeMatch({ config, ...match }),
    deadline: null,
    tournament: null,
    ...rest,
    role: 'player',
  };
}

/** The same room as seen by a spectator (identical for all spectators: no own seat, never host, no pick). */
export function makeSpectatorRoom(overrides: Overrides<SpectatorView> = {}): SpectatorView {
  const { match, ...rest } = overrides;
  const config = rest.config ?? { mode: 'classic', bestOf: 3 };
  const seats: SeatId[] = config.mode === 'team2v2' ? ['a0', 'a1', 'b0', 'b1'] : ['a0', 'b0'];
  return {
    role: 'spectator',
    code: 'ABCDE',
    config,
    hostSeat: 'a0',
    isHost: false,
    me: null,
    players: playersFor(seats, rest.tournament),
    spectators: [],
    match: match === null ? null : makeMatch({ config, ...match }),
    deadline: null,
    tournament: null,
    ...rest,
  };
}
