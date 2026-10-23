import { describe, expect, it } from 'vitest';
import {
  DRAW_MS,
  INTERMISSION_MS,
  MAX_SPECTATORS,
  PICK_TIMEOUT_MS,
  ProtocolError,
  RECONNECT_GRACE_MS,
  REVEAL_MS,
  RuleError,
  TOURNAMENT_MAX_PLAYERS,
  nextPairing,
  podium,
} from '@rps/shared';
import type { RoomConfig, SeatId, TournamentFormat } from '@rps/shared';
import {
  applyNext,
  applyPick,
  createRoom,
  isAbandoned,
  joinRoom,
  markConnected,
  markDisconnected,
  moveSeat,
  rejoinRoom,
  rematch,
  startMatch,
  tick,
  whoOfSocket,
} from './engine';
import { spectatorsOf } from './room';
import type { Room, TournamentRoom } from './room';
import { MemoryRoomStore } from './store';
import { startTicker } from './ticker';
import { participantViewFor } from './view';
import {
  advanceTournament,
  createTournamentRoom,
  finishPairing,
  joinTournamentRoom,
  leaveParticipant,
  markParticipantConnected,
  markParticipantDisconnected,
  projectPairing,
  rejoinTournament,
  skipTournamentWait,
  startTournament,
  tournamentRematch,
  tournamentWhoOfSocket,
} from './tournament';

const T0 = 1_000_000;
const classic: RoomConfig = { mode: 'classic', bestOf: 3 };
/** Deterministic rng: always the same value. */
const fixed = (v: number) => () => v;
function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError || error instanceof RuleError) return error.code;
    throw error;
  }
  return undefined;
}

function tour(room: Room): TournamentRoom {
  if (!room.tournament) throw new Error('not a tournament room');
  return room.tournament;
}

/** A tournament lobby with `n` participants; participant i is bound to socket `s-i`. */
function lobby(n: number, format: TournamentFormat = 'knockout', config: RoomConfig = classic): Room {
  let room = createTournamentRoom(
    { config, format, nickname: 'P0', avatar: 'fox', socketId: 's-0', code: 'TOURN' },
    T0,
  );
  for (let i = 1; i < n; i++) room = joinTournamentRoom(room, `P${i}`, 'owl', T0, `s-${i}`).room;
  return room;
}

function hostOf(room: Room): string {
  return tour(room).hostId;
}

function started(n: number, format: TournamentFormat = 'knockout', rng = fixed(0.3)): Room {
  const room = lobby(n, format);
  return startTournament(room, hostOf(room), T0, rng);
}

function podiumOf(room: Room) {
  return podium(tour(room).state!);
}

/** Started and skipped past the draw: the first pairing runs (at T0). */
function running(format: TournamentFormat = 'knockout'): Room {
  const room = started(4, format);
  return skipTournamentWait(room, hostOf(room), T0, fixed(0.3));
}

function participantId(room: Room, seat: SeatId): string {
  const t = tour(room);
  const pairing = t.state?.pairings.find((p) => p.id === t.currentPairingId);
  const id = seat === 'a0' ? pairing?.a : pairing?.b;
  if (!id) throw new Error(`no participant on ${seat}`);
  return id;
}

/**
 * Plays the running pairing to the end through the real engine path (applyPick / applyNext):
 * `winner` wins every round 2:0.
 */
function playMatch(room: Room, now: number, winner: 'a0' | 'b0' = 'a0'): Room {
  let next = room;
  const loser: SeatId = winner === 'a0' ? 'b0' : 'a0';
  for (let round = 0; round < 3 && next.match?.phase !== 'finished' && tour(next).phase === 'match'; round++) {
    next = applyPick(next, winner, { gesture: 'rock' }, now);
    next = applyPick(next, loser, { gesture: 'scissors' }, now);
    if (next.match?.phase !== 'reveal') break;
    next = applyNext(next, 'a0', now);
    next = applyNext(next, 'b0', now);
  }
  return next;
}

describe('createTournamentRoom', () => {
  it('opens a lobby with the host as the only participant and no seated players', () => {
    const room = lobby(1);
    const t = tour(room);
    expect(t.phase).toBe('lobby');
    expect(t.format).toBe('knockout');
    expect(t.participants).toHaveLength(1);
    const [host] = t.participants;
    expect(host).toMatchObject({ nickname: 'P0', avatar: 'fox', connected: true, socketId: 's-0', disconnectedAt: null });
    expect(host?.id).toMatch(/^[0-9a-f]{8}$/);
    expect(host?.token).toMatch(/^[0-9a-f]{32}$/);
    expect(t.hostId).toBe(host?.id);
    expect(t.state).toBeNull();
    expect(t.untilMs).toBeNull();
    expect(t.currentPairingId).toBeNull();
    expect(room.players).toEqual({});
    expect(room.match).toBeNull();
    expect(room.hostSeat).toBe('a0');
    expect(room.botLevel).toBeNull();
    expect(room.deadline).toBeNull();
    expect(room.code).toBe('TOURN');
  });

  it.each([
    [{ mode: 'bluff', bestOf: 3 }],
    [{ mode: 'team2v2', bestOf: 3 }],
    [{ mode: 'classic', bestOf: 5 }],
    [{ mode: 'classic', bestOf: 1 }],
  ] as [RoomConfig][])('rejects %j with invalid_input', (config) => {
    expect(
      errorCode(() => createTournamentRoom({ config, format: 'knockout', nickname: 'A', avatar: 'fox' }, T0)),
    ).toBe('invalid_input');
  });

  it.each(['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15'] as const)('accepts mode %s', (mode) => {
    const room = createTournamentRoom({ config: { mode, bestOf: 3 }, format: 'roundrobin', nickname: 'A', avatar: 'fox' }, T0);
    expect(tour(room).format).toBe('roundrobin');
  });

  it('rejects an unknown format, avatar or nickname with invalid_input', () => {
    const base = { config: classic, nickname: 'A', avatar: 'fox' };
    expect(errorCode(() => createTournamentRoom({ ...base, format: 'swiss' as TournamentFormat }, T0))).toBe('invalid_input');
    expect(errorCode(() => createTournamentRoom({ ...base, format: 'knockout', avatar: 'nope' }, T0))).toBe('invalid_input');
    expect(errorCode(() => createTournamentRoom({ ...base, format: 'knockout', nickname: '  ' }, T0))).toBe('invalid_input');
  });
});

describe('joinTournamentRoom', () => {
  it('takes up to 8 participants; the 9th becomes a spectator', () => {
    let room = lobby(1);
    for (let i = 1; i < TOURNAMENT_MAX_PLAYERS; i++) {
      const joined = joinTournamentRoom(room, `P${i}`, 'owl', T0, `s-${i}`);
      expect(joined.who.role).toBe('participant');
      room = joined.room;
    }
    expect(tour(room).participants).toHaveLength(8);
    const ninth = joinTournamentRoom(room, 'P8', 'owl', T0, 's-8');
    expect(ninth.who.role).toBe('spectator');
    expect(tour(ninth.room).participants).toHaveLength(8);
    expect(spectatorsOf(ninth.room)).toHaveLength(1);
    expect(spectatorsOf(ninth.room)[0]).toMatchObject({ nickname: 'P8', socketId: 's-8', connected: true });
    // ids are tournament-local and unique among participants and spectators, never the token
    const people = [...tour(ninth.room).participants, ...spectatorsOf(ninth.room)];
    expect(new Set(people.map((p) => p.id)).size).toBe(9);
    for (const p of people) {
      expect(p.id).toMatch(/^[0-9a-f]{8}$/);
      expect(p.id).not.toBe(p.token);
    }
    // seats stay empty in the lobby
    expect(ninth.room.players).toEqual({});
    if (ninth.who.role === 'spectator') expect(ninth.who.id).toBe(spectatorsOf(ninth.room)[0]?.id);
  });

  it('makes everyone who joins after the start a spectator', () => {
    const room = started(4);
    const joined = joinTournamentRoom(room, 'Late', 'owl', T0 + 1, 's-late');
    expect(joined.who.role).toBe('spectator');
    expect(tour(joined.room).participants).toHaveLength(4);
    // a spectator join does not move the draw timer
    expect(tour(joined.room).untilMs).toBe(T0 + DRAW_MS);
  });

  it('rejects an invalid nickname or avatar', () => {
    expect(errorCode(() => joinTournamentRoom(lobby(1), '', 'owl', T0))).toBe('invalid_input');
    expect(errorCode(() => joinTournamentRoom(lobby(1), 'X', 'nope', T0))).toBe('invalid_input');
  });

  it('refuses rooms without a tournament', () => {
    const duel = createRoom({ config: classic, nickname: 'A', avatar: 'fox' }, T0);
    expect(errorCode(() => joinTournamentRoom(duel, 'B', 'owl', T0))).toBe('invalid_input');
  });
});

