/**
 * DEV-ONLY: `?demo=home|lobby|board|reveal|result|spectate|gallery` renders a screen from mock data, so the look
 * can be checked without a server. main.ts imports this module only behind `import.meta.env.DEV`,
 * so it never reaches a production build.
 *
 * Extra query params: mode=<mode id>, outcome=win|lose|draw, picked=1, phase=announce, left=<seconds>, bot=1.
 */
import { REVEAL_MS, type PlayerView, type PublicMatch, type PublicPlayer, type RoomConfig, type RoomView, type SeatId } from '@rps/shared';
import { setDemoState } from './connection';

type Params = URLSearchParams;

const NAMES: Record<SeatId, [string, string]> = {
  a0: ['Lightning Larry', 'fox'],
  a1: ['Pixel Paula', 'robot'],
  b0: ['Captain Crunch', 'dino'],
  b1: ['Gerda', 'owl'],
};

function player(seat: SeatId, overrides: Partial<PublicPlayer> = {}): PublicPlayer {
  const [nickname, avatar] = NAMES[seat];
  return { seat, nickname, avatar, connected: true, disconnectedAt: null, isBot: false, ...overrides };
}

function baseMatch(config: RoomConfig, overrides: Partial<PublicMatch>): PublicMatch {
  return {
    config,
    phase: 'pick',
    round: 2,
    score: { a: 1, b: 0 },
    announces: {},
    lockedSeats: [],
    yourPick: null,
    lastRound: null,
    winner: null,
    forfeited: [],
    ...overrides,
  };
}

const MODES = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15', 'bluff', 'team2v2'] as const;

function build(name: string, params: Params): RoomView | null {
  const requested = params.get('mode');
  const mode = MODES.find((m) => m === requested) ?? (name === 'lobby' ? 'team2v2' : name === 'board' ? 'wheel15' : 'lizard-spock');
  const config: RoomConfig = { mode, bestOf: 5 };
  const team = mode === 'team2v2';
  const seats: SeatId[] = team ? ['a0', 'a1', 'b0', 'b1'] : ['a0', 'b0'];
  const players = Object.fromEntries(seats.map((s) => [s, player(s)]));
  const left = Number(params.get('left') ?? 14);
  const view: PlayerView = {
    role: 'player',
    code: 'KX7QZ',
    config,
    you: 'a0',
    hostSeat: 'a0',
    isHost: true,
    players,
    spectators: [],
    match: null,
    tournament: null,
    deadline: null,
  };

  switch (name) {
    case 'home':
      return null;
    case 'spectate':
      // A running pick phase seen from the stands: b0 has locked in, nobody's own pick is visible.
      return {
        role: 'spectator',
        code: view.code,
        config,
        hostSeat: 'a0',
        isHost: false,
        me: null,
        players,
        spectators: [
          { id: 'spec-1', nickname: 'Zuschauer Zoe', avatar: 'cat', connected: true },
          { id: 'spec-2', nickname: 'Watcher Wim', avatar: 'frog', connected: true },
        ],
        match: baseMatch(config, { lockedSeats: ['b0'] }),
        tournament: null,
        deadline: Date.now() + left * 1000,
      };
    case 'lobby':
      if (team) delete view.players.b1;
      if (params.get('bot')) view.players.b0 = player('b0', { isBot: true, nickname: 'Botty', avatar: 'robot' });
      return view;
    case 'board': {
      const picked = params.get('picked') ? (mode === 'classic' ? 'rock' : 'dragon') : null;
      view.match = baseMatch(config, {
        phase: params.get('phase') === 'announce' ? 'announce' : 'pick',
        yourPick: mode === 'wheel15' ? picked : picked && 'rock',
        lockedSeats: picked ? ['a0', 'b0'] : ['b0'],
      });
      view.deadline = Date.now() + left * 1000;
      return view;
    }
    case 'reveal': {
      const outcome = params.get('outcome') ?? 'win';
      const picks: Partial<Record<SeatId, string>> = team
        ? { a0: 'rock', a1: 'paper', b0: 'scissors', b1: 'paper' }
        : { a0: 'rock', b0: 'scissors' };
      if (outcome === 'lose') [picks.a0, picks.b0] = ['scissors', 'rock'];
      if (outcome === 'draw') picks.b0 = picks.a0 as string;
      const winner = outcome === 'win' ? 'a' : outcome === 'lose' ? 'b' : 'draw';
      const result = outcome === 'win' ? 'a' : outcome === 'lose' ? 'b' : 'draw';
      view.match = baseMatch(config, {
        phase: 'reveal',
        lastRound: {
          picks,
          winner,
          duels: team
            ? [
                { seats: ['a0', 'b0'], result },
                { seats: ['a1', 'b1'], result: 'draw' },
              ]
            : [{ seats: ['a0', 'b0'], result }],
        },
      });
      view.deadline = Date.now() + REVEAL_MS;
      return view;
    }
    case 'result': {
      const lose = params.get('outcome') === 'lose';
      view.match = baseMatch(config, {
        phase: 'finished',
        round: 5,
        score: lose ? { a: 1, b: 3 } : { a: 3, b: 1 },
        winner: lose ? 'b' : 'a',
      });
      return view;
    }
    default:
      return null;
  }
}

/** Applies the demo named in the URL. Returns true when a demo is active (then no socket is opened). */
export function startDemo(search: string = location.search): boolean {
  const params = new URLSearchParams(search);
  const name = params.get('demo');
  if (!name) return false;
  setDemoState(build(name, params));
  return true;
}
