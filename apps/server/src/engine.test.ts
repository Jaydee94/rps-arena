import { describe, expect, it } from 'vitest';
import {
  ANNOUNCE_TIMEOUT_MS,
  PICK_TIMEOUT_MS,
  ProtocolError,
  RECONNECT_GRACE_MS,
  REVEAL_MS,
  RuleError,
  pick,
} from '@rps/shared';
import type { BotLevel, RoomConfig, SeatId } from '@rps/shared';
import {
  applyAnnounce,
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
  seatOfSocket,
  startMatch,
  tick,
} from './engine';
import type { Room } from './room';
import { BOT_HISTORY_MAX } from './settle';

const T0 = 1_000_000;
const classic: RoomConfig = { mode: 'classic', bestOf: 3 };
const team: RoomConfig = { mode: 'team2v2', bestOf: 3 };
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

/** A started 1v1 human room: host a0 (socket s-a0), guest b0 (socket s-b0). */
function duelRoom(config: RoomConfig = classic): Room {
  let room = createRoom({ config, nickname: 'Ann', avatar: 'fox', socketId: 's-a0' }, T0);
  room = joinRoom(room, 'Ben', 'owl', T0, 's-b0').room;
  return startMatch(room, 'a0', T0);
}

function teamRoom(): Room {
  let room = createRoom({ config: team, nickname: 'P0', avatar: 'fox', socketId: 's-0' }, T0);
  for (const [i, name] of ['P1', 'P2', 'P3'].entries()) {
    room = joinRoom(room, name, 'owl', T0, `s-${i + 1}`).room;
  }
  return startMatch(room, 'a0', T0);
}

