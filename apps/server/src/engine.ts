import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  AVATARS,
  IDLE_ROUNDS_LIMIT,
  MAX_SPECTATORS,
  ProtocolError,
  activeSeats,
  advance,
  announce,
  createMatch,
  forfeitSeat,
  generateCode,
  parseNickname,
  pick,
  scoreWinner,
  timeoutPhase,
} from '@rps/shared';
import type { BotLevel, ErrorCode, MatchState, RoomConfig, SeatId } from '@rps/shared';
import { spectatorsOf } from './room';
import type { Player, Room, Spectator } from './room';
import {
  BOT_SEAT,
  HUMAN_SEAT,
  botStep,
  graceEnd,
  humans,
  isAbandoned,
  isForfeited,
  rescheduleWakeUp,
  settle,
  spectatorGraceEnd,
} from './settle';
import type { Rng } from './settle';
import { advanceTournament, updateSeatParticipant } from './tournament';

/**
 * Pure room operations. Every function takes a room and returns a new one (never mutating its
 * input) or throws a `ProtocolError` / `RuleError`. Time comes in as `now`; randomness only via
 * `rng` (room code, bot) and `randomBytes` (tokens, spectator ids).
 *
 * Spectators (`room.spectators`) watch and never play: no operation that concerns them alone
 * touches the match, `phaseDeadline`, `nextReady` or the idle-round state; their grace expiry
 * only feeds the wake-up `deadline` so that `tick` can drop them.
 */

export { isAbandoned } from './settle';

/** Who a session or socket is in a room: a seated player or a spectator. */
export type Who = { role: 'player'; seat: SeatId } | { role: 'spectator'; id: string };

/** Seat fill order: the two duel seats first, then the 2v2 partners. */
const SEAT_ORDER: SeatId[] = ['a0', 'b0', 'a1', 'b1'];
const BOT_NAMES: Record<BotLevel, string> = { easy: 'Rocky', medium: 'Sneaky', hard: 'Mastermind' };
const BOT_AVATAR = 'robot';

function fail(code: ErrorCode): never {
  throw new ProtocolError(code);
}

/** 128-bit random session token. Never logged, never part of a view. */
function newToken(): string {
  return randomBytes(16).toString('hex');
}

function seatsOf(config: RoomConfig): SeatId[] {
  const active = activeSeats(config.mode);
  return SEAT_ORDER.filter((s) => active.includes(s));
}

function parseAvatar(avatar: string): string {
  if (!AVATARS.includes(avatar)) fail('invalid_input');
  return avatar;
}

function newPlayer(seat: SeatId, nickname: string, avatar: string, socketId: string | null): Player {
  parseAvatar(avatar);
  return {
    seat,
    nickname: parseNickname(nickname),
    avatar,
    token: newToken(),
    socketId,
    connected: true,
    disconnectedAt: null,
    isBot: false,
  };
}

/** 8 hex characters (32 random bits), unique within the room. */
function newSpectatorId(taken: Spectator[]): string {
  for (;;) {
    const id = randomBytes(4).toString('hex');
    if (!taken.some((s) => s.id === id)) return id;
  }
}

/** A new spectator (or tournament participant, same shape) with an id not used in `taken`. */
export function newSpectator(
  taken: Spectator[],
  nickname: string,
  avatar: string,
  socketId: string | null,
): Spectator {
  return {
    id: newSpectatorId(taken),
    nickname: parseNickname(nickname),
    avatar: parseAvatar(avatar),
    token: newToken(),
    socketId,
    connected: true,
    disconnectedAt: null,
  };
}

/** A human picked or announced: the room is in use, the idle-round counter starts over. */
function humanActed(room: Room, seat: SeatId): Room {
  if (room.players[seat]?.isBot !== false) return room;
  return { ...room, idleRounds: 0, roundActed: true };
}

function requireMatch(room: Room): MatchState {
  if (!room.match) fail('wrong_phase');
  return room.match;
}

export interface CreateRoomInput {
  config: RoomConfig;
  nickname: string;
  avatar: string;
  vsBot?: BotLevel;
  socketId?: string | null;
  /** Fixed code (tests); otherwise drawn with `rng`. */
  code?: string;
}

