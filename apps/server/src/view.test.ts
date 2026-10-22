import { describe, expect, it } from 'vitest';
import { announce, createMatch, pick } from '@rps/shared';
import type { MatchState } from '@rps/shared';
import { spectatorViewFor, viewFor } from './view';
import type { Player, Room, Spectator } from './room';

const player = (seat: Player['seat'], nickname: string, avatar: string): Player => ({
  seat,
  nickname,
  avatar,
  token: `secret-token-${seat}`,
  socketId: `socket-${seat}`,
  connected: true,
  disconnectedAt: null,
  isBot: false,
});

const roomWith = (match: MatchState | null): Room => ({
  code: 'ABCD',
  version: 0,
  config: { mode: 'classic', bestOf: 3 },
  hostSeat: 'a0',
  players: {
    a0: player('a0', 'Ann', 'fox'),
    b0: player('b0', 'Ben', 'owl'),
  },
  match,
  deadline: null,
  phaseDeadline: null,
  botLevel: null,
  history: [],
  nextReady: [],
});

const spectator = (id: string, nickname: string, connected = true): Spectator => ({
  id,
  nickname,
  avatar: 'cat',
  token: `spec-token-${id}`,
  socketId: `spec-socket-${id}`,
  connected,
  disconnectedAt: connected ? null : 4242,
});

const withSpectators = (room: Room): Room => ({
  ...room,
  spectators: [spectator('s1', 'Sam'), spectator('s2', 'Sue', false)],
});

/** A running pick phase: both seats have locked in a gesture, nothing is revealed yet. */
const openPickRoom = (): Room =>
  withSpectators(
    roomWith({
      ...createMatch({ mode: 'classic', bestOf: 3 }),
      picks: { a0: 'rock', b0: 'scissors' },
    }),
  );

const pickPhaseRoom = (): Room => {
  let match = createMatch({ mode: 'classic', bestOf: 3 });
  match = pick(match, 'a0', 'rock');
  match = pick(match, 'b0', 'scissors');
  return roomWith(match);
};

