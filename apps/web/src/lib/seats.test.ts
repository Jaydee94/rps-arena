import { describe, expect, it } from 'vitest';
import type { PublicPlayer, RoomView, SeatId } from '@rps/shared';
import { canStart, isHost, opponentSeat, otherTeam, teamOf } from './seats';

function player(seat: SeatId, isBot = false): PublicPlayer {
  return { seat, nickname: seat, avatar: 'fox', connected: true, disconnectedAt: null, isBot };
}

function view(mode: RoomView['config']['mode'], seats: SeatId[], you: SeatId = 'a0'): RoomView {
  return {
    code: 'ABCDE',
    config: { mode, bestOf: 3 },
    you,
    hostSeat: 'a0',
    players: Object.fromEntries(seats.map((s) => [s, player(s)])),
    match: null,
    deadline: null,
  };
}

describe('seats', () => {
  it('derives the team from the seat', () => {
    expect(teamOf('a1')).toBe('a');
    expect(teamOf('b0')).toBe('b');
  });

  it('pairs opponents by slot index', () => {
    expect(opponentSeat('a0')).toBe('b0');
    expect(opponentSeat('b0')).toBe('a0');
    expect(opponentSeat('a1')).toBe('b1');
    expect(opponentSeat('b1')).toBe('a1');
  });

  it('knows who is host', () => {
    expect(isHost(view('classic', ['a0', 'b0']))).toBe(true);
    expect(isHost(view('classic', ['a0', 'b0'], 'b0'))).toBe(false);
  });

  it('can start duel rooms with two players and team rooms only with four', () => {
    expect(canStart(view('classic', ['a0']))).toBe(false);
    expect(canStart(view('classic', ['a0', 'b0']))).toBe(true);
    expect(canStart(view('team2v2', ['a0', 'b0', 'a1']))).toBe(false);
    expect(canStart(view('team2v2', ['a0', 'a1', 'b0', 'b1']))).toBe(true);
  });

  it('flips teams', () => {
    expect(otherTeam('a')).toBe('b');
    expect(otherTeam('b')).toBe('a');
  });
});