/** New room with the host in a0. With `vsBot` the bot takes b0 and the match starts at once. */
export function createRoom(input: CreateRoomInput, now: number, rng: Rng = Math.random): Room {
  if (input.vsBot && input.config.mode === 'team2v2') fail('invalid_input');
  const host = newPlayer('a0', input.nickname, input.avatar, input.socketId ?? null);
  const room: Room = {
    code: input.code ?? generateCode(rng),
    version: 0,
    config: input.config,
    hostSeat: 'a0',
    players: { a0: host },
    match: null,
    deadline: null,
    phaseDeadline: null,
    botLevel: input.vsBot ?? null,
    history: [],
    nextReady: [],
    idleRounds: 0,
    roundActed: false,
  };
  if (!input.vsBot) return room;
  room.players[BOT_SEAT] = {
    seat: BOT_SEAT,
    nickname: BOT_NAMES[input.vsBot],
    avatar: BOT_AVATAR,
    token: '',
    socketId: null,
    connected: true,
    disconnectedAt: null,
    isBot: true,
  };
  return settle(null, { ...room, match: createMatch(input.config) }, now, rng);
}

/**
 * In the lobby (no match yet) takes the first free seat, else `room_full`. Once a match exists
 * (running or finished) the joiner becomes a spectator, up to MAX_SPECTATORS; seats, match and
 * timers stay untouched.
 *
 * Two spectator rules live only in code: MAX_SPECTATORS also counts disconnected spectators that
 * are still inside their reconnect grace period (their slot is only freed once the ticker drops
 * them), and a repeated disconnect of the same spectator resets `disconnectedAt`, so the grace
 * period starts over from the latest disconnect.
 */
export function joinRoom(
  room: Room,
  nickname: string,
  avatar: string,
  now: number,
  socketId: string | null = null,
): { room: Room; who: Who } {
  // Tournament rooms take joiners through `joinTournamentRoom` (tournament.ts).
  if (room.tournament) fail('invalid_input');
  if (isAbandoned(room, now)) fail('room_not_found');
  if (room.match) {
    const spectators = spectatorsOf(room);
    if (spectators.length >= MAX_SPECTATORS) fail('room_full');
    const spectator = newSpectator(spectators, nickname, avatar, socketId);
    return {
      room: { ...room, spectators: [...spectators, spectator] },
      who: { role: 'spectator', id: spectator.id },
    };
  }
  const seat = seatsOf(room.config).find((s) => !room.players[s]);
  if (!seat) fail('room_full');
  const players = { ...room.players, [seat]: newPlayer(seat, nickname, avatar, socketId) };
  return { room: { ...room, players }, who: { role: 'player', seat } };
}

/**
 * Lobby seat change to a free seat. The host may move anyone; everyone else only themselves.
 * The host seat follows the host. Tokens belong to the player and stay valid.
 */
export function moveSeat(room: Room, by: SeatId, from: SeatId, to: SeatId): Room {
  // Tournament seats are derived from the running pairing, nobody moves them.
  if (room.tournament) fail('invalid_input');
  if (by !== room.hostSeat && from !== by) fail('not_host');
  if (room.match) fail('invalid_input');
  const seats = seatsOf(room.config);
  if (!seats.includes(from) || !seats.includes(to) || from === to) fail('invalid_input');
  const player = room.players[from];
  if (!player || room.players[to]) fail('invalid_input');
  const players = { ...room.players, [to]: { ...player, seat: to } };
  delete players[from];
  return { ...room, players, hostSeat: room.hostSeat === from ? to : room.hostSeat };
}

/** Host starts the match once every seat of the mode is taken. */
export function startMatch(room: Room, by: SeatId, now: number): Room {
  // Tournament matches start through the tournament flow (startTournament / advanceTournament).
  if (room.tournament) fail('wrong_phase');
  if (by !== room.hostSeat) fail('not_host');
  if (room.match) fail('wrong_phase');
  if (seatsOf(room.config).some((s) => !room.players[s])) fail('wrong_phase');
  return settle(null, { ...room, match: createMatch(room.config) }, now, Math.random);
}

export function applyPick(
  room: Room,
  seat: SeatId,
  payload: { gesture: string },
  now: number,
  rng: Rng = Math.random,
): Room {
  const match = requireMatch(room);
  const next = { ...humanActed(room, seat), match: pick(match, seat, payload.gesture) };
  return settle(match, next, now, rng);
}

export function applyAnnounce(
  room: Room,
  seat: SeatId,
  payload: { emote: string | null },
  now: number,
  rng: Rng = Math.random,
): Room {
  const match = requireMatch(room);
  const next = { ...humanActed(room, seat), match: announce(match, seat, payload.emote) };
  return settle(match, next, now, rng);
}