describe('viewFor', () => {
  it('exposes the own pick but never the opponent pick in phase pick', () => {
    // Both seats have picked but the round is not resolved yet.
    const room = roomWith({
      ...createMatch({ mode: 'classic', bestOf: 3 }),
      picks: { a0: 'rock', b0: 'scissors' },
    });
    const view = viewFor(room, 'a0');
    expect(view.match?.phase).toBe('pick');
    expect(view.match?.yourPick).toBe('rock');
    expect(view.match?.lockedSeats).toEqual(expect.arrayContaining(['a0', 'b0']));
    expect(view.match?.lockedSeats).toHaveLength(2);
    expect(JSON.stringify(view)).not.toContain('scissors');
  });

  it('is symmetric for the other seat', () => {
    const room = roomWith({
      ...createMatch({ mode: 'classic', bestOf: 3 }),
      picks: { a0: 'rock', b0: 'scissors' },
    });
    const view = viewFor(room, 'b0');
    expect(view.match?.yourPick).toBe('scissors');
    expect(JSON.stringify(view)).not.toContain('rock');
  });

  it('shows a locked seat but no gesture while the viewer has not picked', () => {
    const room = roomWith({
      ...createMatch({ mode: 'classic', bestOf: 3 }),
      picks: { a0: 'rock' },
    });
    const view = viewFor(room, 'b0');
    expect(view.match?.lockedSeats).toEqual(['a0']);
    expect(view.match?.yourPick).toBeNull();
    expect(JSON.stringify(view)).not.toContain('rock');
  });

  it('never has a picks key in the match view', () => {
    const view = viewFor(pickPhaseRoom(), 'a0');
    expect(view.match).not.toBeNull();
    expect(Object.keys(view.match ?? {})).not.toContain('picks');
  });

  it('reveals all picks through lastRound in phase reveal', () => {
    const view = viewFor(pickPhaseRoom(), 'a0');
    expect(view.match?.phase).toBe('reveal');
    expect(view.match?.lastRound?.picks).toEqual({ a0: 'rock', b0: 'scissors' });
  });

  it('never contains a token', () => {
    for (const room of [roomWith(null), pickPhaseRoom()]) {
      for (const seat of ['a0', 'b0'] as const) {
        const json = JSON.stringify(viewFor(room, seat));
        expect(json).not.toContain('secret-token');
        expect(json).not.toContain('token');
      }
    }
  });

  it('keeps announces public', () => {
    let match = createMatch({ mode: 'bluff', bestOf: 3 });
    match = announce(match, 'a0', 'spock');
    const view = viewFor(roomWith(match), 'b0');
    expect(view.match?.announces).toEqual({ a0: 'spock' });
  });

  it('never exposes socket ids, bot history or skip votes', () => {
    const room: Room = {
      ...pickPhaseRoom(),
      history: [{ human: 'paper', bot: 'paper' }],
      nextReady: ['a0'],
    };
    for (const seat of ['a0', 'b0'] as const) {
      const json = JSON.stringify(viewFor(room, seat));
      expect(json).not.toContain('socket-');
      expect(json).not.toContain('history');
      expect(json).not.toContain('nextReady');
    }
  });

  it('maps room fields and public players; deadline is the phase timer, not the wake-up time', () => {
    const room = { ...roomWith(null), deadline: 999, phaseDeadline: 1234 };
    const view = viewFor(room, 'b0');
    expect(view).toEqual({
      role: 'player',
      code: 'ABCD',
      config: { mode: 'classic', bestOf: 3 },
      you: 'b0',
      hostSeat: 'a0',
      isHost: false,
      players: {
        a0: { seat: 'a0', nickname: 'Ann', avatar: 'fox', connected: true, disconnectedAt: null, isBot: false },
        b0: { seat: 'b0', nickname: 'Ben', avatar: 'owl', connected: true, disconnectedAt: null, isBot: false },
      },
      spectators: [],
      match: null,
      deadline: 1234,
    });
  });
});

describe('viewFor with spectators', () => {
  it('has role player, isHost and the public spectator list', () => {
    const room = withSpectators(roomWith(null));
    const host = viewFor(room, 'a0');
    expect(host.role).toBe('player');
    expect(host.isHost).toBe(true);
    expect(viewFor(room, 'b0').isHost).toBe(false);
    expect(host.spectators).toEqual([
      { id: 's1', nickname: 'Sam', avatar: 'cat', connected: true },
      { id: 's2', nickname: 'Sue', avatar: 'cat', connected: false },
    ]);
    for (const entry of host.spectators) {
      expect(Object.keys(entry).sort()).toEqual(['avatar', 'connected', 'id', 'nickname']);
    }
  });

  it('shows no spectators for a legacy room without a spectators field', () => {
    const room = roomWith(null);
    expect('spectators' in room).toBe(false);
    expect(viewFor(room, 'a0').spectators).toEqual([]);
    expect(spectatorViewFor(room).spectators).toEqual([]);
  });

  it('never leaks spectator tokens, socket ids or disconnect times to players', () => {
    const room = openPickRoom();
    for (const seat of ['a0', 'b0'] as const) {
      const json = JSON.stringify(viewFor(room, seat));
      expect(json).not.toContain('spec-token');
      expect(json).not.toContain('spec-socket');
      expect(json).not.toContain('4242');
      expect(json).not.toContain('token');
    }
  });

  it('still hides the opponent pick from players while spectators are present', () => {
    const room = openPickRoom();
    expect(JSON.stringify(viewFor(room, 'a0'))).not.toContain('scissors');
    expect(JSON.stringify(viewFor(room, 'b0'))).not.toContain('rock');
    expect(Object.keys(viewFor(room, 'a0').match ?? {})).not.toContain('picks');
  });
});

