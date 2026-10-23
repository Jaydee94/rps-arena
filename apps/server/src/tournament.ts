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
  markForfeited,
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
import {
  isAbandoned,
  leave,
  markConnected,
  markDisconnected,
  newSpectator,
  rejoinSpectator,
  sameToken,
  tick,
} from './engine';
import type { Who } from './engine';
import { spectatorsOf } from './room';
import type { Participant, Player, Room, TournamentRoom } from './room';
import { graceEnd, participantActive, participantGraceEnd, participantOut, settle, spectatorGraceEnd } from './settle';
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
 * Absence (Stage 2 Task 3b): a participant's `disconnectedAt` is the start of its running grace
 * period. Only a member of the running pairing forfeits when it ends (through its seat: the engine's
 * grace expiry in `tick` → `forfeitSeat` → draw guard → `finishPairing`); its grace runs from
 * max(disconnect, call-up). Waiting and eliminated participants and spectators have no grace: their
 * disconnect only flips `connected`. Leaving for good forfeits (`leaveParticipant`). A forfeited
 * participant stays in `participants` (results and names refer to it); coming back by token it is
 * a spectator (`{ role: 'spectator', id }`, its participant id) without any influence. The host
 * role follows `settleTournamentHost` (in every settle).
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

/**
 * In the lobby, participants that are disconnected past their grace (`participantGraceEnd` <= now)
 * are dropped like expired spectators, freeing their place; a connected participant (the host
 * included) is never dropped. A dropped host's role moves on in the next `settle`. Any other phase,
 * or nothing to drop, returns the identical room. Called from `tick` and `startTournament`.
 */
export function dropLobbyGhosts(room: Room, now: number): Room {
  const t = room.tournament;
  if (!t || t.phase !== 'lobby') return room;
  const participants = t.participants.filter((p) => {
    const end = participantGraceEnd(p);
    return end === null || end > now;
  });
  return participants.length === t.participants.length ? room : withTournament(room, { participants });
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
    // settle: a newcomer takes over a host that is gone past its grace at once.
    const joined = withTournament(room, { participants: [...t.participants, person] });
    return { room: settle(room.match, joined, now, Math.random), who: { role: 'participant', id: person.id } };
  }
  const spectators = spectatorsOf(room);
  if (spectators.length >= MAX_SPECTATORS) fail('room_full');
  return { room: { ...room, spectators: [...spectators, person] }, who: { role: 'spectator', id: person.id } };
}

/**
 * Host only, from the lobby, with at least TOURNAMENT_MIN_PLAYERS participants (lobby ghosts, i.e.
 * disconnected past their grace, do not count and are dropped): draw, then wait DRAW_MS.
 */
