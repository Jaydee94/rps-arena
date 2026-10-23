/**
 * DEV-ONLY: `?demo=home|lobby|board|reveal|result|spectate|gallery|tournament-lobby|tournament-draw|tournament-intermission|tournament-finished` renders a screen from mock data, so the look
 * can be checked without a server. main.ts imports this module only behind `import.meta.env.DEV`,
 * so it never reaches a production build.
 *
 * Extra query params: mode=<mode id>, outcome=win|lose|draw, picked=1, phase=announce, left=<seconds>, bot=1,
 * watchers=<n> (spectators in the lobby/board room), and for `spectate`: phase=pick|announce|reveal|finished|lobby (no match).
 * Tournament demos: n=<4..8 participants>, format=knockout|roundrobin, as=spectator (a plain spectator without `me`), mode=<non-bluff, non-2v2 mode>.
 */
import { REVEAL_MS, type PlayerView, type PublicMatch, type PublicPlayer, type PublicSpectator, type RoomConfig, type RoomView, type RoundResult, type SeatId } from '@rps/shared';
import { setDemoState } from './connection';
import { demoTournament } from './demo-tournament';
import { TOURNAMENT_MODES } from './tournament-ui';

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

const WATCHERS: [string, string][] = [
  ['Zuschauer Zoe', 'cat'],
  ['Watcher Wim', 'frog'],
  ['Eine Zuschauerin mit sehr langem Namen', 'owl'],
];

/** `n` mock spectators (at most 3). */
function watchers(n: number): PublicSpectator[] {
  return WATCHERS.slice(0, n).map(([nickname, avatar], i) => ({ id: `spec-${i}`, nickname, avatar, connected: true }));
}

const MODES = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15', 'bluff', 'team2v2'] as const;

const TOURNAMENT_PHASES = {
  'tournament-lobby': 'lobby',
  'tournament-draw': 'draw',
  'tournament-intermission': 'intermission',
  'tournament-finished': 'finished',
} as const;

/** A tournament screen as the host (or, with `as=spectator`, as a plain spectator) sees it. */
function buildTournament(phase: (typeof TOURNAMENT_PHASES)[keyof typeof TOURNAMENT_PHASES], params: Params): RoomView {
  const requested = params.get('mode');
  const mode = TOURNAMENT_MODES.find((m) => m === requested) ?? 'wheel9';
  const n = Math.min(8, Math.max(4, Number(params.get('n') ?? 5) || 5));
  const spectator = params.get('as') === 'spectator';
  const tournament = demoTournament({
    format: params.get('format') === 'roundrobin' ? 'roundrobin' : 'knockout',
    n,
    phase,
    youId: spectator ? null : 'd0',
    // One person lost the connection in the default lobby (5 participants).
    disconnected: phase === 'lobby' && n === 5 && !params.get('n') ? [3] : [],
  });
  return {
    role: 'spectator',
    code: 'KX7QZ',
    config: { mode, bestOf: 3 },
    hostSeat: 'a0',
    isHost: !spectator,
    me: spectator ? null : { id: 'd0' },
    players: {},
    spectators: watchers(Number(params.get('watchers') ?? 0)),
    match: null,
    tournament,
    deadline: null,
  };
}

function build(name: string, params: Params): RoomView | null {
  if (name in TOURNAMENT_PHASES) return buildTournament(TOURNAMENT_PHASES[name as keyof typeof TOURNAMENT_PHASES], params);
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
    spectators: watchers(Number(params.get('watchers') ?? 0)),
    match: null,
    tournament: null,
    deadline: null,
  };

  switch (name) {
    case 'home':
      return null;
    case 'spectate': {
      // The stands: nobody's own pick is visible. pick (default): b0 has locked in; reveal; finished.
      const phase = params.get('phase');
      const outcome = params.get('outcome') ?? 'win';
      const picks: Partial<Record<SeatId, string>> = team
        ? { a0: 'rock', a1: 'paper', b0: 'scissors', b1: 'paper' }
        : { a0: 'rock', b0: 'scissors' };
      if (outcome === 'lose') [picks.a0, picks.b0] = ['scissors', 'rock'];
      if (outcome === 'draw') picks.b0 = picks.a0 as string;
      const result = outcome === 'win' ? 'a' : outcome === 'lose' ? 'b' : 'draw';
      let match: PublicMatch | null = baseMatch(config, { lockedSeats: ['b0'] });
      if (phase === 'lobby') match = null;
      else if (phase === 'announce') match = baseMatch(config, { phase: 'announce', announces: { a0: 'spock', b0: null } });
      else if (phase === 'finished') match = baseMatch(config, { phase: 'finished', round: 5, score: { a: 1, b: 3 }, winner: 'b' });
      else if (phase === 'reveal') {
        const duels: RoundResult['duels'] = team
          ? [
              { seats: ['a0', 'b0'], result },
              { seats: ['a1', 'b1'], result: 'draw' },
            ]
          : [{ seats: ['a0', 'b0'], result }];
        match = baseMatch(config, { phase: 'reveal', lastRound: { picks, winner: result, duels } });
      }
      return {
        role: 'spectator',
        code: view.code,
        config,
        hostSeat: 'a0',
        isHost: false,
        me: null,
        players,
        spectators: watchers(Number(params.get('watchers') ?? 2)),
        match,
        tournament: null,
        deadline: !match || match.phase === 'finished' ? null : Date.now() + (phase === 'reveal' ? REVEAL_MS : left * 1000),
      };
    }
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