describe('startTournament', () => {
  it('needs at least 4 participants', () => {
    const room = lobby(3);
    expect(errorCode(() => startTournament(room, hostOf(room), T0, fixed(0.3)))).toBe('not_enough_players');
  });

  it('is host only', () => {
    const room = lobby(4);
    const other = tour(room).participants[1]!.id;
    expect(errorCode(() => startTournament(room, other, T0, fixed(0.3)))).toBe('not_host');
    expect(errorCode(() => startTournament(room, 'unknown', T0, fixed(0.3)))).toBe('not_host');
  });

  it('draws and enters the draw phase with a wake-up at its end', () => {
    const room = started(4);
    const t = tour(room);
    expect(t.phase).toBe('draw');
    expect(t.untilMs).toBe(T0 + DRAW_MS);
    expect(room.deadline).toBe(T0 + DRAW_MS);
    expect(room.phaseDeadline).toBeNull();
    expect(t.state?.format).toBe('knockout');
    expect(t.state?.participants).toEqual(t.participants.map((p) => p.id));
    expect(room.players).toEqual({});
    expect(room.match).toBeNull();
  });

  it('only starts from the lobby', () => {
    const room = started(4);
    expect(errorCode(() => startTournament(room, hostOf(room), T0, fixed(0.3)))).toBe('wrong_phase');
  });
});

describe('advanceTournament and projectPairing', () => {
  it('does nothing before the draw is over', () => {
    const room = started(4);
    expect(advanceTournament(room, T0 + DRAW_MS - 1, fixed(0.3))).toBe(room);
    expect(tick(room, T0 + DRAW_MS - 1)).toBe(room);
  });

  it('projects the first pairing onto a0/b0 once the draw is over (tick)', () => {
    const room = started(4);
    const now = T0 + DRAW_MS;
    const next = tick(room, now, fixed(0.3));
    const t = tour(next);
    const first = nextPairing(tour(room).state!)!;
    expect(t.phase).toBe('match');
    expect(t.currentPairingId).toBe(first.id);
    expect(t.untilMs).toBeNull();
    const a = t.participants.find((p) => p.id === first.a)!;
    const b = t.participants.find((p) => p.id === first.b)!;
    expect(next.players.a0).toEqual({
      seat: 'a0',
      nickname: a.nickname,
      avatar: a.avatar,
      token: a.token,
      socketId: a.socketId,
      connected: true,
      disconnectedAt: null,
      isBot: false,
    });
    expect(next.players.b0).toMatchObject({ seat: 'b0', token: b.token, socketId: b.socketId, isBot: false });
    expect(Object.keys(next.players).sort()).toEqual(['a0', 'b0']);
    expect(next.match).toMatchObject({ phase: 'pick', round: 1, config: { mode: 'classic', bestOf: 3 } });
    expect(next.botLevel).toBeNull();
    expect(next.phaseDeadline).toBe(now + PICK_TIMEOUT_MS);
    expect(next.deadline).toBe(now + PICK_TIMEOUT_MS);
    // advanceTournament directly gives the same result
    expect(advanceTournament(room, now, fixed(0.3))).toEqual(next);
  });

  it('uses best of 1 for a tie-break pairing', () => {
    const room = started(4, 'roundrobin');
    const pairing = { ...nextPairing(tour(room).state!)!, bestOf: 1 as const, tiebreak: true };
    const next = projectPairing(room, pairing, T0, fixed(0.3));
    expect(next.match?.config).toEqual({ mode: 'classic', bestOf: 1 });
    expect(next.config.bestOf).toBe(3);
  });

  it('never projects the bye participant of a 5-player knockout in round 1', () => {
    let room = started(5);
    const state = tour(room).state!;
    const bye = state.pairings.filter((p) => p.round === 1 && (p.a === null || p.b === null));
    expect(bye.length).toBeGreaterThan(0);
    const byeIds = bye.map((p) => p.a ?? p.b);
    let now = T0 + DRAW_MS;
    room = skipTournamentWait(room, hostOf(room), now, fixed(0.3));
    const projected: string[][] = [];
    while (tour(room).phase !== 'finished') {
      const pairing = tour(room).state!.pairings.find((p) => p.id === tour(room).currentPairingId)!;
      if (pairing.round === 1) projected.push([participantId(room, 'a0'), participantId(room, 'b0')]);
      room = playMatch(room, now);
      now += 1000;
      if (tour(room).phase === 'intermission') room = skipTournamentWait(room, hostOf(room), now, fixed(0.3));
    }
    expect(projected.length).toBe(1);
    for (const ids of projected) for (const id of byeIds) expect(ids).not.toContain(id);
  });
});

describe('a full knockout tournament through the engine', () => {
  it('plays match, intermission, next match and ends with a podium', () => {
    let room = started(4);
    let now = T0 + DRAW_MS;
    room = tick(room, now, fixed(0.3));
    const first = tour(room).currentPairingId;
    const winner1 = participantId(room, 'a0');

    // match 1, picks through the real applyPick path
    now += 1_000;
    room = playMatch(room, now, 'a0');
    let t = tour(room);
    expect(t.phase).toBe('intermission');
    expect(t.untilMs).toBe(now + INTERMISSION_MS);
    expect(room.deadline).toBe(now + INTERMISSION_MS);
    expect(room.phaseDeadline).toBeNull();
    expect(room.players).toEqual({});
    expect(room.match).toMatchObject({ phase: 'finished', winner: 'a', score: { a: 2, b: 0 } });
    const result1 = t.state!.pairings.find((p) => p.id === first)!.result;
    expect(result1).toEqual({ winner: winner1, score: { a: 2, b: 0 }, decidedBy: 'match' });

    // the intermission runs out → pairing 2 (tick, no skip)
    expect(tick(room, now + INTERMISSION_MS - 1, fixed(0.3))).toBe(room);
    now += INTERMISSION_MS;
    room = tick(room, now, fixed(0.3));
    t = tour(room);
    expect(t.phase).toBe('match');
    expect(t.currentPairingId).not.toBe(first);
    expect(room.match).toMatchObject({ phase: 'pick', round: 1, score: { a: 0, b: 0 } });
    expect(room.phaseDeadline).toBe(now + PICK_TIMEOUT_MS);

    // match 2 (b0 wins), then the host skips the intermission
    now += 1_000;
    room = playMatch(room, now, 'b0');
    expect(tour(room).phase).toBe('intermission');
    room = skipTournamentWait(room, hostOf(room), now, fixed(0.3));
    t = tour(room);
    expect(t.phase).toBe('match');
    expect(room.phaseDeadline).toBe(now + PICK_TIMEOUT_MS);
    const finalists = [participantId(room, 'a0'), participantId(room, 'b0')];
    const champion = participantId(room, 'a0');

    // the final
    now += 1_000;
    room = playMatch(room, now, 'a0');
    t = tour(room);
    expect(t.phase).toBe('finished');
    expect(t.untilMs).toBeNull();
    expect(room.deadline).toBeNull();
    const podium = podiumOf(room);
    expect(podium[0]).toEqual({ rank: 1, ids: [champion] });
    expect(podium[1]).toEqual({ rank: 2, ids: finalists.filter((id) => id !== champion) });
    expect(podium[2]?.rank).toBe(3);
    expect(podium[2]?.ids).toHaveLength(2);
    // nothing is due anymore
    expect(tick(room, now + 60_000)).toBe(room);
  });

  it('plays a 4-player round-robin to the end', () => {
    let room = started(4, 'roundrobin');
    let now = T0 + DRAW_MS;
    room = skipTournamentWait(room, hostOf(room), now, fixed(0.3));
    let matches = 0;
    while (tour(room).phase !== 'finished' && matches < 20) {
      room = playMatch(room, now, 'a0');
      matches++;
      now += 1_000;
      if (tour(room).phase === 'intermission') room = skipTournamentWait(room, hostOf(room), now, fixed(0.3));
    }
    expect(tour(room).phase).toBe('finished');
    expect(matches).toBeGreaterThanOrEqual(6);
    expect(podiumOf(room)[0]?.ids).toHaveLength(1);
  });
});

describe('skipTournamentWait', () => {
  it('ends the draw at once (host only)', () => {
    const room = started(4);
    const other = tour(room).participants[1]!.id;
    expect(errorCode(() => skipTournamentWait(room, other, T0 + 1, fixed(0.3)))).toBe('not_host');
    const next = skipTournamentWait(room, hostOf(room), T0 + 1, fixed(0.3));
    expect(tour(next).phase).toBe('match');
    expect(next.phaseDeadline).toBe(T0 + 1 + PICK_TIMEOUT_MS);
  });

  it('is wrong_phase in the lobby, during a match and after the end', () => {
    const lobbyRoom = lobby(4);
    expect(errorCode(() => skipTournamentWait(lobbyRoom, hostOf(lobbyRoom), T0, fixed(0.3)))).toBe('wrong_phase');
    const match = running();
    expect(errorCode(() => skipTournamentWait(match, hostOf(match), T0, fixed(0.3)))).toBe('wrong_phase');
  });
});