export function startTournament(room: Room, byId: string, now: number, rng: Rng): Room {
  const t = requireTournament(room);
  if (byId !== t.hostId) fail('not_host');
  if (t.phase !== 'lobby') fail('wrong_phase');
  // Defensive: lobby ghosts (gone past their grace) never get drawn, even if no tick dropped them yet.
  const present = settleTournamentHost(dropLobbyGhosts(room, now), now);
  const participants = requireTournament(present).participants;
  if (participants.length < TOURNAMENT_MIN_PLAYERS) fail('not_enough_players');
  const state = createTournament(
    t.format,
    participants.map((p) => p.id),
    rng,
  );
  const next = withTournament(present, { state, phase: 'draw', currentPairingId: null, untilMs: now + DRAW_MS });
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
 * starts over; there are never bots. A member who is disconnected at the call-up has its grace
 * period start now (`disconnectedAt` moves to the call-up), so it forfeits RECONNECT_GRACE_MS
 * later unless it comes back.
 */
export function projectPairing(room: Room, pairing: Pairing, now: number, rng: Rng): Room {
  const t = requireTournament(room);
  const known = (id: string | null) => id !== null && t.participants.some((p) => p.id === id);
  if (!known(pairing.a) || !known(pairing.b)) fail('internal');
  // A member who is away at the call-up gets the full grace period from now on: the grace runs
  // from max(disconnect, call-up), never from a disconnect between matches.
  const participants = t.participants.map((p) =>
    (p.id === pairing.a || p.id === pairing.b) && !p.connected
      ? { ...p, disconnectedAt: Math.max(p.disconnectedAt ?? now, now) }
      : p,
  );
  const next: Room = {
    ...withTournament(room, { participants, phase: 'match', currentPairingId: pairing.id, untilMs: null }),
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


/**
 * The seat of a participant in the running pairing (phase `match`), or null. Unlike
 * `participantIdOfSeat` this looks from the participant's side.
 */
function seatOfParticipant(room: Room, id: string): SeatId | null {
  if (participantIdOfSeat(room, 'a0') === id) return 'a0';
  if (participantIdOfSeat(room, 'b0') === id) return 'b0';
  return null;
}

function updateParticipant(room: Room, id: string, change: Partial<Participant>): Room {
  const t = requireTournament(room);
  return withTournament(room, { participants: t.participants.map((p) => (p.id === id ? { ...p, ...change } : p)) });
}

/**
 * Host succession, run in every `settle` after `finishPairing`: while the host is active (not
 * forfeited, connected or within its grace) nothing happens. Otherwise the role passes to the
 * first connected participant (join order) that is not out; spectators never take it. Without such
 * a participant a running tournament (draw, match, intermission) ends: phase `finished`, a running
 * match ends without a winner (and is not recorded), so the room is abandoned once the last grace
 * runs out and the ticker deletes it. In the lobby and after the end the role stays where it is
 * until someone comes back. Rooms without a tournament are returned unchanged.
 */
export function settleTournamentHost(room: Room, now: number, leaving: string | null = null): Room {
  const t = room.tournament;
  if (!t) return room;
  const host = t.participants.find((p) => p.id === t.hostId);
  if (host && host.id !== leaving && participantActive(room, host, now)) return room;
  const heir = t.participants.find(
    (p) => p.id !== t.hostId && p.id !== leaving && p.connected && !participantOut(room, p),
  );
  if (heir) return withTournament(room, { hostId: heir.id });
  if (t.phase === 'lobby' || t.phase === 'finished') return room;
  const match = room.match && room.match.phase !== 'finished' ? { ...room.match, phase: 'finished' as const, winner: null } : room.match;
  return { ...withTournament(room, { phase: 'finished', untilMs: null }), match };
}

/**
 * A participant's connection dropped. A member of the running pairing is handled like any seat
 * (`markDisconnected`: its grace runs, then it forfeits); anyone else (waiting, eliminated,
 * forfeited) only flips `connected`, with no timer of its own. Unknown ids leave the room as it is.
 */
export function markParticipantDisconnected(room: Room, id: string, now: number): Room {
  const t = requireTournament(room);
  if (!t.participants.some((p) => p.id === id)) return room;
  const seat = seatOfParticipant(room, id);
  if (seat) return markDisconnected(room, seat, now);
  const next = updateParticipant(room, id, { connected: false, disconnectedAt: now, socketId: null });
  return settle(room.match, next, now, Math.random);
}

/** A participant is connected (again) on `socketId`; the counterpart of `markParticipantDisconnected`. */
export function markParticipantConnected(room: Room, id: string, now: number, socketId: string | null): Room {
  const t = requireTournament(room);
  if (!t.participants.some((p) => p.id === id)) return room;
  const seat = seatOfParticipant(room, id);
  if (seat) return markConnected(room, seat, now, socketId);
  const next = updateParticipant(room, id, { connected: true, disconnectedAt: null, socketId });
  return settle(room.match, next, now, Math.random);
}

/**
 * A participant leaves for good. In the lobby it is removed. In a running tournament it forfeits:
 * in its own running match through `forfeitSeat` (the match ends at once, the opponent wins),
 * otherwise through `markForfeited` (all its open pairings are lost automatically). After the end
 * it only disconnects (the results stay as they are). In every case it is no longer host.
 * Unknown ids leave the room as it is; leaving twice changes nothing more.
 */
export function leaveParticipant(room: Room, id: string, now: number, rng: Rng): Room {
  const t = requireTournament(room);
  if (!t.participants.some((p) => p.id === id)) return room;
  if (t.phase === 'lobby') {
    const next = withTournament(room, { participants: t.participants.filter((p) => p.id !== id) });
    return settleThenHandOver(room, next, id, now, rng);
  }
  const seat = seatOfParticipant(room, id);
  let next = seat ? markDisconnected(room, seat, now) : room;
  if (seat) {
    next = leave(next, seat);
  } else {
    next = updateParticipant(next, id, { connected: false, disconnectedAt: now, socketId: null });
    if (t.state && t.phase !== 'finished') next = withTournament(next, { state: markForfeited(t.state, id, rng) });
  }
  return settleThenHandOver(room, next, id, now, rng);
}

/**
 * Settles first (the leaver's forfeit ends its match through drawGuard and `finishPairing` records
 * it, exactly as a grace expiry would), then takes the host role off the leaver and settles again.
 */
function settleThenHandOver(room: Room, next: Room, leaving: string, now: number, rng: Rng): Room {
  const settled = settle(room.match, next, now, rng);
  return settle(settled.match, settleTournamentHost(settled, now, leaving), now, rng);
}

/** Who `socketId` is in a tournament room: a pairing seat, a participant, a spectator (forfeiters included), or null. */
export function tournamentWhoOfSocket(room: Room, socketId: string): TournamentWho | null {
  const t = requireTournament(room);
  const participant = t.participants.find((p) => p.socketId === socketId);
  if (participant) {
    const seat = seatOfParticipant(room, participant.id);
    if (seat) return { role: 'player', seat };
    if (participantOut(room, participant)) return { role: 'spectator', id: participant.id };
    return { role: 'participant', id: participant.id };
  }
  const spectator = spectatorsOf(room).find((s) => s.socketId === socketId);
  return spectator ? { role: 'spectator', id: spectator.id } : null;
}

/**
 * Restores the participant or spectator owning `token` and binds it to `socketId` (the tournament
 * counterpart of `rejoinRoom`). A member of the running pairing resolves to its seat; once its
 * seat's grace is over it has forfeited, and if no tick has settled that yet the due tick runs
 * here first (with `rng`), so it comes back as a forfeited watcher, never `bad_token`. Waiting and eliminated
 * participants have no grace and may come back any time, unless the room is abandoned
 * (`room_not_found`). A forfeited participant comes back as a spectator under its participant id.
 * Spectators follow the stage 1 rules. `previousSocketId` is the connection that held the binding.
 */
export function rejoinTournament(
  room: Room,
  token: string,
  now: number,
  socketId: string,
  rng: Rng = Math.random,
): { room: Room; who: TournamentWho; previousSocketId: string | null } {
  const t = requireTournament(room);
  const participant = t.participants.find((p) => p.token !== '' && sameToken(p.token, token));
  if (!participant) return rejoinSpectator(room, token, now, socketId);
  const before = seatOfParticipant(room, participant.id);
  const member = before ? room.players[before] : undefined;
  let current = room;
  if (member && !participantOut(room, participant)) {
    const end = graceEnd(room, member);
    if (end !== null && now >= end) {
      // The grace is over but no tick has forfeited the seat yet: run the due tick here (it
      // forfeits exactly as the ticker would), so the person comes back as a forfeited watcher.
      current = tick(room, now, rng);
      if (!participantOut(current, participant)) fail('bad_token');
    }
  }
  if (isAbandoned(current, now)) fail('room_not_found');
  const seat = seatOfParticipant(current, participant.id);
  const previousSocketId =
    participant.connected && participant.socketId !== socketId ? participant.socketId : null;
  const next = markParticipantConnected(current, participant.id, now, socketId);
  let who: TournamentWho;
  if (participantOut(current, participant)) who = { role: 'spectator', id: participant.id };
  else if (seat) who = { role: 'player', seat };
  else who = { role: 'participant', id: participant.id };
  return { room: next, who, previousSocketId };
}

/**
 * Host only, after the end: back to the lobby for a new tournament. All currently connected people
 * take part, participants first and then spectators (each in join order), up to
 * TOURNAMENT_MAX_PLAYERS; everyone else (overflow and the disconnected) watches as a spectator,
 * keeping its token and connection state. People already past their grace are dropped, and if the
 * spectators would still exceed MAX_SPECTATORS the disconnected ones with the earliest grace end
 * are dropped too (connected ones always fit: at most 8 + MAX_SPECTATORS people exist and 8 of the
 * connected ones become participants). The draw, results and match are cleared; the host stays
 * if it is still a participant, otherwise the role moves on (`settleTournamentHost`).
 */
export function tournamentRematch(room: Room, byId: string, now: number, rng: Rng): Room {
  const t = requireTournament(room);
  if (byId !== t.hostId) fail('not_host');
  if (t.phase !== 'finished') fail('wrong_phase');
  // People whose grace already ran out are gone for good.
  const everyone = [...t.participants, ...spectatorsOf(room)].filter((p) => {
    const end = spectatorGraceEnd(p);
    return end === null || end > now;
  });
  const participants = everyone.filter((p) => p.connected).slice(0, TOURNAMENT_MAX_PLAYERS);
  const spectators = capSpectators(everyone.filter((p) => !participants.includes(p)));
  const next: Room = {
    ...withTournament(room, {
      participants,
      state: null,
      phase: 'lobby',
      currentPairingId: null,
      untilMs: null,
    }),
    spectators,
    players: {},
    match: null,
    phaseDeadline: null,
    nextReady: [],
    history: [],
    idleRounds: 0,
    roundActed: false,
  };
  return settle(room.match, next, now, rng);
}

/** Trims disconnected spectators (earliest grace end first) until at most MAX_SPECTATORS remain. */
function capSpectators(spectators: Participant[]): Participant[] {
  const excess = spectators.length - MAX_SPECTATORS;
  if (excess <= 0) return spectators;
  const dropped = new Set(
    spectators
      .filter((s) => !s.connected)
      .sort((x, y) => (x.disconnectedAt ?? 0) - (y.disconnectedAt ?? 0))
      .slice(0, excess),
  );
  return spectators.filter((s) => !dropped.has(s));
}
