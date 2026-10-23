/**
 * DEV-ONLY: `?demo=home|lobby|board|reveal|result|spectate|gallery|tournament-lobby|tournament-draw|tournament-intermission|tournament-finished|tournament-bracket|tournament-table|tournament-podium` renders a screen from mock data, so the look
 * can be checked without a server. main.ts imports this module only behind `import.meta.env.DEV`,
 * so it never reaches a production build.
 *
 * Extra query params: mode=<mode id>, outcome=win|lose|draw, picked=1, phase=announce, left=<seconds>, bot=1,
 * watchers=<n> (spectators in the lobby/board room), and for `spectate`: phase=pick|announce|reveal|finished|lobby (no match).
 * `reveal` and `spectate&phase=reveal` also take the picks of the (first) duel: a=<gesture>&b=<gesture> (a0 and b0;
 * the result follows the rules of all gesture sets), or winner=<gesture>&loser=<gesture> (a0 wins). Either one
 * may be `none` for a missing pick (timeout). nick=<text> gives every seat that nickname.
 * Tournament demos: n=<4..8 participants>, format=knockout|roundrobin, as=spectator (a plain spectator without `me`)|player (not the host)|champion
 * (finished demos), mode=<non-bluff, non-2v2 mode>, long=1 (16-character nicknames without spaces), decidedBy=coin|forfeit (intermission),
 * third=3 (podium: three share 3rd place). `tournament-bracket` is an 8-player knockout in the intermission after a semifinal,
 * `tournament-table` a 6-player round robin with a tie-break, `tournament-podium` a finished 8-player knockout.
 * `board` and `spectate` take tournament=1 (an 8-player knockout semifinal with the tournament header; also format, n, long).
 */
import { allRelations, REVEAL_MS, type Pairing, type PlayerView, type PublicMatch, type PublicPlayer, type PublicSpectator, type RoomConfig, type RoomView, type RoundResult, type SeatId } from '@rps/shared';
import { setDemoState } from './connection';
import { demoTournament, type DemoOutcome, type DemoTournamentOptions } from './demo-tournament';
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

const TOURNAMENT_DEMOS = {
  'tournament-lobby': 'lobby',
  'tournament-draw': 'draw',
  'tournament-intermission': 'intermission',
  'tournament-finished': 'finished',
  'tournament-bracket': 'intermission',
  'tournament-table': 'intermission',
  'tournament-podium': 'finished',
} as const;

type TournamentDemo = keyof typeof TOURNAMENT_DEMOS;

/** Round-robin demo results: d0, d1 and d2 beat everyone else and each other in a cycle (a tie for 1st, so tie-breaks), d3 to d5 too (a shared place). */
function cycleOutcome(pairing: Pairing): DemoOutcome {
  const level = (id: string | null) => (['d0', 'd1', 'd2'].includes(id ?? '') ? 0 : 1);
  const a = pairing.a ?? '';
  const b = pairing.b ?? '';
  if (level(a) !== level(b)) return level(a) < level(b) ? 'a' : 'b';
  const cycle = level(a) === 0 ? ['d0', 'd1', 'd2'] : ['d3', 'd4', 'd5', 'd6', 'd7'];
  const ia = cycle.indexOf(a);
  const ib = cycle.indexOf(b);
  return (ia + 1) % 3 === ib % 3 ? 'a' : 'b';
}

/** Demo settings per tournament demo (the URL can still override format, n, mode and the viewer). */
function tournamentOptions(name: TournamentDemo, params: Params): DemoTournamentOptions {
  const decidedBy = params.get('decidedBy');
  switch (name) {
    case 'tournament-bracket':
      // 8 players, mid-tournament: a normal win, a coin flip, a forfeit, ... then a semifinal just ended.
      return {
        format: 'knockout',
        n: 8,
        played: 5,
        outcome: (_p, k) => (['a', 'coin', 'forfeit-b', 'b', 'a'] as const)[k] ?? 'a',
      };
    case 'tournament-table':
      // 6 players round robin: every regular match and the first tie-break are played.
      return { format: 'roundrobin', n: 6, played: 16, outcome: cycleOutcome };
    case 'tournament-podium':
      // third=3: a double-forfeited semifinal puts three on the shared 3rd place.
      return {
        format: 'knockout',
        n: 8,
        outcome: params.get('third') === '3' ? (_p, k) => (k === 4 ? 'forfeit-both' : 'a') : undefined,
      };
    case 'tournament-intermission':
      return {
        outcome:
          decidedBy === 'coin' || decidedBy === 'forfeit'
            ? (_p, k) => (k === 0 ? (decidedBy === 'coin' ? 'coin' : 'forfeit-b') : 'a')
            : undefined,
      };
    default:
      return {};
  }
}