/** Skip vote during the reveal; advances once every connected, active human voted. */
export function applyNext(room: Room, seat: SeatId, now: number, rng: Rng = Math.random): Room {
  const match = requireMatch(room);
  if (match.phase !== 'reveal') fail('wrong_phase');
  const nextReady = room.nextReady.includes(seat) ? room.nextReady : [...room.nextReady, seat];
  const voters = humans(room).filter((p) => p.connected && !isForfeited(room, p.seat));
  if (!voters.every((p) => nextReady.includes(p.seat))) return { ...room, nextReady };
  return settle(match, { ...room, nextReady, match: advance(match) }, now, rng);
}

/** New match for the same players (bots included), from any seat once finished. */
export function rematch(room: Room, by: SeatId, now: number, rng: Rng = Math.random): Room {
  // A tournament has no duel rematch (its own rematch is Stage 2 Task 3b).
  if (room.tournament) fail('wrong_phase');
  const match = requireMatch(room);
  if (match.phase !== 'finished' || !room.players[by]) fail('wrong_phase');
  // Players who left the old match for good give up their seat.
  const players: Room['players'] = {};
  for (const [seat, player] of Object.entries(room.players) as [SeatId, Player][]) {
    if (!match.forfeited.includes(seat)) players[seat] = player;
  }
  const full = seatsOf(room.config).every((s) => players[s]);
  const next = {
    ...room,
    players,
    match: full ? createMatch(room.config) : null,
    idleRounds: 0,
    roundActed: false,
  };
  return settle(match, withHost(next), now, rng);
}

/** Keeps `hostSeat` on a seated human; moves it to the first remaining human otherwise. */
function withHost(room: Room): Room {
  if (room.players[room.hostSeat]) return room;
  const heir = SEAT_ORDER.find((s) => room.players[s] && !room.players[s].isBot);
  return heir ? { ...room, hostSeat: heir } : room;
}

/**
 * A seat leaves for good: in a running match it forfeits (and keeps its place on the board),
 * in the lobby or after the match it frees the seat.
 */
export function leave(room: Room, seat: SeatId): Room {
  const match = room.match;
  if (match && match.phase !== 'finished') return { ...room, match: forfeitSeat(match, seat) };
  const players = { ...room.players };
  delete players[seat];
  return withHost({ ...room, players });
}

export function seatOfSocket(room: Room, socketId: string): SeatId | null {
  const player = Object.values(room.players).find((p) => p && !p.isBot && p.socketId === socketId);
  return player?.seat ?? null;
}

/** The player seat or spectator bound to `socketId`, or null. */
export function whoOfSocket(room: Room, socketId: string): Who | null {
  const seat = seatOfSocket(room, socketId);
  if (seat) return { role: 'player', seat };
  const spectator = spectatorsOf(room).find((s) => s.socketId === socketId);
  return spectator ? { role: 'spectator', id: spectator.id } : null;
}

/**
 * Replaces (or with `null` removes) spectator `id` and only re-derives the wake-up `deadline`.
 * Unknown ids leave the room as it is.
 */
function updateSpectator(room: Room, id: string, fn: (s: Spectator) => Spectator | null): Room {
  const current = spectatorsOf(room);
  const spectator = current.find((s) => s.id === id);
  if (!spectator) return room;
  const changed = fn(spectator);
  const spectators = changed
    ? current.map((s) => (s === spectator ? changed : s))
    : current.filter((s) => s !== spectator);
  return rescheduleWakeUp({ ...room, spectators });
}

export function markSpectatorDisconnected(room: Room, id: string, now: number): Room {
  return updateSpectator(room, id, (s) => ({
    ...s,
    connected: false,
    disconnectedAt: now,
    socketId: null,
  }));
}

export function markSpectatorConnected(
  room: Room,
  id: string,
  // Kept for symmetry with `markConnected`; a spectator's return does not depend on the time.
  _now: number,
  socketId: string | null,
): Room {
  return updateSpectator(room, id, (s) => ({ ...s, connected: true, disconnectedAt: null, socketId }));
}

/** A spectator leaves for good; their slot is free again. */
export function leaveSpectator(room: Room, id: string): Room {
  return updateSpectator(room, id, () => null);
}

/**
 * Applies a connection change to a seated human. In a tournament room the change goes to the
 * seat's participant as well, because `settle` re-derives the seats from the participants.
 */
function changeConnection(
  room: Room,
  seat: SeatId,
  now: number,
  change: Pick<Player, 'connected' | 'disconnectedAt' | 'socketId'>,
): Room {
  const player = room.players[seat];
  if (!player || player.isBot) return room;
  const players = { ...room.players, [seat]: { ...player, ...change } };
  const next = updateSeatParticipant({ ...room, players }, seat, change);
  return settle(room.match, next, now, Math.random);
}