describe('a match without a winner', () => {
  /** Lets the running pairing time out without any pick until the idle abort ends it. */
  function idleOut(room: Room, rng: () => number): { room: Room; now: number } {
    let next = room;
    let now = next.phaseDeadline!;
    for (let i = 0; i < 10 && tour(next).phase === 'match'; i++) {
      next = tick(next, now, rng);
      now = next.deadline ?? now;
    }
    return { room: next, now };
  }

  it('is decided by a coin flip with the injected rng in the knockout bracket', () => {
    for (const [v, seat] of [
      [0.2, 'a0'],
      [0.7, 'b0'],
    ] as const) {
      let room = started(4);
      room = skipTournamentWait(room, hostOf(room), T0, fixed(0.3));
      const pairingId = tour(room).currentPairingId!;
      const expected = participantId(room, seat);
      const { room: done } = idleOut(room, fixed(v));
      expect(done.match).toMatchObject({ phase: 'finished', winner: null });
      expect(tour(done).phase).toBe('intermission');
      expect(tour(done).state!.pairings.find((p) => p.id === pairingId)!.result).toEqual({
        winner: expected,
        score: { a: 0, b: 0 },
        decidedBy: 'coin',
      });
    }
  });

  it('is lost for both in round-robin', () => {
    let room = started(4, 'roundrobin');
    room = skipTournamentWait(room, hostOf(room), T0, fixed(0.3));
    const pairingId = tour(room).currentPairingId!;
    const { room: done } = idleOut(room, fixed(0.2));
    expect(tour(done).state!.pairings.find((p) => p.id === pairingId)!.result).toEqual({
      winner: null,
      score: { a: 0, b: 0 },
      decidedBy: 'none',
    });
    expect(tour(done).phase).toBe('intermission');
  });

  it('a forfeit inside the match is recorded as a forfeit', () => {
    let room = started(4);
    room = skipTournamentWait(room, hostOf(room), T0, fixed(0.3));
    const pairingId = tour(room).currentPairingId!;
    const a = participantId(room, 'a0');
    const b = participantId(room, 'b0');
    // b0 drops out and its grace runs out during the match
    room = markDisconnected(room, 'b0', T0 + 1);
    expect(tour(room).participants.find((p) => p.id === b)).toMatchObject({ connected: false, disconnectedAt: T0 + 1, socketId: null });
    expect(room.players.b0).toMatchObject({ connected: false, disconnectedAt: T0 + 1 });
    room = tick(room, T0 + 1 + RECONNECT_GRACE_MS, fixed(0.3));
    expect(tour(room).state!.pairings.find((p) => p.id === pairingId)!.result).toMatchObject({
      winner: a,
      decidedBy: 'forfeit',
    });
    expect(tour(room).state!.forfeited).toEqual([b]);
    expect(tour(room).phase).toBe('intermission');
  });
});

describe('the match inside a tournament behaves like a duel', () => {
  function match(): Room {
    const room = started(4);
    return skipTournamentWait(room, hostOf(room), T0, fixed(0.3));
  }

  it('pairing members are found by their socket as players', () => {
    const room = match();
    const a = tour(room).participants.find((p) => p.id === participantId(room, 'a0'))!;
    expect(whoOfSocket(room, a.socketId!)).toEqual({ role: 'player', seat: 'a0' });
  });

  it('participants outside the pairing have no seat (the gateway answers bad_token)', () => {
    const room = match();
    const members = [participantId(room, 'a0'), participantId(room, 'b0')];
    const waiting = tour(room).participants.filter((p) => !members.includes(p.id));
    expect(waiting).toHaveLength(2);
    for (const p of waiting) expect(whoOfSocket(room, p.socketId!)).toBeNull();
    // seats beyond a0/b0 do not exist in a tournament match
    expect(errorCode(() => applyPick(room, 'a1', { gesture: 'rock' }, T0))).toBe('unknown_seat');
  });

  it('picks, double picks and the reveal vote work exactly as in a duel', () => {
    let room = match();
    room = applyPick(room, 'a0', { gesture: 'rock' }, T0 + 1);
    expect(room.match?.phase).toBe('pick');
    expect(errorCode(() => applyPick(room, 'a0', { gesture: 'paper' }, T0 + 1))).toBe('already_picked');
    expect(errorCode(() => applyPick(room, 'b0', { gesture: 'banana' }, T0 + 1))).toBe('invalid_gesture');
    room = applyPick(room, 'b0', { gesture: 'paper' }, T0 + 2);
    expect(room.match).toMatchObject({ phase: 'reveal', score: { a: 0, b: 1 } });
    expect(room.phaseDeadline).toBe(T0 + 2 + REVEAL_MS);
    // one vote waits for the other pairing member only (waiting participants never vote)
    const one = applyNext(room, 'a0', T0 + 3);
    expect(one.match?.phase).toBe('reveal');
    expect(one.nextReady).toEqual(['a0']);
    const both = applyNext(one, 'b0', T0 + 3);
    expect(both.match).toMatchObject({ phase: 'pick', round: 2 });
    expect(both.phaseDeadline).toBe(T0 + 3 + PICK_TIMEOUT_MS);
  });

  it('a spectator joining during the match leaves the timers alone', () => {
    const room = match();
    const joined = joinTournamentRoom(room, 'Late', 'owl', T0 + 5, 's-late').room;
    expect(joined.phaseDeadline).toBe(room.phaseDeadline);
    expect(joined.deadline).toBe(room.deadline);
    expect(joined.match).toEqual(room.match);
  });

  it('a pairing member reconnecting updates the participant too', () => {
    let room = match();
    const b = participantId(room, 'b0');
    room = markDisconnected(room, 'b0', T0 + 1);
    room = markConnected(room, 'b0', T0 + 2, 's-new');
    expect(tour(room).participants.find((p) => p.id === b)).toMatchObject({ connected: true, disconnectedAt: null, socketId: 's-new' });
    expect(room.players.b0).toMatchObject({ connected: true, socketId: 's-new' });
  });
});

describe('Review Focus 3: ticks are idempotent', () => {
  it('a second tick with the same now changes nothing', () => {
    const room = started(4);
    for (const now of [T0 + DRAW_MS, T0 + DRAW_MS + 10]) {
      const once = tick(room, now, fixed(0.3));
      expect(tour(once).phase).toBe('match');
      expect(tick(once, now, fixed(0.3))).toBe(once);
    }
    // at the end of an intermission as well
    let mid = skipTournamentWait(room, hostOf(room), T0, fixed(0.3));
    mid = playMatch(mid, T0 + 1);
    const due = tour(mid).untilMs!;
    const once = tick(mid, due, fixed(0.3));
    expect(tour(once).phase).toBe('match');
    expect(tick(once, due, fixed(0.3))).toBe(once);
  });

  it('two replicas racing on the same due room start the next match once', async () => {
    const clock = { now: T0 };
    const store = new MemoryRoomStore(() => clock.now);
    await store.create(started(4));
    const changes: Room[] = [];
    const replicas = [0, 1].map(() =>
      startTicker(store, (r) => changes.push(r), 60_000, () => clock.now, { rng: fixed(0.3) }),
    );
    clock.now = T0 + DRAW_MS;
    await Promise.all(replicas.map((r) => r.runOnce()));
    expect(changes).toHaveLength(1);
    const stored = (await store.get('TOURN'))!;
    expect(stored.version).toBe(1);
    expect(tour(stored).phase).toBe('match');
    expect(stored.match?.round).toBe(1);
    await Promise.all(replicas.map((r) => r.runOnce()));
    expect(changes).toHaveLength(1);
    expect((await store.get('TOURN'))!.version).toBe(1);
    await Promise.all(replicas.map((r) => r.stop()));
  });
});

describe('finishPairing', () => {
  it('leaves a room alone whose match is still running', () => {
    const room = running();
    expect(finishPairing(room, T0, fixed(0.3))).toBe(room);
  });
});

describe('isAbandoned in tournament rooms', () => {
  function withParticipants(room: Room, fn: (p: TournamentRoom['participants'][number]) => TournamentRoom['participants'][number]): Room {
    const t = tour(room);
    return { ...room, tournament: { ...t, participants: t.participants.map(fn) } };
  }

  it('counts participants, not seats (players may be empty between matches)', () => {
    const room = started(4);
    expect(room.players).toEqual({});
    expect(isAbandoned(room, T0)).toBe(false);
  });

  it('is abandoned once no participant is connected or within grace, whatever the spectators do', () => {
    let room = joinTournamentRoom(started(4), 'Watcher', 'owl', T0, 's-w').room;
    room = withParticipants(room, (p) => ({ ...p, connected: false, socketId: null, disconnectedAt: T0 }));
    expect(isAbandoned(room, T0 + RECONNECT_GRACE_MS - 1)).toBe(false);
    expect(isAbandoned(room, T0 + RECONNECT_GRACE_MS)).toBe(true);
  });

  it('does not count forfeited participants', () => {
    let room = started(4);
    const ids = tour(room).participants.map((p) => p.id);
    const t = tour(room);
    room = { ...room, tournament: { ...t, state: { ...t.state!, forfeited: ids.slice(1) } } };
    expect(isAbandoned(room, T0)).toBe(false);
    room = withParticipants(room, (p) => (p.id === ids[0] ? { ...p, connected: false, disconnectedAt: T0 - RECONNECT_GRACE_MS } : p));
    expect(isAbandoned(room, T0)).toBe(true);
  });
});

