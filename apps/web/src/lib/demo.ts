/**
 * DEV-ONLY: `?demo=home|lobby|board|reveal|result|spectate|gallery` renders a screen from mock data, so the look
 * can be checked without a server. main.ts imports this module only behind `import.meta.env.DEV`,
 * so it never reaches a production build.
 *
 * Extra query params: mode=<mode id>, outcome=win|lose|draw, picked=1, phase=announce, left=<seconds>, bot=1,
 * watchers=<n> (spectators in the lobby/board room), and for `spectate`: phase=pick|announce|reveal|finished|lobby (no match).
 * `reveal` and `spectate&phase=reveal` also take the picks of the (first) duel: a=<gesture>&b=<gesture> (a0 and b0;
 * the result follows the rules of all gesture sets), or winner=<gesture>&loser=<gesture> (a0 wins). Either one
 * may be `none` for a missing pick (timeout). nick=<text> gives every seat that nickname.
 */
import { allRelations, REVEAL_MS, type PlayerView, type PublicMatch, type PublicPlayer, type PublicSpectator, type RoomConfig, type RoomView, type RoundResult, type SeatId } from '@rps/shared';
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

/**
 * The picks and result of the first duel from a=/b= or winner=/loser=; null when neither is given.
 * `none` leaves a seat without a pick (the other side wins, as on a timeout).
 */
function duelPicks(params: Params): { a: string | undefined; b: string | undefined; result: 'a' | 'b' | 'draw' } | null {
  const winner = params.get('winner');
  const loser = params.get('loser');
  const a = params.get('a') ?? winner;
  const b = params.get('b') ?? loser;
  if (!a || !b) return null;
  const pickA = a === 'none' ? undefined : a;
  const pickB = b === 'none' ? undefined : b;
  if (!pickA || !pickB) return { a: pickA, b: pickB, result: pickA ? 'a' : 'b' };
  if (pickA === pickB) return { a: pickA, b: pickB, result: 'draw' };
  const beats = (x: string, y: string) => allRelations().some((r) => r.winner === x && r.loser === y);
  return { a: pickA, b: pickB, result: beats(pickA, pickB) ? 'a' : beats(pickB, pickA) ? 'b' : 'draw' };
}

/** Applies a=/b= (or winner=/loser=) to the picks and returns the result of the first duel, if given. */
function applyDuelPicks(params: Params, picks: Partial<Record<SeatId, string>>): 'a' | 'b' | 'draw' | null {
  const duel = duelPicks(params);
  if (!duel) return null;
  if (duel.a) picks.a0 = duel.a;
  else delete picks.a0;
  if (duel.b) picks.b0 = duel.b;
  else delete picks.b0;
  return duel.result;
}

function build(name: string, params: Params): RoomView | null {
  const requested = params.get('mode');
  const mode = MODES.find((m) => m === requested) ?? (name === 'lobby' ? 'team2v2' : name === 'board' ? 'wheel15' : 'lizard-spock');
  const config: RoomConfig = { mode, bestOf: 5 };
  const team = mode === 'team2v2';
  const seats: SeatId[] = team ? ['a0', 'a1', 'b0', 'b1'] : ['a0', 'b0'];
  // nick=<text>: every seat gets this nickname (to check long, wrapping name tags).
  const nick = params.get('nick');
  const players = Object.fromEntries(seats.map((s) => [s, player(s, nick ? { nickname: nick } : {})]));
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
      const result = applyDuelPicks(params, picks) ?? (outcome === 'win' ? 'a' : outcome === 'lose' ? 'b' : 'draw');
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
      const result = applyDuelPicks(params, picks) ?? (outcome === 'win' ? 'a' : outcome === 'lose' ? 'b' : 'draw');
      const winner = result;
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
