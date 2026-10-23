import { describe, expect, it } from 'vitest';
import { DRAW_MS, INTERMISSION_MS, announce, createMatch, pick } from '@rps/shared';
import type { MatchState } from '@rps/shared';
import { applyNext, applyPick } from './engine';
import { spectatorsOf } from './room';
import type { Player, Room, Spectator } from './room';
import {
  advanceTournament,
  createTournamentRoom,
  joinTournamentRoom,
  leaveParticipant,
  markParticipantConnected,
  markParticipantDisconnected,
  skipTournamentWait,
  startTournament,
} from './tournament';
import { participantViewFor, spectatorViewFor, tournamentViewFor, viewFor } from './view';

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
      tournament: null,
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
      tournament: null,
      deadline: 1234,
    });
    expect('you' in spectatorViewFor(room)).toBe(false);
  });

  it('is identical for the whole room regardless of who asks (no own id)', () => {
    const room = openPickRoom();
    expect(spectatorViewFor(room)).toEqual(spectatorViewFor({ ...room }));
  });
});

// --- Tournament views (Stage 2 Task 4) ---------------------------------------------------------

const T0 = 1_000_000;
const fixedRng = () => 0.3;

/** A four-player knockout whose first pairing is running (pick phase, nothing locked yet). */
function tournamentInMatch(): Room {
  let room = createTournamentRoom(
    { config: { mode: 'classic', bestOf: 3 }, format: 'knockout', nickname: 'Hal', avatar: 'fox', socketId: 'sock-0', code: 'TOURN' },
    T0,
  );
  for (const [i, name] of ['Ida', 'Jo', 'Kim'].entries()) {
    room = joinTournamentRoom(room, name, 'owl', T0, `sock-${i + 1}`).room;
  }
  room = startTournament(room, room.tournament!.hostId, T0, fixedRng);
  room = advanceTournament(room, T0 + DRAW_MS, fixedRng);
  room = joinTournamentRoom(room, 'Lou', 'cat', T0 + DRAW_MS, 'sock-spec').room;
  return room;
}

/** Both pairing members have locked in, nothing is revealed. */
const lockedIn = (room: Room): Room => ({
  ...room,
  match: { ...room.match!, picks: { a0: 'rock', b0: 'scissors' } },
});

const tokensOf = (room: Room) => [
  ...room.tournament!.participants.map((p) => p.token),
  ...spectatorsOf(room).map((s) => s.token),
];

function waitingIds(room: Room): string[] {
  const t = room.tournament!;
  const pairing = t.state!.pairings.find((p) => p.id === t.currentPairingId)!;
  return t.participants.map((p) => p.id).filter((id) => id !== pairing.a && id !== pairing.b);
}

function pairingIds(room: Room): { a: string; b: string } {
  const t = room.tournament!;
  const pairing = t.state!.pairings.find((p) => p.id === t.currentPairingId)!;
  return { a: pairing.a!, b: pairing.b! };
}

/** Plays the running pairing to the end: a0 wins 2-0. */
function playOut(room: Room, now: number): Room {
  let next = room;
  for (let round = 0; round < 2; round++) {
    next = applyPick(next, 'a0', { gesture: 'rock' }, now, fixedRng);
    next = applyPick(next, 'b0', { gesture: 'scissors' }, now, fixedRng);
    next = applyNext(next, 'a0', now, fixedRng);
    next = applyNext(next, 'b0', now, fixedRng);
  }
  return next;
}