describe('duel operations refuse tournament rooms', () => {
  it('joinRoom, moveSeat, startMatch and rematch', () => {
    const room = lobby(4);
    expect(errorCode(() => joinRoom(room, 'X', 'owl', T0))).toBe('invalid_input');
    expect(errorCode(() => moveSeat(room, 'a0', 'a0', 'b0'))).toBe('invalid_input');
    expect(errorCode(() => startMatch(room, 'a0', T0))).toBe('wrong_phase');
    const done = playMatch(running(), T0);
    expect(errorCode(() => rematch(done, 'a0', T0))).toBe('wrong_phase');
  });
});

// ---------------------------------------------------------------------------------------------
// Stage 2 Task 3b: absence, forfeits, host change, rejoin and rematch
// ---------------------------------------------------------------------------------------------

function person(room: Room, id: string) {
  const found = tour(room).participants.find((p) => p.id === id);
  if (!found) throw new Error(`no participant ${id}`);
  return found;
}

function pairingById(room: Room, id: string) {
  const found = tour(room).state!.pairings.find((p) => p.id === id);
  if (!found) throw new Error(`no pairing ${id}`);
  return found;
}

function currentPairing(room: Room) {
  return pairingById(room, tour(room).currentPairingId!);
}

/**
 * Ticks at every due deadline up to `until`, in order, like the ticker. Fails on a deadline that
 * a tick leaves at or before its own time (a stale wake-up would make the ticker loop).
 */
function tickUntil(room: Room, until: number, rng = fixed(0.3)): Room {
  let next = room;
  for (let i = 0; i < 100 && next.deadline !== null && next.deadline <= until; i++) {
    const at = next.deadline;
    next = tick(next, at, rng);
    if (next.deadline !== null && next.deadline <= at && !isAbandoned(next, at)) {
      throw new Error(`stale deadline ${next.deadline} after a tick at ${at}`);
    }
  }
  return next;
}

/** The round-1 pairing of a 4-player knockout that is not running now, and a non-host member of it. */
function otherFirstRoundPairing(room: Room) {
  const running = tour(room).currentPairingId;
  const pairing = tour(room).state!.pairings.find((p) => p.round === 1 && p.id !== running && p.a && p.b)!;
  const absent = pairing.a !== hostOf(room) ? pairing.a! : pairing.b!;
  const opponent = absent === pairing.a ? pairing.b! : pairing.a!;
  return { pairing, absent, opponent, seat: (absent === pairing.a ? 'a0' : 'b0') as SeatId };
}

/** Plays (and skips) until the tournament is finished; `winner` picks the winning seat per pairing. */
function playToEnd(room: Room, now: number, winner: (room: Room) => 'a0' | 'b0' = () => 'a0') {
  let next = room;
  let at = now;
  const projected: string[][] = [];
  for (let i = 0; i < 40 && tour(next).phase !== 'finished'; i++) {
    if (tour(next).phase === 'match') {
      projected.push([participantId(next, 'a0'), participantId(next, 'b0')]);
      next = playMatch(next, at, winner(next));
    }
    at += 1_000;
    if (tour(next).phase === 'intermission' || tour(next).phase === 'draw') {
      next = skipTournamentWait(next, hostOf(next), at, fixed(0.3));
    }
  }
  return { room: next, now: at, projected };
}

describe('Review Focus 4: absence and the grace period from the call-up', () => {
  it('(a) drops out in the intermission: grace only from the call-up, forfeit after 30 s, opponent advances, next intermission follows', () => {
    let room = running();
    const { pairing, absent, opponent, seat } = otherFirstRoundPairing(room);
    const now = T0 + 1_000;
    room = playMatch(room, now);
    expect(tour(room).phase).toBe('intermission');
    const before = room;

    // in the intermission: just flips the connection, no timer of its own, the intermission does not wait
    room = markParticipantDisconnected(room, absent, now + 1_000);
    expect(person(room, absent)).toMatchObject({ connected: false, socketId: null, disconnectedAt: now + 1_000 });
    expect(room.deadline).toBe(before.deadline);
    expect(tour(room).untilMs).toBe(tour(before).untilMs);
    expect(room.match).toBe(before.match);

    // the call-up comes long after its own disconnect (stale disconnectedAt): grace starts at the call-up
    const callUp = now + 1_000 + RECONNECT_GRACE_MS + 5_000;
    room = tick(room, callUp, fixed(0.3));
    expect(tour(room).currentPairingId).toBe(pairing.id);
    expect(room.players[seat]).toMatchObject({ connected: false, disconnectedAt: callUp });
    expect(person(room, absent).disconnectedAt).toBe(callUp);
    expect(room.match).toMatchObject({ phase: 'pick', forfeited: [] });
    expect(room.deadline).toBe(callUp + PICK_TIMEOUT_MS);
    expect(tick(room, callUp, fixed(0.3))).toBe(room);

    // phase timeouts run, but no forfeit before the grace ends
    room = tickUntil(room, callUp + RECONNECT_GRACE_MS - 1);
    expect(tour(room).phase).toBe('match');
    expect(room.match!.forfeited).toEqual([]);
    expect(room.deadline).toBe(callUp + RECONNECT_GRACE_MS);

    // grace over: forfeit, the opponent wins the pairing, the next intermission follows
    const end = callUp + RECONNECT_GRACE_MS;
    room = tick(room, end, fixed(0.3));
    const t = tour(room);
    expect(pairingById(room, pairing.id).result).toMatchObject({ winner: opponent, decidedBy: 'forfeit' });
    expect(t.state!.forfeited).toEqual([absent]);
    expect(t.phase).toBe('intermission');
    expect(t.untilMs).toBe(end + INTERMISSION_MS);
    expect(room.deadline).toBe(end + INTERMISSION_MS);
    expect(room.players).toEqual({});
    expect(tick(room, end, fixed(0.3))).toBe(room);
    expect(isAbandoned(room, end)).toBe(false);

    // the tournament goes on: the opponent plays the final
    room = tick(room, end + INTERMISSION_MS, fixed(0.3));
    expect(tour(room).phase).toBe('match');
    expect([participantId(room, 'a0'), participantId(room, 'b0')]).toContain(opponent);
    expect([participantId(room, 'a0'), participantId(room, 'b0')]).not.toContain(absent);
  });

  it('(b) drops out 20 s before the call-up and comes back in time: no forfeit, plays normally', () => {
    let room = running();
    const { pairing, absent, seat } = otherFirstRoundPairing(room);
    const phaseDeadline = room.phaseDeadline;
    const deadline = room.deadline;
    // a waiting participant drops out during match 1: no timers change
    room = markParticipantDisconnected(room, absent, T0 + 1);
    expect(room.phaseDeadline).toBe(phaseDeadline);
    expect(room.deadline).toBe(deadline);
    room = playMatch(room, T0 + 15_000);
    const callUp = tour(room).untilMs!;
    expect(callUp - (T0 + 1)).toBeGreaterThanOrEqual(20_000);
    room = tick(room, callUp, fixed(0.3));
    expect(tour(room).currentPairingId).toBe(pairing.id);

    // back 35 s after the disconnect, 15 s after the call-up: in time
    const token = person(room, absent).token;
    const back = rejoinTournament(room, token, callUp + 15_000, 's-back');
    expect(back.who).toEqual({ role: 'player', seat });
    expect(back.previousSocketId).toBeNull();
    room = back.room;
    expect(room.players[seat]).toMatchObject({ connected: true, disconnectedAt: null, socketId: 's-back' });
    expect(room.deadline).toBe(callUp + PICK_TIMEOUT_MS);

    room = playMatch(room, callUp + 16_000, seat as 'a0' | 'b0');
    expect(pairingById(room, pairing.id).result).toMatchObject({ winner: absent, decidedBy: 'match' });
    expect(tour(room).state!.forfeited).toEqual([]);
  });

  it('(c) leaving the own running match forfeits at once and counts as a win for the opponent, recorded once', () => {
    let room = running();
    const pairingId = tour(room).currentPairingId!;
    const a = participantId(room, 'a0');
    const b = participantId(room, 'b0');
    room = applyPick(room, 'a0', { gesture: 'rock' }, T0 + 1);
    room = leaveParticipant(room, b, T0 + 2, fixed(0.3));
    expect(room.match).toMatchObject({ phase: 'finished', winner: 'a', forfeited: ['b0'] });
    expect(pairingById(room, pairingId).result).toMatchObject({ winner: a, decidedBy: 'forfeit' });
    expect(tour(room).state!.forfeited).toEqual([b]);
    expect(tour(room).phase).toBe('intermission');
    expect(tour(room).untilMs).toBe(T0 + 2 + INTERMISSION_MS);
    expect(person(room, b)).toMatchObject({ connected: false, socketId: null });
    // recorded exactly once: nothing records again (recordResult would throw on a decided pairing)
    expect(tick(room, T0 + 2, fixed(0.3))).toBe(room);
    const again = leaveParticipant(room, b, T0 + 3, fixed(0.3));
    expect(tour(again).state).toEqual(tour(room).state);
    expect(tour(again).phase).toBe('intermission');
  });

  it('(c) both pairing members past their grace: forfeit both, recorded once, the tournament goes on', () => {
    let room = running();
    const pairingId = tour(room).currentPairingId!;
    const a = participantId(room, 'a0');
    const b = participantId(room, 'b0');
    room = markParticipantDisconnected(room, a, T0 + 1);
    room = markParticipantDisconnected(room, b, T0 + 1);
    expect(room.deadline).toBe(T0 + PICK_TIMEOUT_MS);
    room = tickUntil(room, T0 + 1 + RECONNECT_GRACE_MS);
    expect(room.match).toMatchObject({ phase: 'finished', winner: null });
    expect(pairingById(room, pairingId).result).toMatchObject({ winner: null, decidedBy: 'forfeit' });
    expect([...tour(room).state!.forfeited].sort()).toEqual([a, b].sort());
    expect(tour(room).phase).toBe('intermission');
    expect(isAbandoned(room, T0 + 1 + RECONNECT_GRACE_MS)).toBe(false);
    // the host role never stays with a forfeited participant
    expect([a, b]).not.toContain(hostOf(room));
    const { room: done } = playToEnd(room, T0 + 40_000);
    expect(tour(done).phase).toBe('finished');
  });

  it('a pairing member who reconnects within the grace simply plays on', () => {
    let room = running();
    const b = participantId(room, 'b0');
    room = markParticipantDisconnected(room, b, T0 + 1);
    expect(room.players.b0).toMatchObject({ connected: false, disconnectedAt: T0 + 1 });
    room = tickUntil(room, T0 + 1 + RECONNECT_GRACE_MS - 1);
    room = markParticipantConnected(room, b, T0 + RECONNECT_GRACE_MS, 's-b');
    expect(room.players.b0).toMatchObject({ connected: true, disconnectedAt: null, socketId: 's-b' });
    room = tickUntil(room, T0 + 2 * RECONNECT_GRACE_MS);
    expect(room.match?.forfeited ?? []).toEqual([]);
  });
});

