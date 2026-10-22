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
import type { Participant, Player, Room, Spectator } from './room';
import { finishPairing, settleTournamentHost, syncPairing } from './tournament';

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

/**
 * True once no human can act in the room anymore (all gone past grace or forfeited). In a
 * tournament room the participants count instead of the seats (which only hold the running
 * pairing and are empty between matches): it is abandoned once no participant that has not
 * forfeited is connected or within its reconnect grace. Spectators never count.
 */
export function isAbandoned(room: Room, now: number): boolean {
  if (room.tournament) return !room.tournament.participants.some((p) => participantActive(room, p, now));
  return !humans(room).some((p) => {
    if (isForfeited(room, p.seat)) return false;
    if (p.connected) return true;
    const end = graceEnd(room, p);
    return end !== null && now < end;
  });
}

/**
 * A tournament participant that is out of the tournament: forfeited in the tournament state, or
 * inside the running match before `finishPairing` recorded it.
 */
export function participantOut(room: Room, participant: Participant): boolean {
  const t = room.tournament;
  if (!t) return false;
  if (t.state?.forfeited.includes(participant.id)) return true;
  const pairing = t.phase === 'match' ? t.state?.pairings.find((p) => p.id === t.currentPairingId) : undefined;
  if (pairing?.a === participant.id && isForfeited(room, 'a0')) return true;
  return pairing?.b === participant.id && isForfeited(room, 'b0');
}

/**
 * Grace end of a disconnected participant, or null while connected. `disconnectedAt` is the start
 * of the running grace period: the disconnect, or the call-up of the participant's pairing if that
 * came later (`projectPairing` moves it), so for a pairing member this equals its seat's
 * `graceEnd`. Only pairing members forfeit at this time; for everyone else it only decides the
 * host role and abandonment.
 */
export function participantGraceEnd(participant: Participant): number | null {
  if (participant.connected || participant.disconnectedAt === null) return null;
  return participant.disconnectedAt + RECONNECT_GRACE_MS;
}

/** A tournament participant that can still act: not out, connected or within grace. */
export function participantActive(room: Room, participant: Participant, now: number): boolean {
  if (participantOut(room, participant)) return false;
  const end = participantGraceEnd(participant);
  return end === null || now < end;
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

/**
 * Earliest of the phase timeout, every pending grace expiry (players and spectators) and the end
 * of a tournament's draw or intermission.
 */
function wakeUp(room: Room, phaseDeadline: number | null): number | null {
  const wakeUps = [
    ...humans(room).map((p) => graceEnd(room, p)),
    ...spectatorsOf(room).map(spectatorGraceEnd),
    phaseDeadline,
    room.tournament?.untilMs ?? null,
    tournamentPeopleWakeUp(room),
  ].filter((t): t is number => t !== null);
  return wakeUps.length > 0 ? Math.min(...wakeUps) : null;
}

/**
 * When a tournament room must look at its participants next (pairing members' forfeits come from
 * their seats' `graceEnd` above). Null for duel rooms.
 * - Some participant (not out) is connected: the host's grace end, if the host is away. At that
 *   moment the host role moves on (`settleTournamentHost`); after every settle the host is
 *   connected, within grace or out of options, so this is never in the past.
 * - Nobody (not out) is connected: the room is abandoned once the last grace runs out, so wake up
 *   then for the ticker to delete it; with nobody left at all that is now (0 = due at once). Either
 *   time is only reached by an abandoned room, which the ticker deletes, so it cannot go stale.
 * - In the lobby instead: the earliest grace end of a disconnected participant (it is dropped then).
 * Waiting and eliminated participants who merely drop out never need a wake-up of their own.
 */
function tournamentPeopleWakeUp(room: Room): number | null {
  const t = room.tournament;
  if (!t) return null;
  if (t.phase === 'lobby') {
    // Lobby ghosts are dropped at their grace end (`dropLobbyGhosts` in tick); that also covers the
    // host role and abandonment. An empty lobby is due at once (abandoned).
    if (t.participants.length === 0) return 0;
    const ends = t.participants.map(participantGraceEnd).filter((e): e is number => e !== null);
    return ends.length > 0 ? Math.min(...ends) : null;
  }
  const present = t.participants.filter((p) => !participantOut(room, p));
  if (present.some((p) => p.connected)) {
    const host = present.find((p) => p.id === t.hostId);
    return host ? participantGraceEnd(host) : null;
  }
  const ends = present.map(participantGraceEnd).filter((e): e is number => e !== null);
  return ends.length > 0 ? Math.max(...ends) : 0;
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
 * before): bot catches up, history, draw guard, tournament bookkeeping (a finished pairing match
 * is recorded, the host role moves away from a participant who is gone, the seats are re-derived
 * from the participants), deadlines. The tournament steps
 * leave rooms without `tournament` untouched.
 */
export function settle(prev: MatchState | null, room: Room, now: number, rng: Rng): Room {
  let next = botStep(room, rng);
  next = recordHistory(prev, next);
  next = drawGuard(next);
  next = finishPairing(next, now, rng);
  next = settleTournamentHost(next, now);
  next = syncPairing(next);
  return schedule(prev, next, now);
}