/**
 * A tournament screen as the host sees it; `as=spectator` shows a plain spectator, `as=champion` the champion
 * (finished demos), `as=player` a participant who is not the host.
 */
function buildTournament(name: TournamentDemo, params: Params): RoomView {
  const phase = TOURNAMENT_DEMOS[name];
  const requested = params.get('mode');
  const mode = TOURNAMENT_MODES.find((m) => m === requested) ?? 'wheel9';
  const preset = tournamentOptions(name, params);
  const n = Math.min(8, Math.max(4, Number(params.get('n') ?? preset.n ?? 5) || 5));
  const format = params.get('format') === 'roundrobin' ? 'roundrobin' : params.get('format') === 'knockout' ? 'knockout' : (preset.format ?? 'knockout');
  const as = params.get('as');
  const spectator = as === 'spectator';
  const options: DemoTournamentOptions = {
    ...preset,
    format,
    n,
    phase,
    long: params.get('long') === '1',
    youId: spectator ? null : as === 'player' ? 'd1' : 'd0',
    // One person lost the connection in the default lobby (5 participants).
    disconnected: phase === 'lobby' && n === 5 && !params.get('n') ? [3] : [],
  };
  let tournament = demoTournament(options);
  if (as === 'champion') {
    const champion = tournament.podium.find((p) => p.rank === 1)?.ids[0] ?? 'd0';
    tournament = { ...tournament, youId: champion };
  }
  const youId = tournament.youId;
  return {
    role: 'spectator',
    code: 'KX7QZ',
    config: { mode, bestOf: 3 },
    hostSeat: 'a0',
    isHost: youId === tournament.hostId,
    me: youId ? { id: youId } : null,
    players: {},
    spectators: watchers(Number(params.get('watchers') ?? 0)),
    match: null,
    tournament,
    deadline: null,
  };
}

/** `tournament=1` on the board/spectate demos: an 8-player knockout in its first semifinal, seated on a0/b0. */
function withTournament(view: RoomView, params: Params): RoomView {
  if (params.get('tournament') !== '1') return view;
  const tournament = demoTournament({
    format: params.get('format') === 'roundrobin' ? 'roundrobin' : 'knockout',
    n: Math.min(8, Math.max(4, Number(params.get('n') ?? 8) || 8)),
    phase: 'match',
    played: params.get('format') === 'roundrobin' ? 5 : 4,
    long: params.get('long') === '1',
    youId: null,
  });
  const pairing = tournament.pairings.find((p) => p.id === tournament.currentPairingId);
  const person = (id: string | null | undefined) => tournament.participants.find((p) => p.id === id);
  const seat = (s: 'a0' | 'b0', id: string | null | undefined): PublicPlayer =>
    player(s, { nickname: person(id)?.nickname ?? '', avatar: person(id)?.avatar ?? '' });
  const players = { a0: seat('a0', pairing?.a), b0: seat('b0', pairing?.b) };
  const config: RoomConfig = { mode: view.config.mode === 'team2v2' || view.config.mode === 'bluff' ? 'classic' : view.config.mode, bestOf: 3 };
  if (view.role === 'player') {
    return { ...view, config, players, isHost: pairing?.a === 'd0', tournament: { ...tournament, youId: pairing?.a ?? null }, match: view.match && { ...view.match, config } };
  }
  return { ...view, config, players, tournament, match: view.match && { ...view.match, config } };
}

function build(name: string, params: Params): RoomView | null {
  if (name in TOURNAMENT_DEMOS) return buildTournament(name as TournamentDemo, params);
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
  const view = build(name, params);
  setDemoState(view && withTournament(view, params));
  return true;
}