describe('(d) round-robin: later pairings of a forfeiter are lost automatically', () => {
  it('a waiting participant leaving loses all its pairings and is never projected', () => {
    let room = running('roundrobin');
    const current = currentPairing(room);
    const quitter = tour(room).participants.find(
      (p) => p.id !== current.a && p.id !== current.b && p.id !== hostOf(room),
    )!.id;
    const { match, phaseDeadline } = room;
    room = leaveParticipant(room, quitter, T0 + 1, fixed(0.3));
    const state = tour(room).state!;
    expect(state.forfeited).toEqual([quitter]);
    const theirs = state.pairings.filter((p) => p.a === quitter || p.b === quitter);
    expect(theirs).toHaveLength(3);
    for (const p of theirs) {
      expect(p.result).toMatchObject({ winner: p.a === quitter ? p.b : p.a, decidedBy: 'forfeit' });
    }
    expect(person(room, quitter)).toMatchObject({ connected: false, socketId: null });
    // the running match is not touched
    expect(tour(room).phase).toBe('match');
    expect(room.match).toBe(match);
    expect(room.phaseDeadline).toBe(phaseDeadline);

    const { room: done, projected } = playToEnd(room, T0 + 2);
    expect(tour(done).phase).toBe('finished');
    for (const ids of projected) expect(ids).not.toContain(quitter);
  });
});