describe('tournament views', () => {
  it('a pairing member sees the own pick only, its participant id and the tournament', () => {
    const room = lockedIn(tournamentInMatch());
    const { a, b } = pairingIds(room);
    const viewA = viewFor(room, 'a0');
    expect(viewA.match?.yourPick).toBe('rock');
    expect(JSON.stringify(viewA)).not.toContain('scissors');
    expect(viewA.tournament).toMatchObject({ format: 'knockout', phase: 'match', youId: a, untilMs: null });
    expect(viewA.tournament?.currentPairingId).toBe(room.tournament!.currentPairingId);
    expect(viewA.isHost).toBe(a === room.tournament!.hostId);
    const viewB = viewFor(room, 'b0');
    expect(viewB.tournament?.youId).toBe(b);
    expect(JSON.stringify(viewB)).not.toContain('rock');
    expect(viewB.isHost).toBe(b === room.tournament!.hostId);
  });

  it('isHost follows the host participant id, not the seat', () => {
    const room = tournamentInMatch();
    const { a, b } = pairingIds(room);
    const hostId = room.tournament!.hostId;
    const asHost = (id: string): Room => ({ ...room, tournament: { ...room.tournament!, hostId: id } });
    expect(viewFor(asHost(b), 'b0').isHost).toBe(true);
    expect(viewFor(asHost(b), 'a0').isHost).toBe(false);
    expect(viewFor(asHost(a), 'a0').isHost).toBe(true);
    const waiting = waitingIds(room)[0]!;
    expect(viewFor(asHost(waiting), 'a0').isHost).toBe(false);
    expect(participantViewFor(asHost(waiting), waiting).isHost).toBe(true);
    expect(hostId).toBe(room.tournament!.participants[0]!.id);
  });

  it('exposes the host participant id in every view kind, and it follows a host change', () => {
    const room = lockedIn(tournamentInMatch());
    const { a, b } = pairingIds(room);
    const hostId = room.tournament!.hostId;
    const waiting = waitingIds(room)[0]!;
    const check = (r: Room, expected: string) => {
      const views = [
        viewFor(r, 'a0'),
        viewFor(r, 'b0'),
        participantViewFor(r, waiting),
        spectatorViewFor(r),
      ];
      for (const view of views) {
        expect(view.tournament?.hostId).toBe(expected);
        const json = JSON.stringify(view);
        for (const token of tokensOf(r)) expect(json).not.toContain(token);
        expect(json).not.toContain('token');
      }
      expect(tournamentViewFor(r, null).hostId).toBe(expected);
    };
    check(room, hostId);
    const successor = [a, b, waiting].find((id) => id !== hostId)!;
    check({ ...room, tournament: { ...room.tournament!, hostId: successor } }, successor);
  });

  it('a waiting participant gets its own spectator view: me, youId, no gesture, no token', () => {
    const room = lockedIn(tournamentInMatch());
    for (const id of waitingIds(room)) {
      const view = participantViewFor(room, id);
      expect(view).toMatchObject({ role: 'spectator', me: { id }, tournament: { youId: id } });
      expect(view.isHost).toBe(id === room.tournament!.hostId);
      expect(view.match).toMatchObject({ phase: 'pick', yourPick: null });
      expect(view.match?.lockedSeats).toEqual(expect.arrayContaining(['a0', 'b0']));
      const json = JSON.stringify(view);
      for (const gesture of ['rock', 'paper', 'scissors', 'lizard', 'spock']) expect(json).not.toContain(gesture);
      for (const token of tokensOf(room)) expect(json).not.toContain(token);
      expect(json).not.toContain('token');
      expect(json).not.toContain('sock-');
      expect(json).not.toContain('picks');
    }
  });

  it('the shared spectator view has no own id, no host right and no secret', () => {
    const room = lockedIn(tournamentInMatch());
    const view = spectatorViewFor(room);
    expect(view).toMatchObject({ role: 'spectator', me: null, isHost: false, tournament: { youId: null } });
    expect(view.spectators.map((s) => s.nickname)).toEqual(['Lou']);
    const json = JSON.stringify(view);
    for (const gesture of ['rock', 'paper', 'scissors', 'lizard', 'spock']) expect(json).not.toContain(gesture);
    for (const token of tokensOf(room)) expect(json).not.toContain(token);
    expect(json).not.toContain('token');
    expect(json).not.toContain('sock-');
    expect(json).not.toContain('picks');
  });

  it('builds the tournament from an explicit allow-list: no tokens, socket ids or disconnect times', () => {
    const base = tournamentInMatch();
    // A waiting participant dropped out: its disconnect time must not show up.
    const goneId = waitingIds(base)[0]!;
    const room = markParticipantDisconnected(base, goneId, 4_242_424);
    const t = tournamentViewFor(room, null);
    expect(Object.keys(t).sort()).toEqual([
      'currentPairingId',
      'format',
      'hostId',
      'pairings',
      'participants',
      'phase',
      'podium',
      'standings',
      'untilMs',
      'youId',
    ]);
    expect(t.participants).toHaveLength(4);
    for (const p of t.participants) {
      expect(Object.keys(p).sort()).toEqual(['avatar', 'connected', 'forfeited', 'id', 'nickname']);
    }
    expect(t.participants.find((p) => p.id === goneId)).toMatchObject({ connected: false, forfeited: false });
    for (const p of t.pairings) {
      expect(Object.keys(p).sort()).toEqual(['a', 'b', 'bestOf', 'decidedBy', 'id', 'round', 'score', 'tiebreak', 'winner']);
    }
    const json = JSON.stringify(t);
    for (const token of tokensOf(room)) expect(json).not.toContain(token);
    expect(json).not.toContain('sock-');
    expect(json).not.toContain('4242424');
    // Participant ids are tournament-local, never tokens.
    for (const p of room.tournament!.participants) expect(p.id).not.toBe(p.token);
  });

  it('shows the lobby before the start: participants, no pairings, empty standings and podium', () => {
    const room = createTournamentRoom(
      { config: { mode: 'wheel7', bestOf: 3 }, format: 'roundrobin', nickname: 'Hal', avatar: 'fox', socketId: 'sock-0' },
      T0,
    );
    const hostId = room.tournament!.hostId;
    const view = participantViewFor(room, hostId);
    expect(view).toMatchObject({ role: 'spectator', isHost: true, me: { id: hostId }, match: null, players: {} });
    expect(view.tournament).toEqual({
      format: 'roundrobin',
      phase: 'lobby',
      participants: [{ id: hostId, nickname: 'Hal', avatar: 'fox', connected: true, forfeited: false }],
      pairings: [],
      currentPairingId: null,
      standings: [],
      podium: [],
      youId: hostId,
      hostId,
      untilMs: null,
    });
  });

  it('shows the draw and the intermission with untilMs; members become watchers between matches', () => {
    let room = createTournamentRoom(
      { config: { mode: 'classic', bestOf: 3 }, format: 'knockout', nickname: 'Hal', avatar: 'fox', socketId: 'sock-0' },
      T0,
    );
    for (const name of ['Ida', 'Jo', 'Kim']) room = joinTournamentRoom(room, name, 'owl', T0, `sock-${name}`).room;
    room = startTournament(room, room.tournament!.hostId, T0, fixedRng);
    expect(spectatorViewFor(room).tournament).toMatchObject({ phase: 'draw', untilMs: T0 + DRAW_MS });
    expect(spectatorViewFor(room).tournament?.pairings.length).toBeGreaterThan(0);
    room = advanceTournament(room, T0 + DRAW_MS, fixedRng);
    const { a, b } = pairingIds(room);
    const played = playOut(room, T0 + DRAW_MS + 10);
    const t = played.tournament!;
    expect(t.phase).toBe('intermission');
    const winnerView = participantViewFor(played, a);
    expect(winnerView.tournament).toMatchObject({ phase: 'intermission', untilMs: T0 + DRAW_MS + 10 + INTERMISSION_MS, youId: a });
    const pairing = winnerView.tournament!.pairings.find((p) => p.id === t.currentPairingId)!;
    expect(pairing).toMatchObject({ a, b, winner: a, decidedBy: 'match', score: { a: 2, b: 0 }, bestOf: 3, tiebreak: false });
    // The finished match stays visible to everyone; nobody sits on a seat any more.
    expect(winnerView.match?.phase).toBe('finished');
    expect(winnerView.players).toEqual({});
  });

  it('shows the champion and the podium once the knockout is finished', () => {
    let room = tournamentInMatch();
    let now = T0 + DRAW_MS;
    while (room.tournament!.phase !== 'finished') {
      if (room.tournament!.phase === 'match') room = playOut(room, now);
      else room = skipTournamentWait(room, room.tournament!.hostId, now, fixedRng);
      now += 10;
    }
    const view = spectatorViewFor(room);
    expect(view.tournament?.phase).toBe('finished');
    expect(view.tournament?.untilMs).toBeNull();
    const ranks = view.tournament!.podium.map((p) => p.rank);
    expect(ranks).toEqual([1, 2, 3]);
    expect(view.tournament!.podium[2]!.ids).toHaveLength(2);
    expect(view.tournament!.standings).toHaveLength(4);
    const final = view.tournament!.pairings.at(-1)!;
    expect(view.tournament!.podium[0]!.ids).toEqual([final.winner]);
  });

  it('a pairing bestOf is the pairing own (tie-breaks are best of 1)', () => {
    const room = tournamentInMatch();
    const t = room.tournament!;
    const tieBreak = {
      ...t.state!.pairings[0]!,
      id: 'tb-1',
      round: 9,
      bestOf: 1 as const,
      tiebreak: true,
      result: null,
    };
    const withTieBreak: Room = {
      ...room,
      tournament: { ...t, state: { ...t.state!, pairings: [...t.state!.pairings, tieBreak] } },
    };
    const pairing = tournamentViewFor(withTieBreak, null).pairings.find((p) => p.id === 'tb-1');
    expect(pairing).toMatchObject({ bestOf: 1, tiebreak: true, winner: null, decidedBy: null, score: null });
    expect(withTieBreak.config.bestOf).toBe(3);
  });

  it('a forfeited participant is flagged and watches with its own id', () => {
    const room = tournamentInMatch();
    const id = waitingIds(room)[0]!;
    const left = leaveParticipant(room, id, T0 + DRAW_MS + 1, fixedRng);
    const back = markParticipantConnected(left, id, T0 + DRAW_MS + 2, 'sock-back');
    const view = participantViewFor(back, id);
    expect(view).toMatchObject({ role: 'spectator', isHost: false, me: { id }, tournament: { youId: id } });
    expect(view.tournament?.participants.find((p) => p.id === id)?.forfeited).toBe(true);
  });

  it('duel rooms keep tournament null', () => {
    expect(viewFor(roomWith(null), 'a0').tournament).toBeNull();
    expect(spectatorViewFor(roomWith(null)).tournament).toBeNull();
  });
});