export function markDisconnected(room: Room, seat: SeatId, now: number): Room {
  return changeConnection(room, seat, now, { connected: false, disconnectedAt: now, socketId: null });
}

export function markConnected(
  room: Room,
  seat: SeatId,
  now: number,
  socketId: string | null = null,
): Room {
  return changeConnection(room, seat, now, { connected: true, disconnectedAt: null, socketId });
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Restores the seat or spectator that owns `token` and binds it to `socketId`.
 * `previousSocketId` is the connection that held it until now (to be dropped from the room), if
 * any. Past its grace period (or once the ticker dropped it) a token is `bad_token`.
 */
export function rejoinRoom(
  room: Room,
  token: string,
  now: number,
  socketId: string,
): { room: Room; who: Who; previousSocketId: string | null } {
  const player = humans(room).find((p) => p.token !== '' && sameToken(p.token, token));
  if (player) {
    if (isForfeited(room, player.seat)) fail('bad_token');
    const end = graceEnd(room, player);
    if (end !== null && now >= end) fail('bad_token');
    const previous = player.connected && player.socketId !== socketId ? player.socketId : null;
    return {
      room: markConnected(room, player.seat, now, socketId),
      who: { role: 'player', seat: player.seat },
      previousSocketId: previous,
    };
  }
  const spectator = spectatorsOf(room).find((s) => s.token !== '' && sameToken(s.token, token));
  if (!spectator) fail('bad_token');
  const end = spectatorGraceEnd(spectator);
  if (end !== null && now >= end) fail('bad_token');
  // Nobody may come back into an abandoned room: the ticker is about to delete it.
  if (isAbandoned(room, now)) fail('room_not_found');
  const previous = spectator.connected && spectator.socketId !== socketId ? spectator.socketId : null;
  return {
    room: markSpectatorConnected(room, spectator.id, now, socketId),
    who: { role: 'spectator', id: spectator.id },
    previousSocketId: previous,
  };
}

/**
 * Runs whatever is due: grace expiries (forfeit / free the seat; drop the spectator), the phase
 * timeout, bot catch-up, the end of a tournament's draw or intermission. Returns the identical room when `deadline` is null or in the future, so
 * a replica that lost the race to another one's tick changes nothing.
 */
export function tick(room: Room, now: number, rng: Rng = Math.random): Room {
  if (room.deadline === null || room.deadline > now) return room;
  const prev = room.match;
  let next = dropExpiredSpectators(room, now);
  for (const player of humans(room)) {
    const end = graceEnd(room, player);
    if (end !== null && end <= now) next = leave(next, player.seat);
  }
  const match = next.match;
  const phaseDue = next.phaseDeadline !== null && next.phaseDeadline <= now;
  if (match && match.phase !== 'finished' && phaseDue) {
    if (match.phase === 'reveal') {
      next = { ...next, match: advance(match) };
    } else {
      next = botStep(next, rng, match.phase);
      next = { ...next, match: timeoutPhase(next.match!) };
      if (match.phase === 'pick') next = countIdleRound(next);
    }
  }
  // A due tournament draw or intermission starts the next pairing (or ends the tournament).
  next = advanceTournament(next, now, rng);
  return settle(prev, next, now, rng);
}

/** Removes spectators whose reconnect grace ran out. Their only effect on the ticker. */
function dropExpiredSpectators(room: Room, now: number): Room {
  const current = spectatorsOf(room);
  const spectators = current.filter((s) => {
    const end = spectatorGraceEnd(s);
    return end === null || end > now;
  });
  return spectators.length === current.length ? room : { ...room, spectators };
}

/**
 * Abandonment rule: a round that timed out without any human pick or announce counts as idle.
 * After IDLE_ROUNDS_LIMIT idle rounds in a row the match ends with no winner, so rooms whose
 * players went AFK or whose sockets died with a crashed replica stop ticking (and stop renewing
 * their TTL) instead of drawing forever.
 */
function countIdleRound(room: Room): Room {
  if (room.roundActed) return room;
  const idleRounds = (room.idleRounds ?? 0) + 1;
  // A match the timed-out round already decided by score (the bot reached the winning score, the
  // match is in its last reveal or finished) keeps its real winner: the abandonment rule must not
  // overwrite it with "no winner".
  if (idleRounds < IDLE_ROUNDS_LIMIT || !room.match || scoreWinner(room.match) !== null) {
    return { ...room, idleRounds };
  }
  return { ...room, idleRounds, match: { ...room.match, phase: 'finished', winner: null } };
}

export { HUMAN_SEAT, BOT_SEAT };
