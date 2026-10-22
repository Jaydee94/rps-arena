import { describe, expect, it } from 'vitest';
import type { PlayerView, PublicPlayer, SeatId } from '@rps/shared';
import { makeRoom, makeSpectatorRoom } from '../test/fixtures';
import { canStart, isHost, opponentSeat, otherTeam, teamOf } from './seats';

function player(seat: SeatId, isBot = false): PublicPlayer {
  return { seat, nickname: seat, avatar: 'fox', connected: true, disconnectedAt: null, isBot };
}

function view(mode: PlayerView['config']['mode'], seats: SeatId[], you: SeatId = 'a0'): PlayerView {
  return {
    role: 'player',
    code: 'ABCDE',
    config: { mode, bestOf: 3 },
    you,
    hostSeat: 'a0',
    isHost: you === 'a0',
    players: Object.fromEntries(seats.map((s) => [s, player(s)])),
    spectators: [],
    match: null,
    tournament: null,
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

  it('reads isHost from the view, not from you/hostSeat', () => {
    expect(isHost(makeRoom({ you: 'a0', hostSeat: 'a0', isHost: false }))).toBe(false);
    expect(isHost(makeRoom({ you: 'b0', hostSeat: 'a0', isHost: true }))).toBe(true);
    expect(isHost(makeSpectatorRoom())).toBe(false);
    expect(isHost(makeSpectatorRoom({ isHost: true }))).toBe(true);
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
