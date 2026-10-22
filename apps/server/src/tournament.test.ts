import { describe, expect, it } from 'vitest';
import {
  DRAW_MS,
  INTERMISSION_MS,
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
  rematch,
  startMatch,
  tick,
  whoOfSocket,
} from './engine';
import { spectatorsOf } from './room';
import type { Room, TournamentRoom } from './room';
import { MemoryRoomStore } from './store';
import { startTicker } from './ticker';
import {
  advanceTournament,
  createTournamentRoom,
  finishPairing,
  joinTournamentRoom,
  projectPairing,
  skipTournamentWait,
  startTournament,
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