describe('spectatorViewFor', () => {
  it('contains no unchosen gesture, token or socket id while both picks are locked', () => {
    const view = spectatorViewFor(openPickRoom());
    const json = JSON.stringify(view);
    expect(view.match?.phase).toBe('pick');
    for (const gesture of ['rock', 'paper', 'scissors', 'lizard', 'spock']) {
      expect(json).not.toContain(gesture);
    }
    expect(json).not.toContain('secret-token');
    expect(json).not.toContain('spec-token');
    expect(json).not.toContain('token');
    expect(json).not.toContain('socket');
    expect(json).not.toContain('picks');
    expect(json).not.toContain('4242');
  });

  it('has no picks key, but shows which seats are locked, and yourPick is null', () => {
    const view = spectatorViewFor(openPickRoom());
    expect(Object.keys(view.match ?? {})).not.toContain('picks');
    expect(view.match?.lockedSeats).toEqual(expect.arrayContaining(['a0', 'b0']));
    expect(view.match?.lockedSeats).toHaveLength(2);
    expect(view.match?.yourPick).toBeNull();
  });

  it('builds the pick-phase match from an explicit allow-list of keys', () => {
    // A new MatchState field must be added here on purpose, never leak in by default.
    const view = spectatorViewFor(openPickRoom());
    expect(Object.keys(view.match ?? {}).sort()).toEqual([
      'announces',
      'config',
      'forfeited',
      'lastRound',
      'lockedSeats',
      'phase',
      'round',
      'score',
      'winner',
      'yourPick',
    ]);
  });

  it('has a null yourPick even for a single locked seat', () => {
    const room = withSpectators(
      roomWith({ ...createMatch({ mode: 'classic', bestOf: 3 }), picks: { a0: 'rock' } }),
    );
    const view = spectatorViewFor(room);
    expect(view.match?.lockedSeats).toEqual(['a0']);
    expect(view.match?.yourPick).toBeNull();
    expect(JSON.stringify(view)).not.toContain('rock');
  });

  it('reveals the gestures through lastRound after the reveal', () => {
    const view = spectatorViewFor(withSpectators(pickPhaseRoom()));
    expect(view.match?.phase).toBe('reveal');
    expect(view.match?.lastRound?.picks).toEqual({ a0: 'rock', b0: 'scissors' });
    expect(view.match?.yourPick).toBeNull();
    expect(Object.keys(view.match ?? {})).not.toContain('picks');
    expect(JSON.stringify(view)).not.toContain('token');
  });

  it('keeps announces public', () => {
    let match = createMatch({ mode: 'bluff', bestOf: 3 });
    match = announce(match, 'a0', 'spock');
    expect(spectatorViewFor(roomWith(match)).match?.announces).toEqual({ a0: 'spock' });
  });

  it('maps the whole view: no you, not host, me null, public players and spectators', () => {
    const room = { ...withSpectators(roomWith(null)), deadline: 999, phaseDeadline: 1234 };
    expect(spectatorViewFor(room)).toEqual({
      role: 'spectator',
      code: 'ABCD',
      config: { mode: 'classic', bestOf: 3 },
      hostSeat: 'a0',
      isHost: false,
      me: null,
      players: {
        a0: { seat: 'a0', nickname: 'Ann', avatar: 'fox', connected: true, disconnectedAt: null, isBot: false },
        b0: { seat: 'b0', nickname: 'Ben', avatar: 'owl', connected: true, disconnectedAt: null, isBot: false },
      },
      spectators: [
        { id: 's1', nickname: 'Sam', avatar: 'cat', connected: true },
        { id: 's2', nickname: 'Sue', avatar: 'cat', connected: false },
      ],
      match: null,
      deadline: 1234,
    });
    expect('you' in spectatorViewFor(room)).toBe(false);
  });

  it('is identical for the whole room regardless of who asks (no own id)', () => {
    const room = openPickRoom();
    expect(spectatorViewFor(room)).toEqual(spectatorViewFor({ ...room }));
  });
});
