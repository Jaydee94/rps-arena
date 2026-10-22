import {
  ANNOUNCE_TIMEOUT_MS,
  PICK_TIMEOUT_MS,
  RECONNECT_GRACE_MS,
  REVEAL_MS,
  activeSeats,
  announce,
  gestureSetFor,
  pick,
} from '@rps/shared';
import type { MatchState, SeatId, Team } from '@rps/shared';
import { chooseBotEmote, chooseBotGesture } from './bot';
import { spectatorsOf } from './room';
import type { Player, Room, Spectator } from './room';

/**
 * Derived-state bookkeeping shared by every engine operation: bot moves, the endless-draw guard,
 * bot history and the deadlines. Internal to the engine (see engine.ts).
 */

export type Rng = () => number;

/** In a bot room the human always sits in a0 and the bot in b0. */
export const HUMAN_SEAT: SeatId = 'a0';
export const BOT_SEAT: SeatId = 'b0';

const PHASE_MS: Record<'announce' | 'pick' | 'reveal', number> = {
  announce: ANNOUNCE_TIMEOUT_MS,
  pick: PICK_TIMEOUT_MS,
  reveal: REVEAL_MS,
};

export function isForfeited(room: Room, seat: SeatId): boolean {
  return room.match?.forfeited.includes(seat) ?? false;
}

export function humans(room: Room): Player[] {
  return Object.values(room.players).filter((p): p is Player => p !== undefined && !p.isBot);
}

/** Grace end of a disconnected, not yet forfeited human, or null. */
export function graceEnd(room: Room, player: Player): number | null {
  if (player.isBot || player.connected || player.disconnectedAt === null) return null;
  if (isForfeited(room, player.seat)) return null;
  return player.disconnectedAt + RECONNECT_GRACE_MS;
}

/**
 * Grace end of a disconnected spectator, or null. Spectators are never players: this only tells
 * the ticker when to drop them, it never feeds `graceEnd`, `isAbandoned` or `phaseDeadline`.
 */
export function spectatorGraceEnd(spectator: Spectator): number | null {
  if (spectator.connected || spectator.disconnectedAt === null) return null;
  return spectator.disconnectedAt + RECONNECT_GRACE_MS;
}

/** True once no human can act in the room anymore (all gone past grace or forfeited). */
export function isAbandoned(room: Room, now: number): boolean {
  return !humans(room).some((p) => {
    if (isForfeited(room, p.seat)) return false;
    if (p.connected) return true;
    const end = graceEnd(room, p);
    return end !== null && now < end;
  });
}

/** A timed phase key: changes whenever a new phase (or round) starts. */
function phaseKey(match: MatchState | null): string | null {
  if (!match || match.phase === 'finished') return null;
  return `${match.phase}:${match.round}`;
}

/**
 * Lets the bot act. It announces / picks only once the human has done so in this phase (or has
 * forfeited), or when `forcePhase` (the phase that is timing out) says it must act now. It only
 * ever sees the revealed `history`, never the current human pick.
 */
export function botStep(room: Room, rng: Rng, forcePhase: MatchState['phase'] | null = null): Room {
  let match = room.match;
  if (!room.botLevel || !match) return room;
  const set = gestureSetFor(match.config.mode);
  const humanGone = match.forfeited.includes(HUMAN_SEAT);
  const phase = match.phase;

  if (phase === 'announce' && !(BOT_SEAT in match.announces)) {
    if (forcePhase === 'announce' || humanGone || HUMAN_SEAT in match.announces) {
      match = announce(match, BOT_SEAT, chooseBotEmote(set, rng));
    }
  }
  if (match.phase === 'pick' && phase === 'pick' && !(BOT_SEAT in match.picks)) {
    if (forcePhase === 'pick' || humanGone || HUMAN_SEAT in match.picks) {
      match = pick(match, BOT_SEAT, chooseBotGesture(room.botLevel, set, room.history, rng));
    }
  }
  return match === room.match ? room : { ...room, match };
}

/**
 * The bot only looks at recent rounds (the hard level's Markov window), but the history is stored
 * in the room JSON that is rewritten on every update: unbounded it would grow Redis with every
 * round of a bot room, rematches included.
 */