describe('(e) host change', () => {
  it('the host leaving hands the role to the next connected participant in join order, never a spectator', () => {
    let room = running();
    room = joinTournamentRoom(room, 'Watcher', 'owl', T0, 's-w').room;
    const ps = tour(room).participants;
    room = markParticipantDisconnected(room, ps[1]!.id, T0 + 1);
    room = leaveParticipant(room, ps[0]!.id, T0 + 2, fixed(0.3));
    expect(hostOf(room)).toBe(ps[2]!.id);
    expect(tour(room).state!.forfeited).toContain(ps[0]!.id);
  });

  it('a host gone past the grace in the lobby is dropped and replaced at the grace end (tick, idempotent)', () => {
    let room = lobby(4);
    const ps = tour(room).participants;
    room = markParticipantDisconnected(room, ps[0]!.id, T0 + 1);
    expect(hostOf(room)).toBe(ps[0]!.id);
    expect(room.deadline).toBe(T0 + 1 + RECONNECT_GRACE_MS);
    expect(tick(room, T0 + RECONNECT_GRACE_MS)).toBe(room);
    const next = tick(room, T0 + 1 + RECONNECT_GRACE_MS);
    expect(hostOf(next)).toBe(ps[1]!.id);
    expect(tour(next).participants.map((p) => p.id)).toEqual(ps.slice(1).map((p) => p.id));
    expect(next.deadline).toBeNull();
    expect(tick(next, T0 + 1 + RECONNECT_GRACE_MS)).toBe(next);
    // the old host's token is gone with it; joining again makes an ordinary participant
    expect(errorCode(() => rejoinTournament(next, ps[0]!.token, T0 + 2 * RECONNECT_GRACE_MS, 's-0b'))).toBe('bad_token');
    const again = joinTournamentRoom(next, 'P0', 'fox', T0 + 2 * RECONNECT_GRACE_MS, 's-0b');
    expect(again.who.role).toBe('participant');
    expect(hostOf(again.room)).toBe(ps[1]!.id);
  });

  it('a host back within the grace stays host', () => {
    let room = lobby(4);
    const host = hostOf(room);
    room = markParticipantDisconnected(room, host, T0 + 1);
    room = markParticipantConnected(room, host, T0 + RECONNECT_GRACE_MS, 's-0b');
    expect(room.deadline).toBeNull();
    expect(hostOf(tick(room, T0 + 2 * RECONNECT_GRACE_MS))).toBe(host);
  });

  it('a host who forfeits by grace in the own match is replaced by the next connected participant', () => {
    let room = running();
    let now = T0 + 1_000;
    const host = hostOf(room);
    const inPairing = () => [currentPairing(room).a, currentPairing(room).b].includes(host);
    if (!inPairing()) {
      room = playMatch(room, now);
      room = skipTournamentWait(room, host, now, fixed(0.3));
    }
    expect(inPairing()).toBe(true);
    now += 1_000;
    room = markParticipantDisconnected(room, host, now);
    room = tickUntil(room, now + RECONNECT_GRACE_MS);
    expect(tour(room).state!.forfeited).toContain(host);
    const heir = tour(room).participants.find((p) => p.id !== host && p.connected)!;
    expect(hostOf(room)).toBe(heir.id);
    expect(tour(room).participants.indexOf(heir)).toBe(1);
  });

  it('review M1: a host who forfeited and comes back after a forced end is not shown as host; the next participant back is', () => {
    let room = running();
    let now = T0 + 1_000;
    const host = hostOf(room);
    const inPairing = () => [currentPairing(room).a, currentPairing(room).b].includes(host);
    if (!inPairing()) {
      room = playMatch(room, now);
      room = skipTournamentWait(room, host, now, fixed(0.3));
    }
    expect(inPairing()).toBe(true);
    now += 1_000;
    room = markParticipantDisconnected(room, host, now);
    const others = tour(room).participants.filter((p) => p.id !== host);
    for (const p of others) room = markParticipantDisconnected(room, p.id, now + 20_000);
    room = tickUntil(room, now + RECONNECT_GRACE_MS);
    // the host forfeited and nobody connected could take over: the tournament ended, the role stayed
    expect(tour(room).state!.forfeited).toContain(host);
    expect(tour(room).phase).toBe('finished');
    expect(hostOf(room)).toBe(host);

    // the host is back as a forfeited watcher: no host rights in its view, and the gateway refuses
    // "Play again" for a spectator (not_player), so the button must not be offered
    const back = rejoinTournament(room, person(room, host).token, now + RECONNECT_GRACE_MS + 1_000, 's-host');
    expect(back.who).toEqual({ role: 'spectator', id: host });
    expect(participantViewFor(back.room, host).isHost).toBe(false);

    // the next participant back within its grace takes the role and gets the button
    const heir = others[0]!;
    const next = rejoinTournament(back.room, heir.token, now + RECONNECT_GRACE_MS + 2_000, 's-heir');
    expect(next.who).toEqual({ role: 'participant', id: heir.id });
    expect(hostOf(next.room)).toBe(heir.id);
    expect(participantViewFor(next.room, heir.id).isHost).toBe(true);
    expect(participantViewFor(next.room, host).isHost).toBe(false);
  });

  it('without a connected participant the lobby keeps its host; spectators never take over; the next participant back does', () => {
    let room = lobby(8);
    room = joinTournamentRoom(room, 'Watcher', 'owl', T0, 's-w').room;
    expect(spectatorsOf(room)).toHaveLength(1);
    const ps = tour(room).participants;
    const host = ps[0]!.id;
    for (const p of ps.slice(1)) if (p.id !== ps[3]!.id) room = markParticipantDisconnected(room, p.id, T0 + 1);
    room = markParticipantDisconnected(room, host, T0 + 2);
    room = markParticipantDisconnected(room, ps[3]!.id, T0 + 10);
    // lobby ghosts are dropped one grace end after the other
    expect(room.deadline).toBe(T0 + 1 + RECONNECT_GRACE_MS);
    room = tickUntil(room, T0 + 2 + RECONNECT_GRACE_MS);
    expect(tour(room).participants.map((p) => p.id)).toEqual([ps[3]!.id]);
    expect(hostOf(room)).toBe(host);
    expect(room.deadline).toBe(T0 + 10 + RECONNECT_GRACE_MS);
    // P3 comes back: P3 becomes host, never the spectator
    const back = markParticipantConnected(room, ps[3]!.id, T0 + 3 + RECONNECT_GRACE_MS, 's-3b');
    expect(hostOf(back)).toBe(ps[3]!.id);
    // nobody comes back: abandoned at the last grace end
    const gone = tick(room, T0 + 10 + RECONNECT_GRACE_MS);
    expect(tour(gone).participants).toEqual([]);
    expect(isAbandoned(gone, T0 + 10 + RECONNECT_GRACE_MS)).toBe(true);
  });

  it('no connected participant left in a running tournament: it ends and the ticker cleans the room up', async () => {
    let room = running();
    const now = T0 + 1_000;
    room = playMatch(room, now);
    const host = hostOf(room);
    for (const p of tour(room).participants) if (p.id !== host) room = markParticipantDisconnected(room, p.id, now + 1);
    room = leaveParticipant(room, host, now + 2, fixed(0.3));
    expect(tour(room).phase).toBe('finished');
    expect(tour(room).untilMs).toBeNull();
    expect(room.players).toEqual({});
    expect(isAbandoned(room, now + 2)).toBe(false);
    expect(room.deadline).toBe(now + 1 + RECONNECT_GRACE_MS);
    expect(isAbandoned(room, now + 1 + RECONNECT_GRACE_MS)).toBe(true);

    const clock = { now: now + 2 };
    const store = new MemoryRoomStore(() => clock.now);
    await store.create(room);
    const deleted: string[] = [];
    const ticker = startTicker(store, () => undefined, 60_000, () => clock.now, { rng: fixed(0.3), onDelete: (c) => deleted.push(c) });
    await ticker.runOnce();
    expect(deleted).toEqual([]);
    clock.now = now + 1 + RECONNECT_GRACE_MS;
    await ticker.runOnce();
    expect(deleted).toEqual(['TOURN']);
    await ticker.stop();
  });

  it('ends a running match when the tournament ends for lack of participants', () => {
    let room = running();
    const host = hostOf(room);
    const others = tour(room).participants.filter((p) => p.id !== host);
    for (const p of others) room = markParticipantDisconnected(room, p.id, T0 + 1);
    room = leaveParticipant(room, host, T0 + 2, fixed(0.3));
    expect(tour(room).phase).toBe('finished');
    expect(room.match?.phase).toBe('finished');
    expect(room.players).toEqual({});
    expect(room.phaseDeadline).toBeNull();
  });

  it('the host leaving after the end hands the role on without touching the results', () => {
    const { room, now } = playToEnd(running(), T0 + 1_000);
    const host = hostOf(room);
    const next = leaveParticipant(room, host, now, fixed(0.3));
    expect(tour(next).state).toEqual(tour(room).state);
    expect(tour(next).phase).toBe('finished');
    expect(hostOf(next)).toBe(tour(room).participants.find((p) => p.id !== host)!.id);
    expect(person(next, host)).toMatchObject({ connected: false, socketId: null });
    expect(next.deadline).toBeNull();
  });

  it('a lobby that everyone left is due at once and gets deleted', async () => {
    let room = lobby(2);
    const ps = tour(room).participants;
    room = leaveParticipant(room, ps[1]!.id, T0 + 1, fixed(0.3));
    expect(tour(room).participants).toHaveLength(1);
    room = leaveParticipant(room, ps[0]!.id, T0 + 2, fixed(0.3));
    expect(tour(room).participants).toHaveLength(0);
    expect(isAbandoned(room, T0 + 2)).toBe(true);
    const store = new MemoryRoomStore(() => T0 + 2);
    await store.create(room);
    const deleted: string[] = [];
    const ticker = startTicker(store, () => undefined, 60_000, () => T0 + 2, { onDelete: (c) => deleted.push(c) });
    await ticker.runOnce();
    expect(deleted).toEqual(['TOURN']);
    await ticker.stop();
  });

  it('a lobby where everyone dropped out is deleted at the last grace end', () => {
    let room = lobby(4);
    for (const [i, p] of tour(room).participants.entries()) room = markParticipantDisconnected(room, p.id, T0 + i);
    expect(room.deadline).toBe(T0 + RECONNECT_GRACE_MS);
    expect(isAbandoned(room, T0 + 2 + RECONNECT_GRACE_MS)).toBe(false);
    expect(isAbandoned(room, T0 + 3 + RECONNECT_GRACE_MS)).toBe(true);
    room = tickUntil(room, T0 + 3 + RECONNECT_GRACE_MS);
    expect(tour(room).participants).toEqual([]);
    expect(isAbandoned(room, T0 + 3 + RECONNECT_GRACE_MS)).toBe(true);
  });
});

