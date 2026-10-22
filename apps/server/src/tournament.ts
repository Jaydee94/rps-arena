import {
  DRAW_MS,
  INTERMISSION_MS,
  MAX_SPECTATORS,
  ProtocolError,
  TOURNAMENT_MAX_PLAYERS,
  TOURNAMENT_MIN_PLAYERS,
  createMatch,
  createTournament,
  generateCode,
  isFinished,
  nextPairing,
  recordResult,
  settleAutomatic,
} from '@rps/shared';
import type {
  ErrorCode,
  MatchOutcome,
  ModeId,
  Pairing,
  RoomConfig,
  SeatId,
  TournamentFormat,
} from '@rps/shared';
import { isAbandoned, newSpectator } from './engine';
import type { Who } from './engine';
import { spectatorsOf } from './room';
import type { Participant, Player, Room, TournamentRoom } from './room';
import { settle } from './settle';
import type { Rng } from './settle';

/**
 * Tournament rooms: lobby, start, draw, running each pairing as an ordinary a0-vs-b0 match through
 * the existing engine, intermission and end. Pure like engine.ts: `Room` in, new `Room` out (never
 * mutating the input) or a `ProtocolError`; time via `now`, randomness only via `rng`.
 *
 * People: `tournament.participants` is the single source of truth. `players` only mirrors the two
 * members of the running pairing on a0/b0 (same token, socket and connection state) and is
 * re-derived by `syncPairing` in every `settle`; between matches it is empty. Spectators (late or
 * surplus joiners) live in `room.spectators` exactly as in duel rooms.
 *
 * Phase flow: lobby → (startTournament) draw → (untilMs, or skip) match → (match finished, via
 * settle → finishPairing) intermission → (untilMs, or skip) match → … → finished. The draw and the
 * intermission end through `untilMs`, which feeds the room's wake-up `deadline`, so the ticker of
 * any replica advances them and a racing replica's `tick` is a no-op (see `advanceTournament`).
 *
 * Not here yet (Stage 2 Task 3b): grace and forfeit timing between matches, host change, rematch
 * and rejoin by token for participants outside the running pairing.
 */

/** Who a session is in a tournament room: a pairing seat, a spectator, or a waiting participant. */
export type TournamentWho = Who | { role: 'participant'; id: string };

export interface CreateTournamentRoomInput {
  config: RoomConfig;
  format: TournamentFormat;
  nickname: string;
  avatar: string;
  socketId?: string | null;
  /** Fixed code (tests); otherwise drawn with `rng`. */
  code?: string;
}

const TOURNAMENT_MODES: readonly ModeId[] = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15'];
const FORMATS: readonly TournamentFormat[] = ['knockout', 'roundrobin'];

function fail(code: ErrorCode): never {
  throw new ProtocolError(code);
}

function requireTournament(room: Room): TournamentRoom {
  if (!room.tournament) fail('invalid_input');
  return room.tournament;
}

function withTournament(room: Room, patch: Partial<TournamentRoom>): Room {
  return { ...room, tournament: { ...requireTournament(room), ...patch } };
}

/** Everyone holding an id in the room (participants and spectators share one id space). */
function people(room: Room): Participant[] {
  return [...(room.tournament?.participants ?? []), ...spectatorsOf(room)];
}

/** New tournament lobby; the creator is its first participant and host. No seats are taken. */
export function createTournamentRoom(input: CreateTournamentRoomInput, _now: number, rng: Rng = Math.random): Room {
  const { config, format } = input;
  if (!TOURNAMENT_MODES.includes(config.mode) || config.bestOf !== 3) fail('invalid_input');
  if (!FORMATS.includes(format)) fail('invalid_input');
  const host = newSpectator([], input.nickname, input.avatar, input.socketId ?? null);
  return {
    code: input.code ?? generateCode(rng),
    version: 0,
    config: { mode: config.mode, bestOf: 3 },
    hostSeat: 'a0',
    players: {},
    match: null,
    deadline: null,
    phaseDeadline: null,
    botLevel: null,
    history: [],
    nextReady: [],
    idleRounds: 0,
    roundActed: false,
    tournament: {
      format,
      hostId: host.id,
      participants: [host],
      state: null,
      phase: 'lobby',
      currentPairingId: null,
      untilMs: null,
    },
  };
}

