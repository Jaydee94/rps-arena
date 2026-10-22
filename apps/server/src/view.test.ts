import { describe, expect, it } from 'vitest';
import { announce, createMatch, pick } from '@rps/shared';
import type { MatchState } from '@rps/shared';
import { viewFor } from './view';
import type { Player, Room } from './room';

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
      code: 'ABCD',
      config: { mode: 'classic', bestOf: 3 },
      you: 'b0',
      hostSeat: 'a0',
      players: {
        a0: { seat: 'a0', nickname: 'Ann', avatar: 'fox', connected: true, disconnectedAt: null, isBot: false },
        b0: { seat: 'b0', nickname: 'Ben', avatar: 'owl', connected: true, disconnectedAt: null, isBot: false },
      },
      match: null,
      deadline: 1234,
    });
  });
});