describe('(f) rejoin by token', () => {
  it('a waiting participant resolves to its participant id; the old socket is reported', () => {
    const room = running();
    const members = [participantId(room, 'a0'), participantId(room, 'b0')];
    const waiting = tour(room).participants.find((p) => !members.includes(p.id))!;
    const r = rejoinTournament(room, waiting.token, T0 + 5, 's-new');
    expect(r.who).toEqual({ role: 'participant', id: waiting.id });
    expect(r.previousSocketId).toBe(waiting.socketId);
    expect(person(r.room, waiting.id)).toMatchObject({ connected: true, socketId: 's-new', disconnectedAt: null });
    expect(tournamentWhoOfSocket(r.room, 's-new')).toEqual({ role: 'participant', id: waiting.id });
    expect(tournamentWhoOfSocket(r.room, waiting.socketId!)).toBeNull();
    expect(r.room.match).toBe(room.match);
    expect(r.room.phaseDeadline).toBe(room.phaseDeadline);
  });

  it('a waiting participant may come back long after its disconnect (no grace between matches)', () => {
    let room = running();
    const { absent } = otherFirstRoundPairing(room);
    room = markParticipantDisconnected(room, absent, T0 + 1);
    const r = rejoinTournament(room, person(room, absent).token, T0 + 120_000, 's-late');
    expect(r.who).toEqual({ role: 'participant', id: absent });
    expect(r.previousSocketId).toBeNull();
  });

  it('a pairing member resolves to its seat', () => {
    const room = running();
    const b = person(room, participantId(room, 'b0'));
    expect(rejoinTournament(room, b.token, T0 + 1, 's-b2').who).toEqual({ role: 'player', seat: 'b0' });
    expect(tournamentWhoOfSocket(room, b.socketId!)).toEqual({ role: 'player', seat: 'b0' });
  });

  it('review M2: a pairing member past its grace but before the tick comes back as a forfeited watcher, not bad_token', () => {
    let room = running();
    const pairingId = tour(room).currentPairingId!;
    const a = participantId(room, 'a0');
    const b = person(room, participantId(room, 'b0'));
    room = markParticipantDisconnected(room, b.id, T0 + 1);
    const end = T0 + 1 + RECONNECT_GRACE_MS;
    // the ticker has not run yet: the seat is still in the running match
    room = tickUntil(room, end - 1);
    expect(tour(room).phase).toBe('match');
    expect(room.match!.forfeited).toEqual([]);

    const r = rejoinTournament(room, b.token, end + 200, 's-b2', fixed(0.3));
    expect(r.who).toEqual({ role: 'spectator', id: b.id });
    expect(r.previousSocketId).toBeNull();
    // the forfeit is settled exactly as the tick would have done it
    expect(pairingById(r.room, pairingId).result).toMatchObject({ winner: a, decidedBy: 'forfeit' });
    expect(tour(r.room).state!.forfeited).toEqual([b.id]);
    expect(tour(r.room).phase).toBe('intermission');
    expect(person(r.room, b.id)).toMatchObject({ connected: true, socketId: 's-b2', disconnectedAt: null });
    expect(tournamentWhoOfSocket(r.room, 's-b2')).toEqual({ role: 'spectator', id: b.id });
    // the same as rejoining right after the tick
    const ticked = rejoinTournament(tick(room, end, fixed(0.3)), b.token, end + 200, 's-b2', fixed(0.3));
    expect(ticked.who).toEqual(r.who);
    expect(tour(ticked.room).state).toEqual(tour(r.room).state);
  });

  it('review case: a pairing member who dropped out in the last reveal is found in the intermission', () => {
    let room = running();
    const b = participantId(room, 'b0');
    // a0 wins round 1
    room = applyPick(room, 'a0', { gesture: 'rock' }, T0 + 1);
    room = applyPick(room, 'b0', { gesture: 'scissors' }, T0 + 1);
    room = applyNext(applyNext(room, 'a0', T0 + 2), 'b0', T0 + 2);
    // round 2 decides the match; b0 refreshes during the last reveal
    room = applyPick(room, 'a0', { gesture: 'rock' }, T0 + 3);
    room = applyPick(room, 'b0', { gesture: 'scissors' }, T0 + 3);
    expect(room.match?.phase).toBe('reveal');
    room = markDisconnected(room, 'b0', T0 + 4);
    room = applyNext(room, 'a0', T0 + 5);
    expect(tour(room).phase).toBe('intermission');
    expect(room.players).toEqual({});
    expect(person(room, b)).toMatchObject({ connected: false, disconnectedAt: T0 + 4 });
    const r = rejoinTournament(room, person(room, b).token, T0 + 6, 's-b2');
    expect(r.who).toEqual({ role: 'participant', id: b });
    expect(person(r.room, b)).toMatchObject({ connected: true, socketId: 's-b2' });
    // not forfeited: b lost the match normally
    expect(tour(r.room).state!.forfeited).toEqual([]);
  });

  it('a spectator resolves to its spectator id', () => {
    const joined = joinTournamentRoom(running(), 'Watcher', 'owl', T0, 's-w');
    const spectator = spectatorsOf(joined.room)[0]!;
    const r = rejoinTournament(joined.room, spectator.token, T0 + 1, 's-w2');
    expect(r.who).toEqual({ role: 'spectator', id: spectator.id });
    expect(r.previousSocketId).toBe('s-w');
    expect(tournamentWhoOfSocket(r.room, 's-w2')).toEqual({ role: 'spectator', id: spectator.id });
  });

  it('a forfeiter coming back is a spectator, keeps its participant record and stays forfeited', () => {
    let room = running();
    const { absent } = otherFirstRoundPairing(room);
    room = leaveParticipant(room, absent, T0 + 1, fixed(0.3));
    const r = rejoinTournament(room, person(room, absent).token, T0 + 2, 's-f');
    expect(r.who).toEqual({ role: 'spectator', id: absent });
    expect(person(r.room, absent)).toMatchObject({ connected: true, socketId: 's-f', disconnectedAt: null });
    expect(tour(r.room).state!.forfeited).toEqual([absent]);
    expect(tournamentWhoOfSocket(r.room, 's-f')).toEqual({ role: 'spectator', id: absent });
    expect(spectatorsOf(r.room)).toEqual([]);
    // it never becomes host
    const host = hostOf(r.room);
    expect(host).not.toBe(absent);
    // and dropping out again sets no timer
    const gone = markParticipantDisconnected(r.room, absent, T0 + 3);
    expect(gone.deadline).toBe(r.room.deadline);
  });

  it('an unknown token is bad_token; rejoinRoom refuses tournament rooms', () => {
    const room = running();
    expect(errorCode(() => rejoinTournament(room, 'f'.repeat(32), T0, 's-x'))).toBe('bad_token');
    const token = tour(room).participants[0]!.token;
    expect(errorCode(() => rejoinRoom(room, token, T0, 's-x'))).toBe('invalid_input');
  });
});

describe('(g) tournamentRematch', () => {
  function finished(): { room: Room; now: number } {
    const { room, now } = playToEnd(running(), T0 + 1_000);
    expect(tour(room).phase).toBe('finished');
    return { room, now };
  }

  it('is host only and only after the end', () => {
    const { room } = finished();
    const other = tour(room).participants[1]!.id;
    expect(errorCode(() => tournamentRematch(room, other, T0, fixed(0.3)))).toBe('not_host');
    const lobbyRoom = lobby(4);
    expect(errorCode(() => tournamentRematch(lobbyRoom, hostOf(lobbyRoom), T0, fixed(0.3)))).toBe('wrong_phase');
    const match = running();
    expect(errorCode(() => tournamentRematch(match, hostOf(match), T0, fixed(0.3)))).toBe('wrong_phase');
  });

  it('back to the lobby: connected participants first, then connected spectators, up to 8; the rest watch', () => {
    let { room, now } = finished();
    const ps = tour(room).participants;
    const host = hostOf(room);
    const watchers: string[] = [];
    for (let i = 0; i < 6; i++) {
      const joined = joinTournamentRoom(room, `W${i}`, 'owl', now, `s-w${i}`);
      room = joined.room;
      watchers.push(joined.who.role === 'spectator' ? joined.who.id : '');
    }
    const dropped = ps.find((p) => p.id !== host)!.id;
    room = markParticipantDisconnected(room, dropped, now + 1);
    now += 2;
    const next = tournamentRematch(room, host, now, fixed(0.3));
    const t = tour(next);
    const kept = ps.filter((p) => p.id !== dropped).map((p) => p.id);
    expect(t.participants.map((p) => p.id)).toEqual([...kept, ...watchers.slice(0, 5)]);
    expect(spectatorsOf(next).map((s) => s.id)).toEqual([dropped, watchers[5]]);
    expect(spectatorsOf(next)[0]).toMatchObject({ connected: false, disconnectedAt: now - 1 });
    expect(t).toMatchObject({ phase: 'lobby', state: null, currentPairingId: null, untilMs: null, hostId: host });
    expect(next.players).toEqual({});
    expect(next.match).toBeNull();
    expect(next.phaseDeadline).toBeNull();
    // the dropped person is now a spectator: the ticker drops it after the grace
    expect(next.deadline).toBe(now - 1 + RECONNECT_GRACE_MS);
    // a new tournament starts with a new draw
    const again = startTournament(next, host, now + 1, fixed(0.6));
    expect(tour(again).phase).toBe('draw');
    expect(tour(again).state!.participants).toHaveLength(8);
  });

  it('a returned forfeiter takes part again; the host migrates if it is not connected', () => {
    let room = running();
    const { absent } = otherFirstRoundPairing(room);
    room = leaveParticipant(room, absent, T0 + 1, fixed(0.3));
    room = rejoinTournament(room, person(room, absent).token, T0 + 2, 's-f').room;
    const ended = playToEnd(room, T0 + 3);
    const now = ended.now;
    const host = hostOf(ended.room);
    const done = markParticipantDisconnected(ended.room, host, now);
    const next = tournamentRematch(done, host, now + 1, fixed(0.3));
    const ids = tour(next).participants.map((p) => p.id);
    expect(ids).toContain(absent);
    expect(ids).not.toContain(host);
    expect(hostOf(next)).toBe(ids[0]);
  });
});

describe('(h) idempotent ticks and untouched duel rooms', () => {
  it('ticks after a forfeit, a host change and a call-up change nothing when repeated', () => {
    let room = running();
    const b = participantId(room, 'b0');
    const host = hostOf(room);
    room = markParticipantDisconnected(room, b, T0 + 1);
    room = markParticipantDisconnected(room, host, T0 + 1);
    let now = T0 + 1;
    for (let i = 0; i < 30 && tour(room).phase !== 'finished'; i++) {
      if (room.deadline === null) break;
      now = Math.max(now, room.deadline);
      const once = tick(room, now, fixed(0.3));
      expect(tick(once, now, fixed(0.3))).toBe(once);
      if (!isAbandoned(once, now)) expect(once.deadline === null || once.deadline > now).toBe(true);
      room = once;
    }
  });

  it('duel rooms carry no tournament and keep their deadlines', () => {
    let room = createRoom({ config: classic, nickname: 'A', avatar: 'fox', socketId: 's-a', code: 'DUEL1' }, T0);
    room = joinRoom(room, 'B', 'owl', T0, 's-b').room;
    room = startMatch(room, 'a0', T0);
    room = markDisconnected(room, 'b0', T0 + 1);
    expect('tournament' in room).toBe(false);
    expect(room.deadline).toBe(T0 + PICK_TIMEOUT_MS);
    room = tickUntil(room, T0 + 1 + RECONNECT_GRACE_MS);
    expect(room.match?.forfeited).toEqual(['b0']);
    expect('tournament' in room).toBe(false);
    expect(room.deadline).toBeNull();
  });
});