/**
 * In the lobby with fewer than TOURNAMENT_MAX_PLAYERS participants the joiner becomes a
 * participant; otherwise (lobby full, or the tournament has started) a spectator under the
 * stage 1 rules (MAX_SPECTATORS, else `room_full`). Timers and the match stay untouched.
 */
export function joinTournamentRoom(
  room: Room,
  nickname: string,
  avatar: string,
  now: number,
  socketId: string | null = null,
): { room: Room; who: TournamentWho } {
  const t = requireTournament(room);
  if (isAbandoned(room, now)) fail('room_not_found');
  const person = newSpectator(people(room), nickname, avatar, socketId);
  if (t.phase === 'lobby' && t.participants.length < TOURNAMENT_MAX_PLAYERS) {
    return {
      room: withTournament(room, { participants: [...t.participants, person] }),
      who: { role: 'participant', id: person.id },
    };
  }
  const spectators = spectatorsOf(room);
  if (spectators.length >= MAX_SPECTATORS) fail('room_full');
  return { room: { ...room, spectators: [...spectators, person] }, who: { role: 'spectator', id: person.id } };
}

/** Host only, from the lobby, with at least TOURNAMENT_MIN_PLAYERS participants: draw, then wait DRAW_MS. */
export function startTournament(room: Room, byId: string, now: number, rng: Rng): Room {
  const t = requireTournament(room);
  if (byId !== t.hostId) fail('not_host');
  if (t.phase !== 'lobby') fail('wrong_phase');
  if (t.participants.length < TOURNAMENT_MIN_PLAYERS) fail('not_enough_players');
  const state = createTournament(
    t.format,
    t.participants.map((p) => p.id),
    rng,
  );
  const next = withTournament(room, { state, phase: 'draw', currentPairingId: null, untilMs: now + DRAW_MS });
  return settle(room.match, next, now, rng);
}

/** Host only: ends the draw or the intermission now (`wrong_phase` in any other phase). */
export function skipTournamentWait(room: Room, byId: string, now: number, rng: Rng): Room {
  const t = requireTournament(room);
  if (byId !== t.hostId) fail('not_host');
  if (t.phase !== 'draw' && t.phase !== 'intermission') fail('wrong_phase');
  return beginNextPairing(room, now, rng);
}

/**
 * Ends a due draw or intermission: the next pairing starts, or the tournament is finished if
 * there is none. Returns the identical room when nothing is due, so a replica whose tick lost
 * the race (the wait is already over) changes nothing.
 */
export function advanceTournament(room: Room, now: number, rng: Rng): Room {
  const t = room.tournament;
  if (!t || (t.phase !== 'draw' && t.phase !== 'intermission')) return room;
  if (t.untilMs === null || t.untilMs > now) return room;
  return beginNextPairing(room, now, rng);
}

function beginNextPairing(room: Room, now: number, rng: Rng): Room {
  const t = requireTournament(room);
  if (!t.state) fail('internal');
  // States from createTournament / recordResult are already settled; this is a cheap safety net
  // so that a bye or forfeit can never leave the tournament without a next step.
  const state = settleAutomatic(t.state, rng);
  const pairing = nextPairing(state);
  const next = withTournament(room, { state });
  if (pairing) return projectPairing(next, pairing, now, rng);
  // No playable pairing left: the tournament is over (a non-finished state here would freeze it).
  return settle(room.match, withTournament(next, { phase: 'finished', untilMs: null }), now, rng);
}