describe('createRoom', () => {
  it('seats the host in a0 with a 128-bit hex token and no match yet', () => {
    const room = createRoom({ config: classic, nickname: ' Ann ', avatar: 'fox', socketId: 's1' }, T0);
    expect(room.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(room.hostSeat).toBe('a0');
    expect(room.players.a0).toMatchObject({ nickname: 'Ann', connected: true, isBot: false });
    expect(room.players.a0?.token).toMatch(/^[0-9a-f]{32}$/);
    expect(room.players.a0?.socketId).toBe('s1');
    expect(room.match).toBeNull();
    expect(room.deadline).toBeNull();
    expect(room.history).toEqual([]);
  });

  it('draws the code from the injected rng', () => {
    expect(createRoom({ config: classic, nickname: 'A', avatar: 'fox' }, T0, fixed(0)).code).toBe(
      'AAAAA',
    );
  });

  it('issues distinct tokens', () => {
    const a = createRoom({ config: classic, nickname: 'A', avatar: 'fox' }, T0);
    const b = joinRoom(a, 'B', 'owl', T0).room;
    expect(b.players.a0?.token).not.toBe(b.players.b0?.token);
  });

  it('vsBot: the bot takes b0 and the match starts at once', () => {
    const room = createRoom(
      { config: classic, nickname: 'Ann', avatar: 'fox', vsBot: 'easy', socketId: 's1' },
      T0,
    );
    expect(room.botLevel).toBe('easy');
    expect(room.players.b0).toMatchObject({ isBot: true, connected: true, token: '', socketId: null });
    expect(typeof room.players.b0?.nickname).toBe('string');
    expect(room.match?.phase).toBe('pick');
    expect(room.phaseDeadline).toBe(T0 + PICK_TIMEOUT_MS);
    expect(room.deadline).toBe(T0 + PICK_TIMEOUT_MS);
  });

  it('vsBot in team2v2 is invalid_input', () => {
    expect(
      errorCode(() =>
        createRoom({ config: team, nickname: 'Ann', avatar: 'fox', vsBot: 'hard' }, T0),
      ),
    ).toBe('invalid_input');
  });

  it('rejects a bad nickname or avatar with invalid_input', () => {
    expect(errorCode(() => createRoom({ config: classic, nickname: '', avatar: 'fox' }, T0))).toBe(
      'invalid_input',
    );
    expect(errorCode(() => createRoom({ config: classic, nickname: 'A', avatar: 'x' }, T0))).toBe(
      'invalid_input',
    );
  });
});

describe('joinRoom / startMatch / moveSeat', () => {
  it('fills b0 in a 1v1 room and then throws room_full', () => {
    const room = createRoom({ config: classic, nickname: 'Ann', avatar: 'fox' }, T0);
    const joined = joinRoom(room, 'Ben', 'owl', T0, 's2');
    expect(joined.seat).toBe('b0');
    expect(joined.room.players.b0?.socketId).toBe('s2');
    expect(errorCode(() => joinRoom(joined.room, 'Cid', 'cat', T0))).toBe('room_full');
  });

  it('a join after the match started is room_full', () => {
    const room = createRoom({ config: team, nickname: 'Ann', avatar: 'fox' }, T0);
    const r = joinRoom(joinRoom(room, 'B', 'owl', T0).room, 'C', 'cat', T0).room;
    // Not startable yet, but force a running match to check the join rule.
    const running = { ...r, match: duelRoom().match };
    expect(errorCode(() => joinRoom(running, 'D', 'dino', T0))).toBe('room_full');
  });

  it('team2v2 starts only with all four seats taken', () => {
    let room = createRoom({ config: team, nickname: 'P0', avatar: 'fox' }, T0);
    room = joinRoom(room, 'P1', 'owl', T0).room;
    room = joinRoom(room, 'P2', 'cat', T0).room;
    expect(errorCode(() => startMatch(room, 'a0', T0))).toBe('wrong_phase');
    const full = joinRoom(room, 'P3', 'dino', T0);
    expect(Object.keys(full.room.players).sort()).toEqual(['a0', 'a1', 'b0', 'b1']);
    expect(startMatch(full.room, 'a0', T0).match?.phase).toBe('pick');
  });

  it('only the host may start', () => {
    let room = createRoom({ config: team, nickname: 'P0', avatar: 'fox' }, T0);
    room = joinRoom(room, 'P1', 'owl', T0).room; // b0
    expect(errorCode(() => startMatch(room, 'b0', T0))).toBe('not_host');
  });

  it('a non-host may move only their own seat, to a free seat', () => {
    let room = createRoom({ config: team, nickname: 'P0', avatar: 'fox' }, T0);
    room = joinRoom(room, 'P1', 'owl', T0).room; // b0
    room = joinRoom(room, 'P2', 'cat', T0).room; // a1
    const self = moveSeat(room, 'b0', 'b0', 'b1');
    expect(self.players.b1).toMatchObject({ nickname: 'P1', seat: 'b1' });
    expect(self.players.b1?.token).toBe(room.players.b0?.token);
    expect(self.hostSeat).toBe('a0');
    expect(errorCode(() => moveSeat(room, 'b0', 'a1', 'b1'))).toBe('not_host');
    expect(errorCode(() => moveSeat(room, 'b0', 'b0', 'a1'))).toBe('invalid_input'); // occupied
    expect(errorCode(() => moveSeat(room, 'b0', 'b0', 'b0'))).toBe('invalid_input');
  });

  it('seats outside the mode are invalid_input', () => {
    let room = createRoom({ config: classic, nickname: 'P0', avatar: 'fox' }, T0);
    expect(errorCode(() => moveSeat(room, 'a0', 'a0', 'a1'))).toBe('invalid_input');
    room = joinRoom(room, 'P1', 'owl', T0).room;
    expect(errorCode(() => moveSeat(room, 'b0', 'b0', 'b1'))).toBe('invalid_input');
  });

  it('the host moves any player to a free seat and the host seat follows a host self-move', () => {
    let room = createRoom({ config: team, nickname: 'P0', avatar: 'fox' }, T0);
    room = joinRoom(room, 'P1', 'owl', T0).room; // b0
    const moved = moveSeat(room, 'a0', 'b0', 'a1');
    expect(moved.players.a1).toMatchObject({ nickname: 'P1', seat: 'a1' });
    expect(moved.players.b0).toBeUndefined();
    const hostMoved = moveSeat(moved, 'a0', 'a0', 'b1');
    expect(hostMoved.hostSeat).toBe('b1');
    expect(errorCode(() => moveSeat(moved, 'a0', 'a0', 'a1'))).toBe('invalid_input'); // occupied
    expect(errorCode(() => moveSeat(moved, 'a0', 'b0', 'b1'))).toBe('invalid_input'); // empty from
  });

  it('a started room cannot be started again or rearranged', () => {
    const room = duelRoom();
    expect(errorCode(() => startMatch(room, 'a0', T0))).toBe('wrong_phase');
    expect(errorCode(() => moveSeat(room, 'a0', 'a0', 'a1'))).toBe('invalid_input');
  });
});

describe('picks, announces and reveal', () => {
  it('maps rule errors and keeps the round secret until both picked', () => {
    let room = duelRoom();
    expect(room.phaseDeadline).toBe(T0 + PICK_TIMEOUT_MS);
    expect(errorCode(() => applyPick(room, 'a0', { gesture: 'lizard' }, T0))).toBe(
      'invalid_gesture',
    );
    room = applyPick(room, 'a0', { gesture: 'rock' }, T0 + 1);
    expect(room.match?.phase).toBe('pick');
    expect(errorCode(() => applyPick(room, 'a0', { gesture: 'paper' }, T0 + 2))).toBe(
      'already_picked',
    );
    room = applyPick(room, 'b0', { gesture: 'scissors' }, T0 + 3);
    expect(room.match?.phase).toBe('reveal');
    expect(room.match?.score).toEqual({ a: 1, b: 0 });
    expect(room.phaseDeadline).toBe(T0 + 3 + REVEAL_MS);
  });

  it('game:next advances once every connected human asked', () => {
    let room = duelRoom();
    room = applyPick(room, 'a0', { gesture: 'rock' }, T0);
    room = applyPick(room, 'b0', { gesture: 'rock' }, T0);
    expect(errorCode(() => applyNext(duelRoom(), 'a0', T0))).toBe('wrong_phase');
    room = applyNext(room, 'a0', T0 + 1);
    expect(room.match?.phase).toBe('reveal');
    room = applyNext(room, 'b0', T0 + 2);
    expect(room.match?.phase).toBe('pick');
    expect(room.match?.round).toBe(2);
    expect(room.nextReady).toEqual([]);
    expect(room.phaseDeadline).toBe(T0 + 2 + PICK_TIMEOUT_MS);
  });
});

describe('bot', () => {
  const botRoom = (config: RoomConfig = classic, level: BotLevel = 'easy') =>
    createRoom({ config, nickname: 'Ann', avatar: 'fox', vsBot: level, socketId: 's1' }, T0);

  it('never picks before the human: a due tick leaves the bot silent', () => {
    const room = botRoom();
    const due = { ...room, deadline: T0 + 10 }; // e.g. a stale wake-up, phase not yet timed out
    const next = tick(due, T0 + 10, fixed(0));
    expect(next.match?.picks).toEqual({});
  });

  it('picks in the same step that locks the human pick, without reading it', () => {
    const results = ['rock', 'paper', 'scissors'].map((gesture) => {
      const r = applyPick(botRoom(), 'a0', { gesture }, T0 + 5, fixed(0.99));
      expect(r.match?.phase).toBe('reveal');
      return r.match?.lastRound?.picks.b0;
    });
    // Same rng, three different human picks: the bot chose the same gesture every time.
    expect(new Set(results).size).toBe(1);
  });

  it('a tick catches up a bot pick when the human already locked in', () => {
    const room = botRoom();
    const locked: Room = { ...room, match: pick(room.match!, 'a0', 'rock'), deadline: T0 + 1 };
    const next = tick(locked, T0 + 1, fixed(0));
    expect(next.match?.phase).toBe('reveal');
    expect(next.match?.lastRound?.picks).toEqual({ a0: 'rock', b0: 'rock' });
  });

  it('records the revealed rounds as history', () => {
    let room = applyPick(botRoom(), 'a0', { gesture: 'paper' }, T0, fixed(0));
    expect(room.history).toEqual([{ human: 'paper', bot: 'rock' }]);
    room = tick(room, T0 + REVEAL_MS, fixed(0)); // reveal timeout -> next round
    expect(room.match?.round).toBe(2);
    room = applyPick(room, 'a0', { gesture: 'scissors' }, T0 + REVEAL_MS + 1, fixed(0));
    expect(room.history).toHaveLength(2);
  });

  it.each(['easy', 'medium', 'hard'] as const)(
    'caps the history of a %s bot room across many rounds and rematches, and the bot keeps playing',
    (level) => {
      let room = botRoom(classic, level);
      const gestures = ['rock', 'paper', 'scissors'];
      let now = T0;
      let rounds = 0;
      let lastHuman = '';
      while (rounds < 130) {
        now += 1;
        if (room.match?.phase === 'finished') {
          room = rematch(room, 'a0', now, fixed(0.3));
          continue;
        }
        lastHuman = gestures[rounds % 3]!;
        room = applyPick(room, 'a0', { gesture: lastHuman }, now, fixed(0.3));
        rounds += 1;
        expect(room.match?.lastRound?.picks.b0).toBeDefined();
        expect(room.history.length).toBeLessThanOrEqual(BOT_HISTORY_MAX);
        room = tick(room, room.deadline!, fixed(0.3)); // reveal -> next round or finished
      }
      expect(room.history).toHaveLength(BOT_HISTORY_MAX);
      expect(room.history.at(-1)?.human).toBe(lastHuman);
      expect(room.botLevel).toBe(level);
    },
  );

  it('bluff: announces via chooseBotEmote only after the human announced', () => {
    const room = botRoom({ mode: 'bluff', bestOf: 3 });
    expect(room.match?.phase).toBe('announce');
    expect(room.phaseDeadline).toBe(T0 + ANNOUNCE_TIMEOUT_MS);
    expect(room.match?.announces).toEqual({});
    // rng 0.9: not skipped (>= 0.25) and the last emote of the set.
    const next = applyAnnounce(room, 'a0', { emote: null }, T0 + 1, fixed(0.9));
    expect(next.match?.announces).toEqual({ a0: null, b0: 'spock' });
    expect(next.match?.phase).toBe('pick');
    expect(next.match?.picks).toEqual({});
  });

  it('the bot still picks when the pick phase times out', () => {
    const room = botRoom();
    const next = tick(room, T0 + PICK_TIMEOUT_MS, fixed(0));
    expect(next.match?.phase).toBe('reveal');
    expect(next.match?.lastRound?.picks).toEqual({ b0: 'rock' });
  });
});

describe('tick', () => {
  it('returns the identical room when the deadline lies in the future', () => {
    const room = duelRoom();
    expect(tick(room, T0 + 1)).toBe(room);
    const lobby = createRoom({ config: classic, nickname: 'A', avatar: 'fox' }, T0);
    expect(tick(lobby, T0 + 10 ** 9)).toBe(lobby); // no deadline at all
  });

  it('times out pick and reveal phases', () => {
    let room = applyPick(duelRoom(), 'a0', { gesture: 'rock' }, T0);
    room = tick(room, T0 + PICK_TIMEOUT_MS);
    expect(room.match?.phase).toBe('reveal');
    expect(room.match?.score).toEqual({ a: 1, b: 0 });
    room = tick(room, T0 + PICK_TIMEOUT_MS + REVEAL_MS);
    expect(room.match?.phase).toBe('pick');
    expect(room.match?.round).toBe(2);
    // Idempotent: a second replica running the same tick changes nothing.
    expect(tick(room, T0 + PICK_TIMEOUT_MS + REVEAL_MS)).toBe(room);
  });

  it('forfeits a seat after RECONNECT_GRACE_MS without return', () => {
    let room = markDisconnected(duelRoom(), 'b0', T0 + 100);
    expect(room.players.b0).toMatchObject({ connected: false, disconnectedAt: T0 + 100, socketId: null });
    expect(room.deadline).toBe(T0 + PICK_TIMEOUT_MS); // phase deadline comes first
    // Keep the phase alive by picking, then wait out the grace period in steps.
    room = tick(room, T0 + PICK_TIMEOUT_MS); // round 1 times out
    room = tick(room, T0 + PICK_TIMEOUT_MS + REVEAL_MS); // round 2 starts
    expect(room.deadline).toBe(T0 + 100 + RECONNECT_GRACE_MS);
    room = tick(room, T0 + 100 + RECONNECT_GRACE_MS);
    expect(room.match?.forfeited).toEqual(['b0']);
    // The opponent left for good: the match ends instead of dragging on.
    expect(room.match?.phase).toBe('finished');
    expect(room.match?.winner).toBe('a');
    expect(room.deadline).toBeNull();
  });

  it('a rejoin within the grace period keeps the seat', () => {
    let room = markDisconnected(duelRoom(), 'b0', T0);
    const token = room.players.b0!.token;
    const back = rejoinRoom(room, token, T0 + RECONNECT_GRACE_MS - 1, 's-new');
    expect(back.seat).toBe('b0');
    expect(back.previousSocketId).toBeNull();
    room = back.room;
    expect(room.players.b0).toMatchObject({ connected: true, disconnectedAt: null, socketId: 's-new' });
    expect(room.players.b0?.token).toBe(token);
    expect(seatOfSocket(room, 's-new')).toBe('b0');
    expect(room.deadline).toBe(T0 + PICK_TIMEOUT_MS);
  });

  it('rejoin with a wrong or expired token is bad_token; a live takeover reports the old socket', () => {
    const room = markDisconnected(duelRoom(), 'b0', T0);
    expect(errorCode(() => rejoinRoom(room, 'nope', T0, 'x'))).toBe('bad_token');
    const token = room.players.b0!.token;
    expect(errorCode(() => rejoinRoom(room, token, T0 + RECONNECT_GRACE_MS, 'x'))).toBe('bad_token');
    const live = duelRoom();
    const takeover = rejoinRoom(live, live.players.a0!.token, T0, 's-tab2');
    expect(takeover.previousSocketId).toBe('s-a0');
    expect(seatOfSocket(takeover.room, 's-a0')).toBeNull();
  });

  it('markConnected restores a seat', () => {
    const room = markConnected(markDisconnected(duelRoom(), 'a0', T0), 'a0', T0 + 5, 's9');
    expect(room.players.a0).toMatchObject({ connected: true, disconnectedAt: null, socketId: 's9' });
  });

  it('lobby: a seat whose grace ran out is freed and the host moves on', () => {
    let room = createRoom({ config: classic, nickname: 'Ann', avatar: 'fox' }, T0);
    room = joinRoom(room, 'Ben', 'owl', T0).room;
    room = markDisconnected(room, 'a0', T0);
    expect(room.deadline).toBe(T0 + RECONNECT_GRACE_MS);
    room = tick(room, T0 + RECONNECT_GRACE_MS);
    expect(room.players.a0).toBeUndefined();
    expect(room.hostSeat).toBe('b0');
    expect(room.deadline).toBeNull();
    expect(isAbandoned(room, T0 + RECONNECT_GRACE_MS)).toBe(false);
  });

  it('a room where every human is gone past grace is abandoned with no deadline left', () => {
    let room = createRoom({ config: classic, nickname: 'Ann', avatar: 'fox' }, T0);
    room = markDisconnected(room, 'a0', T0);
    expect(isAbandoned(room, T0 + 1)).toBe(false);
    room = tick(room, T0 + RECONNECT_GRACE_MS);
    expect(isAbandoned(room, T0 + RECONNECT_GRACE_MS)).toBe(true);
    expect(room.deadline).toBeNull();
    expect(errorCode(() => joinRoom(room, 'Late', 'owl', T0 + RECONNECT_GRACE_MS))).toBe(
      'room_not_found',
    );
  });

  it('a bot room whose human is gone ends and is abandoned', () => {
    let room = createRoom({ config: classic, nickname: 'Ann', avatar: 'fox', vsBot: 'easy' }, T0);
    room = markDisconnected(room, 'a0', T0);
    for (let t = T0; t <= T0 + RECONNECT_GRACE_MS; t += 1000) room = tick(room, t, fixed(0));
    expect(room.match?.phase).toBe('finished');
    expect(room.match?.winner).toBe('b');
    expect(isAbandoned(room, T0 + RECONNECT_GRACE_MS)).toBe(true);
  });
});

describe('endless-draw guard', () => {
  /** Disconnects the given seats at T0 and runs the ticker past the grace period. */
  function abandon(room: Room, seats: SeatId[]): Room {
    let r = room;
    for (const seat of seats) r = markDisconnected(r, seat, T0);
    for (let i = 0; i < 100 && r.deadline !== null && r.deadline <= T0 + RECONNECT_GRACE_MS; i++) {
      r = tick(r, r.deadline);
    }
    return r;
  }

  it('1v1 with both seats forfeited finishes with no winner (no draw loop)', () => {
    const room = abandon(duelRoom(), ['a0', 'b0']);
    expect(room.match?.forfeited.sort()).toEqual(['a0', 'b0']);
    expect(room.match?.phase).toBe('finished');
    expect(room.match?.winner).toBeNull();
    expect(room.deadline).toBeNull();
    expect(isAbandoned(room, T0 + RECONNECT_GRACE_MS)).toBe(true);
  });

  it('2v2: a team without any live seat loses at once', () => {
    const room = abandon(teamRoom(), ['a0', 'a1']);
    expect(room.match?.phase).toBe('finished');
    expect(room.match?.winner).toBe('b');
    expect(isAbandoned(room, T0 + RECONNECT_GRACE_MS)).toBe(false);
  });

  it('2v2: cross forfeits (a0 and b1) would draw forever, so the match ends', () => {
    const room = abandon(teamRoom(), ['a0', 'b1']);
    expect(room.match?.phase).toBe('finished');
    expect(room.match?.winner).toBeNull(); // level score
  });

  it('2v2: one forfeit leaves a contested duel, the match goes on', () => {
    const room = abandon(teamRoom(), ['a0']);
    expect(room.match?.forfeited).toEqual(['a0']);
    expect(room.match?.phase).not.toBe('finished');
  });
});

describe('rematch', () => {
  function finished(): Room {
    let room = duelRoom({ mode: 'classic', bestOf: 3 });
    for (let round = 0; round < 2; round++) {
      room = applyPick(room, 'a0', { gesture: 'rock' }, T0);
      room = applyPick(room, 'b0', { gesture: 'scissors' }, T0);
      room = applyNext(applyNext(room, 'a0', T0), 'b0', T0);
    }
    return room;
  }

  it('resets the match for the same players, from any seat', () => {
    const room = finished();
    expect(room.match?.phase).toBe('finished');
    expect(room.deadline).toBeNull();
    expect(errorCode(() => rematch(duelRoom(), 'a0', T0))).toBe('wrong_phase');
    const again = rematch(room, 'b0', T0 + 7);
    expect(again.match).toMatchObject({ phase: 'pick', round: 1, score: { a: 0, b: 0 } });
    expect(again.players).toEqual(room.players);
    expect(again.phaseDeadline).toBe(T0 + 7 + PICK_TIMEOUT_MS);
  });

  it('keeps the bot', () => {
    let room = createRoom({ config: classic, nickname: 'Ann', avatar: 'fox', vsBot: 'hard' }, T0);
    room = { ...room, match: { ...room.match!, phase: 'finished', winner: 'a' }, deadline: null };
    const again = rematch(room, 'a0', T0);
    expect(again.players.b0?.isBot).toBe(true);
    expect(again.botLevel).toBe('hard');
    expect(again.match?.phase).toBe('pick');
  });
});

describe('abandonment rule (idle rounds)', () => {
  /** Runs the ticker at every deadline until `rounds` pick timeouts have passed. */
  function idleRounds(room: Room, rounds: number, start = T0): { room: Room; now: number } {
    let r = room;
    let now = start;
    let timeouts = 0;
    for (let i = 0; i < 50 && r.deadline !== null && timeouts < rounds; i++) {
      now = r.deadline;
      const wasPick = r.match?.phase === 'pick';
      r = tick(r, now, fixed(0));
      if (wasPick && r.match?.phase !== 'pick') timeouts++;
    }
    return { room: r, now };
  }

  it('(a) two idle humans: finished, no winner, no deadline after 3 rounds; ticks stay no-ops', () => {
    const two = idleRounds(duelRoom(), 2);
    expect(two.room.match?.phase).toBe('reveal');
    expect(two.room.idleRounds).toBe(2);
    const { room, now } = idleRounds(two.room, 1, two.now);
    expect(room.match).toMatchObject({ phase: 'finished', winner: null, round: 3 });
    expect(room.idleRounds).toBe(3);
    expect(room.deadline).toBeNull();
    expect(room.phaseDeadline).toBeNull();
    expect(tick(room, now + 10 * PICK_TIMEOUT_MS)).toBe(room);
  });

  it('(b) a human action resets the counter', () => {
    let { room } = idleRounds(duelRoom(), 1);
    room = tick(room, room.deadline!); // reveal -> round 2
    const now = room.deadline! - 1;
    room = applyPick(room, 'b0', { gesture: 'rock' }, now);
    expect(room.idleRounds).toBe(0);
    ({ room } = idleRounds(room, 2, now)); // round 2 (acted) and round 3 time out
    expect(room.match?.phase).not.toBe('finished');
    expect(room.idleRounds).toBe(1);
  });

  it('a bluff announce counts as an action', () => {
    let room = duelRoom({ mode: 'bluff', bestOf: 3 });
    room = applyAnnounce(room, 'a0', { emote: 'rock' }, T0);
    ({ room } = idleRounds(room, 1));
    expect(room.idleRounds).toBe(0);
  });

  it('(c) human vs bot with an idle human ends after 3 rounds', () => {
    const bot = createRoom({ config: { mode: 'classic', bestOf: 7 }, nickname: 'Ann', avatar: 'fox', vsBot: 'easy' }, T0);
    const { room } = idleRounds(bot, 3);
    // The bot wins every round by default (bestOf 7 needs 4), so only the idle rule ends it.
    expect(room.match).toMatchObject({ phase: 'finished', winner: null });
    expect(room.deadline).toBeNull();
  });

  it('(c2) a natural winner is kept: the bot reaching the winning score in the last idle round still wins', () => {
    const bot = createRoom({ config: { mode: 'classic', bestOf: 5 }, nickname: 'Ann', avatar: 'fox', vsBot: 'easy' }, T0);
    const { room } = idleRounds(bot, 3);
    // Bo5 needs 3 round wins: the bot wins the three idle rounds, so the score has decided the
    // match. The abandonment rule must leave it alone; the last reveal then ends it normally.
    expect(room.idleRounds).toBe(3);
    expect(room.match).toMatchObject({ phase: 'reveal', winner: null, score: { a: 0, b: 3 } });
    const done = tick(room, room.deadline!, fixed(0));
    expect(done.match).toMatchObject({ phase: 'finished', winner: 'b', score: { a: 0, b: 3 } });
    expect(done.deadline).toBeNull();
  });

  it('(d) ghost seats (connected, bound to dead sockets, never acting) end the same way', () => {
    const ghost = duelRoom(); // both connected with socket ids nobody uses any more
    expect(ghost.players.a0?.connected && ghost.players.b0?.connected).toBe(true);
    const { room } = idleRounds(ghost, 3);
    expect(room.match).toMatchObject({ phase: 'finished', winner: null });
    expect(room.deadline).toBeNull();
  });

  it('rematch resets the counter; old rooms without the field count from 0', () => {
    const { room } = idleRounds(duelRoom(), 3);
    expect(rematch(room, 'a0', T0).idleRounds).toBe(0);
    const legacy = duelRoom() as Partial<Room>;
    delete legacy.idleRounds;
    delete legacy.roundActed;
    const { room: after } = idleRounds(legacy as Room, 1);
    expect(after.idleRounds).toBe(1);
  });
});