describe('knockout byes and tie-breaks through the engine', () => {
  it.each([6, 7])('never projects a bye participant of a %i-player knockout in round 1', (n) => {
    let room = started(n);
    const state = tour(room).state!;
    const byes = state.pairings.filter((p) => p.round === 1 && (p.a === null || p.b === null));
    expect(byes).toHaveLength(8 - n);
    const byeIds = byes.map((p) => p.a ?? p.b);
    room = skipTournamentWait(room, hostOf(room), T0 + 1, fixed(0.3));
    const round1: string[][] = [];
    let now = T0 + 2;
    while (tour(room).phase !== 'finished') {
      if (currentPairing(room).round === 1) round1.push([participantId(room, 'a0'), participantId(room, 'b0')]);
      room = playMatch(room, now);
      now += 1_000;
      if (tour(room).phase === 'intermission') room = skipTournamentWait(room, hostOf(room), now, fixed(0.3));
    }
    expect(round1).toHaveLength((n - (8 - n)) / 2);
    for (const ids of round1) for (const id of byeIds) expect(ids).not.toContain(id);
  });

  it('a real round-robin tie-break plays best of 1 while the room stays best of 3', () => {
    let room = started(4, 'roundrobin');
    const [A, B, C, D] = tour(room).participants.map((p) => p.id);
    // A beats B, B beats C, C beats A, everyone beats D; in the tie-break A wins
    const beats: Record<string, string[]> = { [A!]: [B!, D!], [B!]: [C!, D!], [C!]: [A!, D!], [D!]: [] };
    const winnerSeat = (r: Room): 'a0' | 'b0' => {
      const p = currentPairing(r);
      if (p.tiebreak) return p.a === A ? 'a0' : p.b === A ? 'b0' : 'a0';
      return beats[p.a!]!.includes(p.b!) ? 'a0' : 'b0';
    };
    room = skipTournamentWait(room, hostOf(room), T0 + 1, fixed(0.3));
    let now = T0 + 2;
    let tiebreaks = 0;
    while (tour(room).phase !== 'finished') {
      if (currentPairing(room).tiebreak) {
        tiebreaks++;
        expect(room.match!.config.bestOf).toBe(1);
        expect(room.config.bestOf).toBe(3);
      } else {
        expect(room.match!.config.bestOf).toBe(3);
      }
      room = playMatch(room, now, winnerSeat(room));
      now += 1_000;
      if (tour(room).phase === 'intermission') room = skipTournamentWait(room, hostOf(room), now, fixed(0.3));
    }
    expect(tiebreaks).toBeGreaterThan(0);
    expect(podiumOf(room)[0]).toEqual({ rank: 1, ids: [A] });
  });
});

describe('fix round 1: leave forfeits, lobby ghosts, current host, rematch cap', () => {
  it('M1: the host leaving the final while the opponent is away within grace records the forfeit win', () => {
    let room = running();
    let now = T0 + 1_000;
    const host = hostOf(room);
    // play until the host is in the final
    for (let i = 0; i < 6 && !(currentPairing(room).round === 2); i++) {
      const p = currentPairing(room);
      room = playMatch(room, now, p.a === host ? 'a0' : p.b === host ? 'b0' : 'a0');
      now += 1_000;
      room = skipTournamentWait(room, host, now, fixed(0.3));
    }
    const final = currentPairing(room);
    expect(final.round).toBe(2);
    expect([final.a, final.b]).toContain(host);
    const opponent = final.a === host ? final.b! : final.a!;
    // everyone but the host is away (the opponent within its grace): no heir for the host role
    for (const p of tour(room).participants) if (p.id !== host) room = markParticipantDisconnected(room, p.id, now + 1);
    room = leaveParticipant(room, host, now + 2, fixed(0.3));
    expect(pairingById(room, final.id).result).toMatchObject({ winner: opponent, decidedBy: 'forfeit' });
    expect(tour(room).phase).toBe('finished');
    expect(podiumOf(room)[0]).toEqual({ rank: 1, ids: [opponent] });
  });

  it('M2: three lobby ghosts are gone after 10 minutes and their places are free again', () => {
    let room = lobby(8);
    const ps = tour(room).participants;
    for (const p of ps.slice(5)) room = markParticipantDisconnected(room, p.id, T0 + 1);
    room = tickUntil(room, T0 + 600_000);
    expect(tour(room).participants.map((p) => p.id)).toEqual(ps.slice(0, 5).map((p) => p.id));
    expect(room.deadline).toBeNull();
    const joined = joinTournamentRoom(room, 'Ninth', 'owl', T0 + 600_000, 's-9');
    expect(joined.who.role).toBe('participant');
    expect(tour(joined.room).participants).toHaveLength(6);
  });

  it('M2: lobby ghosts do not count at the start; the host role leaves a ghost host', () => {
    let room = lobby(4);
    const ps = tour(room).participants;
    room = markParticipantDisconnected(room, ps[3]!.id, T0 + 1);
    // no tick has dropped the ghost yet
    expect(errorCode(() => startTournament(room, hostOf(room), T0 + 1 + RECONNECT_GRACE_MS, fixed(0.3)))).toBe('not_enough_players');
    // within its grace it still counts
    expect(tour(startTournament(room, hostOf(room), T0 + RECONNECT_GRACE_MS, fixed(0.3))).phase).toBe('draw');
    // a ghost host is dropped and its role moves on (tick)
    let five = lobby(5);
    const host = hostOf(five);
    five = markParticipantDisconnected(five, host, T0 + 1);
    five = tick(five, T0 + 1 + RECONNECT_GRACE_MS);
    const heir = tour(five).participants[0]!.id;
    expect(hostOf(five)).toBe(heir);
    expect(tour(startTournament(five, heir, T0 + 2 + RECONNECT_GRACE_MS, fixed(0.3))).state!.participants).toHaveLength(4);
  });

  it('M3: a lobby joiner takes over a host gone past its grace at once', () => {
    let room = lobby(2);
    const ps = tour(room).participants;
    // straight from a store without a tick: both gone, the host long past its grace, P1 within it
    const t = tour(room);
    room = {
      ...room,
      tournament: {
        ...t,
        participants: t.participants.map((p, i) => ({
          ...p,
          connected: false,
          socketId: null,
          disconnectedAt: i === 0 ? T0 - 2 * RECONNECT_GRACE_MS : T0 - 1,
        })),
      },
    };
    const joined = joinTournamentRoom(room, 'New', 'owl', T0, 's-new');
    expect(joined.who.role).toBe('participant');
    expect(hostOf(joined.room)).toBe(joined.who.role === 'participant' ? joined.who.id : '');
    expect(hostOf(joined.room)).not.toBe(ps[0]!.id);
  });

  it('M5: the rematch drops people past their grace and never exceeds MAX_SPECTATORS', () => {
    let room = started(8);
    for (let i = 0; i < MAX_SPECTATORS; i++) room = joinTournamentRoom(room, `S${i}`, 'owl', T0, `x-${i}`).room;
    const ps = tour(room).participants;
    const host = ps[0]!.id;
    for (const p of ps.slice(1)) room = leaveParticipant(room, p.id, T0 + 5, fixed(0.3));
    room = tickUntil(room, T0 + 60_000);
    expect(tour(room).phase).toBe('finished');
    // the leavers are past their grace by now; one spectator dropped out recently
    const recent = spectatorsOf(room)[0]!.id;
    room = { ...room, spectators: spectatorsOf(room).map((s) => (s.id === recent ? { ...s, connected: false, socketId: null, disconnectedAt: T0 + 59_000 } : s)) };
    const after = tournamentRematch(room, host, T0 + 60_000, fixed(0.3));
    expect(tour(after).participants).toHaveLength(8);
    expect(spectatorsOf(after).length).toBeLessThanOrEqual(MAX_SPECTATORS);
    expect(spectatorsOf(after).map((s) => s.id)).toContain(recent);
    for (const p of ps.slice(1)) expect(spectatorsOf(after).map((s) => s.id)).not.toContain(p.id);

    // within their grace: kept, but trimmed (earliest grace end first) to MAX_SPECTATORS.
    // 12 spectators drop out (at T0 + 10 + i): only host + 4 are connected → 5 participants, 19 others
    const specs = spectatorsOf(room);
    const out = specs.slice(0, 12).map((s) => s.id);
    room = {
      ...room,
      spectators: specs.map((s, i) => (i < 12 ? { ...s, connected: false, socketId: null, disconnectedAt: T0 + 10 + i } : s)),
    };
    const early = tournamentRematch(room, host, T0 + 20, fixed(0.3));
    expect(tour(early).participants).toHaveLength(5);
    expect(spectatorsOf(early)).toHaveLength(MAX_SPECTATORS);
    // 3 must go: the earliest grace ends are the leavers' (gone at T0 + 5), in list order
    const kept = spectatorsOf(early).map((s) => s.id);
    for (const p of ps.slice(1, 4)) expect(kept).not.toContain(p.id);
    for (const id of out) expect(kept).toContain(id);
  });
});