/** The participant a seat of the running pairing belongs to, if any. */
export function participantIdOfSeat(room: Room, seat: SeatId): string | null {
  const t = room.tournament;
  if (!t || t.phase !== 'match' || !t.state) return null;
  const pairing = t.state.pairings.find((p) => p.id === t.currentPairingId);
  if (!pairing) return null;
  if (seat === 'a0') return pairing.a;
  if (seat === 'b0') return pairing.b;
  return null;
}

/** Applies a connection change of a pairing seat to its participant (the source of truth). */
export function updateSeatParticipant(
  room: Room,
  seat: SeatId,
  change: Pick<Participant, 'connected' | 'disconnectedAt' | 'socketId'>,
): Room {
  const id = participantIdOfSeat(room, seat);
  const t = room.tournament;
  if (!t || id === null) return room;
  const participants = t.participants.map((p) => (p.id === id ? { ...p, ...change } : p));
  return withTournament(room, { participants });
}

function seatPlayer(p: Participant, seat: SeatId): Player {
  return {
    seat,
    nickname: p.nickname,
    avatar: p.avatar,
    token: p.token,
    socketId: p.socketId,
    connected: p.connected,
    disconnectedAt: p.disconnectedAt,
    isBot: false,
  };
}

/**
 * Re-derives `players` from the participants: the running pairing on a0/b0 in phase `match`,
 * nobody otherwise. Rooms without a tournament are returned unchanged.
 */
export function syncPairing(room: Room): Room {
  const t = room.tournament;
  if (!t) return room;
  const players: Room['players'] = {};
  const pairing = t.phase === 'match' ? t.state?.pairings.find((p) => p.id === t.currentPairingId) : undefined;
  if (pairing) {
    const a = t.participants.find((p) => p.id === pairing.a);
    const b = t.participants.find((p) => p.id === pairing.b);
    if (a) players.a0 = seatPlayer(a, 'a0');
    if (b) players.b0 = seatPlayer(b, 'b0');
  }
  return { ...room, players };
}

/**
 * Puts the pairing's two participants on a0/b0 and starts their match through the engine
 * (`settle` sets the phase deadline). Tie-break pairings play best of 1. The idle-round state
 * starts over; there are never bots.
 */
export function projectPairing(room: Room, pairing: Pairing, now: number, rng: Rng): Room {
  const t = requireTournament(room);
  const known = (id: string | null) => id !== null && t.participants.some((p) => p.id === id);
  if (!known(pairing.a) || !known(pairing.b)) fail('internal');
  const next: Room = {
    ...withTournament(room, { phase: 'match', currentPairingId: pairing.id, untilMs: null }),
    match: createMatch({ ...room.config, bestOf: pairing.bestOf }),
    botLevel: null,
    history: [],
    nextReady: [],
    idleRounds: 0,
    roundActed: false,
  };
  return settle(room.match, syncPairing(next), now, rng);
}

/**
 * Once the running pairing's match is finished: records its outcome (`recordResult`, which
 * applies the no-winner and forfeit rules with `rng`), then waits INTERMISSION_MS, or ends the
 * tournament. Any other room is returned unchanged. Called from `settle` after the draw guard.
 */
export function finishPairing(room: Room, now: number, rng: Rng): Room {
  const t = room.tournament;
  const match = room.match;
  if (!t || t.phase !== 'match' || !t.state || !t.currentPairingId) return room;
  if (!match || match.phase !== 'finished') return room;
  const a = match.forfeited.includes('a0');
  const b = match.forfeited.includes('b0');
  const outcome: MatchOutcome = {
    winner: match.winner,
    score: { a: match.score.a, b: match.score.b },
    forfeit: a && b ? 'both' : a ? 'a' : b ? 'b' : null,
  };
  const state = recordResult(t.state, t.currentPairingId, outcome, rng);
  const done = isFinished(state);
  return withTournament(room, {
    state,
    phase: done ? 'finished' : 'intermission',
    untilMs: done ? null : now + INTERMISSION_MS,
  });
}