export const BOT_HISTORY_MAX = 50;

/** Appends the just revealed round of a bot room to its history. */
function recordHistory(prev: MatchState | null, room: Room): Room {
  const match = room.match;
  if (!room.botLevel || match?.phase !== 'reveal' || phaseKey(prev) === phaseKey(match)) {
    return room;
  }
  const human = match.lastRound?.picks[HUMAN_SEAT];
  const bot = match.lastRound?.picks[BOT_SEAT];
  if (human === undefined || bot === undefined) return room;
  return { ...room, history: [...room.history, { human, bot }].slice(-BOT_HISTORY_MAX) };
}

/** Seats facing each other: a0 vs b0 (and a1 vs b1 in 2v2). */
function duelPairs(room: Room): [SeatId, SeatId][] {
  const seats = activeSeats(room.config.mode);
  return seats.includes('a1') ? [['a0', 'b0'], ['a1', 'b1']] : [['a0', 'b0']];
}

/**
 * Endless-draw guard: once no duel has two live (seated, not forfeited) participants, every
 * further round has a fixed outcome, which may be a draw forever (both 1v1 seats gone, or the
 * cross case a0 + b1 in 2v2). The match ends then: the team with more live seats wins; on a tie
 * the score leader, else no winner.
 */
function drawGuard(room: Room): Room {
  const match = room.match;
  if (!match || match.phase === 'finished') return room;
  const live = (seat: SeatId) => room.players[seat] !== undefined && !match.forfeited.includes(seat);
  if (duelPairs(room).some(([x, y]) => live(x) && live(y))) return room;

  const count = (team: Team) =>
    activeSeats(room.config.mode).filter((s) => s.startsWith(team) && live(s)).length;
  const [a, b] = [count('a'), count('b')];
  let winner: Team | null = a > b ? 'a' : b > a ? 'b' : null;
  if (winner === null && match.score.a !== match.score.b) {
    winner = match.score.a > match.score.b ? 'a' : 'b';
  }
  return { ...room, match: { ...match, phase: 'finished', winner } };
}

/** Recomputes `phaseDeadline` (on a phase change) and the wake-up `deadline`. */
function schedule(prev: MatchState | null, room: Room, now: number): Room {
  let { phaseDeadline, nextReady, roundActed } = room;
  const key = phaseKey(room.match);
  if (key !== phaseKey(prev)) {
    phaseDeadline = key && room.match ? now + PHASE_MS[room.match.phase as keyof typeof PHASE_MS] : null;
    nextReady = [];
    // A new round (or a new match) starts without any human action yet.
    if (key && (!prev || prev.phase === 'finished' || prev.round !== room.match?.round)) {
      roundActed = false;
    }
  }
  return { ...room, phaseDeadline, nextReady, roundActed, deadline: wakeUp(room, phaseDeadline) };
}

/** Earliest of the phase timeout and every pending grace expiry (players and spectators). */
function wakeUp(room: Room, phaseDeadline: number | null): number | null {
  const wakeUps = [
    ...humans(room).map((p) => graceEnd(room, p)),
    ...spectatorsOf(room).map(spectatorGraceEnd),
    phaseDeadline,
  ].filter((t): t is number => t !== null);
  return wakeUps.length > 0 ? Math.min(...wakeUps) : null;
}

/**
 * Recomputes only the wake-up `deadline`, for changes that concern spectators alone: the match,
 * `phaseDeadline`, `nextReady` and the idle-round state stay exactly as they are.
 */
export function rescheduleWakeUp(room: Room): Room {
  const deadline = wakeUp(room, room.phaseDeadline);
  return deadline === room.deadline ? room : { ...room, deadline };
}

/**
 * Brings derived state up to date after an operation changed `room` (whose match was `prev`
 * before): bot catches up, history, draw guard, deadlines.
 */
export function settle(prev: MatchState | null, room: Room, now: number, rng: Rng): Room {
  let next = botStep(room, rng);
  next = recordHistory(prev, next);
  next = drawGuard(next);
  return schedule(prev, next, now);
}
