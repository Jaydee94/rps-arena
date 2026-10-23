import { describe, expect, it } from 'vitest';
import { TIEBREAK_MAX_ROUNDS } from './constants';
import {
  createTournament,
  isFinished,
  markForfeited,
  nextPairing,
  podium,
  recordResult,
  settleAutomatic,
  standings,
  type MatchOutcome,
  type Pairing,
  type TournamentFormat,
  type TournamentState,
} from './tournament';

/** Deterministic pseudo-random source (mulberry32). */
function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const fixed = (value: number) => () => value;

// The shared package compiles against the plain ES lib (no DOM/Node types); Node provides it at runtime.
const structuredClone = (globalThis as unknown as { structuredClone: <T>(value: T) => T }).structuredClone;

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function round(state: TournamentState, r: number): Pairing[] {
  return state.pairings.filter((p) => p.round === r);
}

function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`expected ${what}`);
  return value;
}

function win(side: 'a' | 'b'): MatchOutcome {
  return { winner: side, score: side === 'a' ? { a: 2, b: 0 } : { a: 0, b: 2 }, forfeit: null };
}

const noWinner = (a: number, b: number): MatchOutcome => ({ winner: null, score: { a, b }, forfeit: null });

/**
 * Plays open pairings in order (all of them, or at most `limit`). `decide` returns the winner's ID or null for a match without a winner.
 */
function playAll(
  state: TournamentState,
  decide: (a: string, b: string, p: Pairing) => string | null,
  rng: () => number = fixed(0),
  limit = Infinity,
): TournamentState {
  let s = state;
  for (let played = 0; played < 200; played++) {
    if (played >= limit) return s;
    const p = nextPairing(s);
    if (!p) return s;
    const a = must(p.a, 'a');
    const b = must(p.b, 'b');
    const w = decide(a, b, p);
    s = recordResult(s, p.id, w === null ? noWinner(1, 1) : win(w === a ? 'a' : 'b'), rng);
  }
  throw new Error('tournament did not terminate');
}

/** Builds a decider from a list of "winner>loser" and "x=y" (no winner) entries. */
function table(entries: string[]): (a: string, b: string) => string | null {
  return (a, b) => {
    for (const e of entries) {
      if (e === `${a}>${b}`) return a;
      if (e === `${b}>${a}`) return b;
      if (e === `${a}=${b}` || e === `${b}=${a}`) return null;
    }
    throw new Error(`no result for ${a} vs ${b}`);
  };
}

function rankOf(state: TournamentState, id: string): number {
  return must(standings(state).find((r) => r.participantId === id), id).rank;
}

const sorted = (xs: readonly string[]) => [...xs].sort();

describe('createTournament', () => {
  it('rejects fewer than 4, more than 8 and duplicate IDs', () => {
    expect(() => createTournament('knockout', ids(3), fixed(0))).toThrow();
    expect(() => createTournament('roundrobin', ids(9), fixed(0))).toThrow();
    expect(() => createTournament('knockout', ['a', 'b', 'c', 'a'], fixed(0))).toThrow();
  });

  // (a)
  for (let n = 4; n <= 8; n++) {
    it(`draws a knockout bracket for ${n} players`, () => {
      const s = createTournament('knockout', ids(n), seeded(n));
      const r1 = round(s, 1);
      const seen = r1.flatMap((p) => [p.a, p.b]).filter((x): x is string => x !== null);
      expect(sorted(seen)).toEqual(sorted(ids(n)));
      const byes = r1.filter((p) => p.a === null || p.b === null);
      expect(byes).toHaveLength(nextPow2(n) - n);
      expect(r1.some((p) => p.a === null && p.b === null)).toBe(false);
      for (const p of byes) {
        expect(p.result).toEqual({ winner: p.a ?? p.b, score: null, decidedBy: 'bye' });
      }
      if (n === 4 || n === 8) expect(byes).toHaveLength(0);
      for (const p of r1) {
        expect(p.bestOf).toBe(3);
        expect(p.tiebreak).toBe(false);
      }
      expect(s.participants).toEqual(ids(n));
      expect(createTournament('knockout', ids(n), seeded(n))).toEqual(s);
    });
  }

  it('actually shuffles with the rng', () => {
    const draws = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = createTournament('knockout', ids(8), seeded(seed));
      draws.add(round(s, 1).map((p) => `${p.a}-${p.b}`).join(','));
    }
    expect(draws.size).toBeGreaterThan(1);
  });
});

describe('knockout', () => {
  // (b)
  it('plays 4 players through semifinals and final', () => {
    let s = createTournament('knockout', ids(4), seeded(7));
    const [s1, s2] = round(s, 1);
    const semi1 = must(s1);
    const semi2 = must(s2);
    expect(round(s, 2)).toHaveLength(0);
    expect(must(nextPairing(s)).id).toBe(semi1.id);
    s = recordResult(s, semi1.id, win('a'), fixed(0));
    expect(round(s, 2)).toHaveLength(0);
    expect(must(nextPairing(s)).id).toBe(semi2.id);
    s = recordResult(s, semi2.id, win('b'), fixed(0));
    const final = round(s, 2);
    expect(final).toHaveLength(1);
    const f = must(final[0]);
    expect(f.a).toBe(semi1.a);
    expect(f.b).toBe(semi2.b);
    expect(f.result).toBeNull();
    expect(isFinished(s)).toBe(false);
    expect(podium(s)).toEqual([{ rank: 3, ids: sorted([must(semi1.b), must(semi2.a)]) }]);
    s = recordResult(s, f.id, win('b'), fixed(0));
    expect(isFinished(s)).toBe(true);
    expect(nextPairing(s)).toBeNull();
    expect(podium(s)).toEqual([
      { rank: 1, ids: [semi2.b] },
      { rank: 2, ids: [semi1.a] },
      { rank: 3, ids: sorted([must(semi1.b), must(semi2.a)]) },
    ]);
    expect(standings(s).map((r) => r.rank)).toEqual([1, 2, 3, 3]);
  });

  // (c)
  for (let n = 5; n <= 8; n++) {
    it(`advances byes without a game for ${n} players`, () => {
      let s = createTournament('knockout', ids(n), seeded(100 + n));
      const byePlayers = round(s, 1)
        .filter((p) => p.a === null || p.b === null)
        .map((p) => must(p.a ?? p.b));
      const playedRound1 = new Set<string>();
      for (let guard = 0; guard < 20; guard++) {
        const p = nextPairing(s);
        if (!p) break;
        expect(p.a).not.toBeNull();
        expect(p.b).not.toBeNull();
        expect(p.result).toBeNull();
        if (p.round === 1) {
          playedRound1.add(must(p.a));
          playedRound1.add(must(p.b));
        }
        s = recordResult(s, p.id, win('a'), fixed(0));
      }
      expect(isFinished(s)).toBe(true);
      for (const id of byePlayers) {
        expect(playedRound1.has(id)).toBe(false);
        expect(round(s, 2).some((p) => p.a === id || p.b === id)).toBe(true);
      }
    });
  }

  // (d)
  it('decides a match without a winner by rounds won, else by a coin flip', () => {
    const s = createTournament('knockout', ids(4), seeded(3));
    const p = must(nextPairing(s));
    const byScore = recordResult(s, p.id, noWinner(0, 1), fixed(0));
    expect(must(byScore.pairings.find((x) => x.id === p.id)).result).toEqual({
      winner: p.b,
      score: { a: 0, b: 1 },
      decidedBy: 'match',
    });
    const coinA = recordResult(s, p.id, noWinner(1, 1), fixed(0.49));
    expect(must(coinA.pairings.find((x) => x.id === p.id)).result).toEqual({
      winner: p.a,
      score: { a: 1, b: 1 },
      decidedBy: 'coin',
    });
    const coinB = recordResult(s, p.id, noWinner(0, 0), fixed(0.5));
    expect(must(coinB.pairings.find((x) => x.id === p.id)).result?.winner).toBe(p.b);
    expect(must(coinB.pairings.find((x) => x.id === p.id)).result?.decidedBy).toBe('coin');
  });

  it('rejects results for unknown or decided pairings', () => {
    let s = createTournament('knockout', ids(4), seeded(3));
    expect(() => recordResult(s, 'nope', win('a'), fixed(0))).toThrow();
    const p = must(nextPairing(s));
    s = recordResult(s, p.id, win('a'), fixed(0));
    expect(() => recordResult(s, p.id, win('a'), fixed(0))).toThrow();
    const bye = createTournament('knockout', ids(5), seeded(3)).pairings.find((x) => x.b === null || x.a === null);
    expect(() => recordResult(createTournament('knockout', ids(5), seeded(3)), must(bye).id, win('a'), fixed(0))).toThrow();
  });

  // (g)
  it('a forfeited participant loses their open pairing, the opponent advances', () => {
    let s = createTournament('knockout', ids(4), seeded(11));
    const [first, second] = round(s, 1).map((p) => must(p));
    s = markForfeited(s, must(must(first).a), fixed(0));
    expect(s.forfeited).toEqual([first?.a]);
    expect(must(s.pairings.find((p) => p.id === first?.id)).result).toEqual({
      winner: first?.b,
      score: null,
      decidedBy: 'forfeit',
    });
    expect(must(nextPairing(s)).id).toBe(second?.id);
    s = recordResult(s, must(second).id, win('a'), fixed(0));
    expect(must(round(s, 2)[0]).a).toBe(first?.b);
    expect(rankOf(s, must(first?.a))).toBe(3);
  });

  it('a forfeit inside a match counts as a forfeit and sticks', () => {
    let s = createTournament('knockout', ids(4), seeded(12));
    const p = must(nextPairing(s));
    s = recordResult(s, p.id, { winner: 'a', score: { a: 1, b: 0 }, forfeit: 'b' }, fixed(0));
    expect(must(s.pairings.find((x) => x.id === p.id)).result).toEqual({
      winner: p.a,
      score: { a: 1, b: 0 },
      decidedBy: 'forfeit',
    });
    expect(s.forfeited).toEqual([p.b]);
  });

  it('if both are forfeited nobody advances and the next opponent gets a bye', () => {
    let s = createTournament('knockout', ids(8), seeded(13));
    const r1 = round(s, 1).map((p) => must(p));
    const [q1, q2, q3] = r1;
    // the winners of the first two pairings would meet in the semifinal; both drop out while waiting
    s = recordResult(s, must(q1).id, win('a'), fixed(0));
    s = recordResult(s, must(q2).id, win('b'), fixed(0));
    s = markForfeited(s, must(must(q1).a), fixed(0));
    s = markForfeited(s, must(must(q2).b), fixed(0));
    expect(round(s, 2)).toHaveLength(0);
    s = recordResult(s, must(q3).id, win('a'), fixed(0));
    const p4 = must(nextPairing(s));
    s = recordResult(s, p4.id, win('a'), fixed(0));
    const [sf1, sf2] = round(s, 2);
    expect(must(sf1).result).toEqual({ winner: null, score: null, decidedBy: 'forfeit' });
    expect(must(sf2).result).toBeNull();
    s = recordResult(s, must(sf2).id, win('b'), fixed(0));
    const final = must(round(s, 3)[0]);
    expect(final.a).toBeNull();
    expect(final.b).toBe(must(sf2).b);
    expect(final.result).toEqual({ winner: must(sf2).b, score: null, decidedBy: 'bye' });
    expect(isFinished(s)).toBe(true);
    expect(rankOf(s, must(must(q1).a))).toBe(3);
    expect(rankOf(s, must(must(q2).b))).toBe(3);
    expect(podium(s)).toEqual([
      { rank: 1, ids: [must(sf2).b] },
      { rank: 3, ids: sorted([must(must(q1).a), must(must(q2).b), must(must(sf2).a)]) },
    ]);
  });

  it('a forfeit of both in both semifinals still crowns a champion by coin among them', () => {
    let s = createTournament('knockout', ids(4), seeded(14));
    const [semi1, semi2] = round(s, 1).map((p) => must(p));
    s = recordResult(s, must(semi1).id, { winner: null, score: { a: 0, b: 0 }, forfeit: 'both' }, fixed(0));
    expect(must(s.pairings.find((p) => p.id === semi1?.id)).result).toEqual({
      winner: null,
      score: { a: 0, b: 0 },
      decidedBy: 'forfeit',
    });
    expect(sorted(s.forfeited)).toEqual(sorted([must(semi1?.a), must(semi1?.b)]));
    s = recordResult(s, must(semi2).id, { winner: null, score: { a: 1, b: 1 }, forfeit: 'both' }, fixed(0));
    const final = must(round(s, 2)[0]);
    // both final slots are empty: the coin picks among everyone who got furthest (join order)
    expect(final).toMatchObject({ a: null, b: null, result: { winner: 'p1', score: null, decidedBy: 'coin' } });
    expect(isFinished(s)).toBe(true);
    expect(nextPairing(s)).toBeNull();
    expect(podium(s)).toEqual([
      { rank: 1, ids: ['p1'] },
      { rank: 3, ids: ['p2', 'p3', 'p4'] },
    ]);
  });

  describe('the final always produces a champion', () => {
    function toFinal(seed: number): { s: TournamentState; final: Pairing } {
      let s = createTournament('knockout', ids(4), seeded(seed));
      s = playAll(s, (a) => a, fixed(0), 2);
      return { s, final: must(round(s, 2)[0]) };
    }
    const finalResult = (s: TournamentState, final: Pairing) =>
      must(s.pairings.find((p) => p.id === final.id)).result;

    for (const [coin, side] of [
      [0.49, 'a'],
      [0.5, 'b'],
    ] as const) {
      it(`both finalists forfeited → coin flip (rng ${coin} → ${side})`, () => {
        const { s, final } = toFinal(40);
        const after = recordResult(s, final.id, { winner: null, score: { a: 1, b: 1 }, forfeit: 'both' }, fixed(coin));
        const champion = must(final[side]);
        expect(finalResult(after, final)).toEqual({ winner: champion, score: { a: 1, b: 1 }, decidedBy: 'coin' });
        expect(sorted(after.forfeited)).toEqual(sorted([must(final.a), must(final.b)]));
        expect(isFinished(after)).toBe(true);
        expect(rankOf(after, champion)).toBe(1);
        expect(podium(after)[0]).toEqual({ rank: 1, ids: [champion] });
      });

      it(`a final without a winner and a level score → coin flip (rng ${coin} → ${side})`, () => {
        const { s, final } = toFinal(41);
        const after = recordResult(s, final.id, noWinner(1, 1), fixed(coin));
        expect(finalResult(after, final)).toEqual({ winner: final[side], score: { a: 1, b: 1 }, decidedBy: 'coin' });
        expect(podium(after)[0]).toEqual({ rank: 1, ids: [final[side]] });
      });
    }

    it('a final without a winner goes to the side with more rounds won', () => {
      const { s, final } = toFinal(42);
      let calls = 0;
      const counting = () => {
        calls++;
        return 0;
      };
      const after = recordResult(s, final.id, noWinner(0, 1), counting);
      expect(finalResult(after, final)).toEqual({ winner: final.b, score: { a: 0, b: 1 }, decidedBy: 'match' });
      expect(calls).toBe(0);
      const both = recordResult(s, final.id, { winner: null, score: { a: 2, b: 1 }, forfeit: 'both' }, counting);
      expect(finalResult(both, final)).toEqual({ winner: final.a, score: { a: 2, b: 1 }, decidedBy: 'match' });
      expect(calls).toBe(0);
    });

    it('a finalist left alone against an empty slot wins even if forfeited', () => {
      // 8 players: the second semifinal ends with both forfeited, the first semifinal winner drops out
      let s = createTournament('knockout', ids(8), seeded(43));
      s = playAll(s, (a) => a, fixed(0), 4);
      const [sf1, sf2] = round(s, 2).map((p) => must(p));
      s = recordResult(s, must(sf1).id, win('a'), fixed(0));
      s = markForfeited(s, must(must(sf1).a), fixed(0));
      s = recordResult(s, must(sf2).id, { winner: null, score: { a: 0, b: 0 }, forfeit: 'both' }, fixed(0));
      const final = must(round(s, 3)[0]);
      expect(final.result).toEqual({ winner: must(sf1).a, score: null, decidedBy: 'bye' });
      expect(isFinished(s)).toBe(true);
      expect(podium(s)[0]).toEqual({ rank: 1, ids: [must(sf1).a] });
    });
  });
});

describe('round-robin', () => {
  // (e)
  for (const n of [4, 5]) {
    it(`schedules every pairing exactly once for ${n} players`, () => {
      const s = createTournament('roundrobin', ids(n), seeded(n));
      expect(s.pairings).toHaveLength((n * (n - 1)) / 2);
      const keys = s.pairings.map((p) => sorted([must(p.a), must(p.b)]).join('|'));
      expect(new Set(keys).size).toBe(keys.length);
      const rounds = new Set(s.pairings.map((p) => p.round));
      expect(rounds.size).toBe(n % 2 === 0 ? n - 1 : n);
      for (const r of rounds) {
        const people = round(s, r).flatMap((p) => [must(p.a), must(p.b)]);
        expect(new Set(people).size).toBe(people.length);
      }
      const order = s.pairings.map((p) => p.round);
      expect(order).toEqual([...order].sort((x, y) => x - y));
      for (const p of s.pairings) {
        expect(p.bestOf).toBe(3);
        expect(p.tiebreak).toBe(false);
        expect(p.result).toBeNull();
      }
      expect(createTournament('roundrobin', ids(n), seeded(n))).toEqual(s);
    });

    it(`ranks ${n} players by wins`, () => {
      const order = ids(n);
      const s = playAll(createTournament('roundrobin', order, seeded(n + 50)), (a, b) =>
        order.indexOf(a) < order.indexOf(b) ? a : b,
      );
      expect(isFinished(s)).toBe(true);
      const rows = standings(s);
      expect(rows.map((r) => r.participantId)).toEqual(order);
      expect(rows.map((r) => r.rank)).toEqual(order.map((_, i) => i + 1));
      expect(rows.map((r) => r.wins)).toEqual(order.map((_, i) => n - 1 - i));
      expect(rows.every((r) => r.played === n - 1 && r.wins + r.losses === n - 1)).toBe(true);
      expect(must(rows[0]).roundsWon).toBe(2 * (n - 1));
      expect(podium(s)).toEqual([
        { rank: 1, ids: ['p1'] },
        { rank: 2, ids: ['p2'] },
        { rank: 3, ids: ['p3'] },
      ]);
    });
  }

  // (d)
  it('a match without a winner is lost for both', () => {
    const s = createTournament('roundrobin', ids(4), seeded(1));
    const p = must(nextPairing(s));
    const after = recordResult(s, p.id, noWinner(1, 1), fixed(0));
    expect(must(after.pairings.find((x) => x.id === p.id)).result).toEqual({
      winner: null,
      score: { a: 1, b: 1 },
      decidedBy: 'none',
    });
    for (const id of [must(p.a), must(p.b)]) {
      const row = must(standings(after).find((r) => r.participantId === id));
      expect(row).toMatchObject({ played: 1, wins: 0, losses: 1, roundsWon: 1, roundsLost: 1 });
    }
  });

  // (f)
  it('two players level on 1st place play one best-of-1 tie-break match', () => {
    const [A, B, C, D] = ['A', 'B', 'C', 'D'] as const;
    let s = createTournament('roundrobin', [A, B, C, D], seeded(5));
    s = playAll(s, table(['A=B', 'A>C', 'A>D', 'B>C', 'B>D', 'C>D']), fixed(0), 6);
    expect(isFinished(s)).toBe(false);
    expect(podium(s)).toEqual([]);
    const tb = s.pairings.filter((p) => p.tiebreak);
    expect(tb).toHaveLength(1);
    const match = must(tb[0]);
    expect(match.bestOf).toBe(1);
    expect(sorted([must(match.a), must(match.b)])).toEqual([A, B]);
    expect(s.tiebreakRounds).toBe(1);
    expect(must(nextPairing(s)).id).toBe(match.id);
    expect(rankOf(s, A)).toBe(1);
    expect(rankOf(s, B)).toBe(1);
    s = recordResult(s, match.id, win(match.a === B ? 'a' : 'b'), fixed(0));
    expect(isFinished(s)).toBe(true);
    expect(standings(s).map((r) => [r.participantId, r.rank])).toEqual([
      [B, 1],
      [A, 2],
      [C, 3],
      [D, 4],
    ]);
    // tie-break games do not count in the table columns
    expect(must(standings(s).find((r) => r.participantId === B)).wins).toBe(2);
    expect(podium(s)).toEqual([
      { rank: 1, ids: [B] },
      { rank: 2, ids: [A] },
      { rank: 3, ids: [C] },
    ]);
  });

  it('a three-way cycle goes to tie-break round-robins and finally to a coin flip', () => {
    const [A, B, C, D] = ['A', 'B', 'C', 'D'] as const;
    const cycle = table(['A>B', 'B>C', 'C>A', 'A>D', 'B>D', 'C>D']);
    for (const [coin, expected] of [
      [0, A],
      [0.99, C],
    ] as const) {
      let s = createTournament('roundrobin', [A, B, C, D], seeded(9));
      const regular = s.pairings.length;
      for (let rep = 1; rep <= TIEBREAK_MAX_ROUNDS; rep++) {
        s = playAll(s, cycle, fixed(coin), rep === 1 ? regular : 3);
        expect(s.tiebreakRounds).toBe(rep);
        expect(s.coinWinner).toBeNull();
        expect(isFinished(s)).toBe(false);
        const tb = s.pairings.slice(regular).filter((p) => p.round === Math.max(...s.pairings.map((x) => x.round)));
        expect(tb).toHaveLength(3);
        for (const p of tb) {
          expect(p.tiebreak).toBe(true);
          expect(p.bestOf).toBe(1);
          expect([A, B, C]).toContain(p.a);
          expect([A, B, C]).toContain(p.b);
        }
        expect(sorted(tb.map((p) => sorted([must(p.a), must(p.b)]).join('|')))).toEqual(['A|B', 'A|C', 'B|C']);
      }
      s = playAll(s, cycle, fixed(coin), 3);
      expect(nextPairing(s)).toBeNull();
      expect(s.pairings.filter((p) => p.tiebreak)).toHaveLength(3 * TIEBREAK_MAX_ROUNDS);
      expect(s.coinWinner).toBe(expected);
      expect(isFinished(s)).toBe(true);
      const others = sorted([A, B, C].filter((x) => x !== expected));
      expect(podium(s)).toEqual([
        { rank: 1, ids: [expected] },
        { rank: 2, ids: others },
      ]);
      expect(rankOf(s, D)).toBe(4);
    }
  });

  it('splits a partially resolved group before the tie-break match', () => {
    const P = ['A', 'B', 'C', 'D', 'E'];
    // A, B, C have 2 wins each; among them A>C, B>C, A=B → C is 3rd, only A and B play a tie-break.
    let s = createTournament('roundrobin', P, seeded(21));
    s = playAll(s, table(['A=B', 'A>C', 'B>C', 'A>D', 'E>A', 'D>B', 'B>E', 'C>D', 'C>E', 'D=E']), fixed(0), 10);
    const tb = s.pairings.filter((p) => p.tiebreak);
    expect(tb).toHaveLength(1);
    expect(sorted([must(must(tb[0]).a), must(must(tb[0]).b)])).toEqual(['A', 'B']);
    expect(rankOf(s, 'C')).toBe(3);
    expect(rankOf(s, 'D')).toBe(4);
    expect(rankOf(s, 'E')).toBe(4);
    s = playAll(s, table(['A>B']));
    expect(isFinished(s)).toBe(true);
    expect(standings(s).map((r) => r.rank)).toEqual([1, 2, 3, 4, 4]);
    expect(podium(s)).toEqual([
      { rank: 1, ids: ['A'] },
      { rank: 2, ids: ['B'] },
      { rank: 3, ids: ['C'] },
    ]);
  });

  it('re-applies the mini-table to a part of the group that is still tied', () => {
    // A, B, C have 2 wins; among them A>B, B>C, A=C → A 1, B 1, C 0; then A beat B → A 1st.
    let s = createTournament('roundrobin', ['A', 'B', 'C', 'D', 'E'], seeded(24));
    s = playAll(s, table(['A>B', 'A=C', 'B>C', 'A>D', 'E>A', 'D>B', 'B>E', 'C>D', 'C>E', 'D=E']));
    expect(s.pairings.some((p) => p.tiebreak)).toBe(false);
    expect(isFinished(s)).toBe(true);
    expect(standings(s).map((r) => [r.participantId, r.rank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
      ['D', 4],
      ['E', 4],
    ]);
  });

  it('resolves a tie on wins by head-to-head without a tie-break match', () => {
    let s = createTournament('roundrobin', ['A', 'B', 'C', 'D'], seeded(22));
    // A and B have 2 wins, A beat B.
    s = playAll(s, table(['A>B', 'C>A', 'A>D', 'B>C', 'B>D', 'D>C']));
    expect(s.pairings.some((p) => p.tiebreak)).toBe(false);
    expect(isFinished(s)).toBe(true);
    expect(rankOf(s, 'A')).toBe(1);
    expect(rankOf(s, 'B')).toBe(2);
  });

  it('a tie for 2nd place creates no tie-break match and stays shared', () => {
    let s = createTournament('roundrobin', ['A', 'B', 'C', 'D'], seeded(23));
    s = playAll(s, table(['A>B', 'A>C', 'A>D', 'B=C', 'B>D', 'C>D']));
    expect(s.pairings.some((p) => p.tiebreak)).toBe(false);
    expect(isFinished(s)).toBe(true);
    expect(standings(s).map((r) => [r.participantId, r.rank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 2],
      ['D', 4],
    ]);
    expect(podium(s)).toEqual([
      { rank: 1, ids: ['A'] },
      { rank: 2, ids: ['B', 'C'] },
    ]);
  });

  // (g)
  it('a forfeited participant loses all open pairings', () => {
    let s = createTournament('roundrobin', ids(4), seeded(30));
    const p = must(nextPairing(s));
    s = recordResult(s, p.id, win('a'), fixed(0));
    const gone = must(p.a);
    s = markForfeited(s, gone, fixed(0));
    const theirs = s.pairings.filter((x) => x.a === gone || x.b === gone);
    expect(theirs).toHaveLength(3);
    for (const x of theirs) {
      if (x.id === p.id) continue;
      expect(x.result).toEqual({ winner: x.a === gone ? x.b : x.a, score: null, decidedBy: 'forfeit' });
    }
    const row = must(standings(s).find((r) => r.participantId === gone));
    expect(row).toMatchObject({ played: 3, wins: 1, losses: 2 });
    const n = nextPairing(s);
    expect(n?.a).not.toBe(gone);
    expect(n?.b).not.toBe(gone);
    expect(markForfeited(s, gone, fixed(0))).toEqual(s);
    expect(() => markForfeited(s, 'nobody', fixed(0))).toThrow();
  });
});

// (h)
describe('purity', () => {
  it('never mutates its input', () => {
    const list = ids(6);
    const listCopy = structuredClone(list);
    for (const format of ['knockout', 'roundrobin'] as const) {
      const s = createTournament(format, list, seeded(4));
      expect(list).toEqual(listCopy);
      const before = structuredClone(s);
      const p = must(nextPairing(s));
      expect(s).toEqual(before);
      recordResult(s, p.id, win('a'), fixed(0));
      expect(s).toEqual(before);
      recordResult(s, p.id, noWinner(1, 1), fixed(0.2));
      expect(s).toEqual(before);
      markForfeited(s, must(p.b), fixed(0));
      expect(s).toEqual(before);
      settleAutomatic(s, fixed(0));
      standings(s);
      podium(s);
      isFinished(s);
      expect(s).toEqual(before);
    }
    // states right before a tie-break round is created and right before the coin flip
    const cycle = table(['A>B', 'B>C', 'C>A', 'A>D', 'B>D', 'C>D']);
    for (const count of [5, 5 + 3 * TIEBREAK_MAX_ROUNDS]) {
      const s = playAll(createTournament('roundrobin', ['A', 'B', 'C', 'D'], seeded(9)), cycle, fixed(0), count);
      const before = structuredClone(s);
      const p = must(nextPairing(s));
      const after = recordResult(s, p.id, win(cycle(must(p.a), must(p.b)) === p.a ? 'a' : 'b'), fixed(0));
      expect(after.pairings.length > s.pairings.length || after.coinWinner !== null).toBe(true);
      expect(s).toEqual(before);
    }
  });
});

describe('whole tournaments with pseudo-random outcomes', () => {
  const formats: TournamentFormat[] = ['knockout', 'roundrobin'];
  for (const format of formats) {
    for (let n = 4; n <= 8; n++) {
      it(`${format} with ${n} players always terminates sanely`, () => {
        for (let seed = 1; seed <= 40; seed++) {
          const rng = seeded(seed * 31 + n);
          let s = createTournament(format, ids(n), rng);
          let steps = 0;
          for (;;) {
            expect(steps++).toBeLessThan(200);
            const roll = rng();
            if (roll < 0.06) {
              const alive = ids(n).filter((id) => !s.forfeited.includes(id));
              const victim = alive[Math.floor(rng() * alive.length)];
              if (victim !== undefined) s = markForfeited(s, victim, rng);
              continue;
            }
            const p = nextPairing(s);
            if (!p) break;
            expect(p.result).toBeNull();
            expect(p.a).not.toBeNull();
            expect(p.b).not.toBeNull();
            expect(s.forfeited).not.toContain(p.a);
            expect(s.forfeited).not.toContain(p.b);
            const score = { a: Math.floor(rng() * 3), b: Math.floor(rng() * 3) };
            let outcome: MatchOutcome;
            if (roll < 0.2) outcome = { winner: null, score, forfeit: null };
            else if (roll < 0.25)
              outcome = { winner: rng() < 0.5 ? 'a' : 'b', score, forfeit: rng() < 0.5 ? 'a' : 'b' };
            else if (roll < 0.27) outcome = { winner: null, score, forfeit: 'both' };
            else outcome = { winner: rng() < 0.5 ? 'a' : 'b', score, forfeit: null };
            s = recordResult(s, p.id, outcome, rng);
          }
          expect(isFinished(s)).toBe(true);
          expect(s.pairings.every((p) => p.result !== null)).toBe(true);

          const rows = standings(s);
          expect(sorted(rows.map((r) => r.participantId))).toEqual(sorted(ids(n)));
          const ranks = rows.map((r) => r.rank);
          expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
          rows.forEach((r, i) => {
            expect(r.rank).toBeGreaterThanOrEqual(1);
            // knockout ranks are the placement reached; after double forfeits there may be gaps
            if (format === 'roundrobin' || i === 0) expect(r.rank).toBeLessThanOrEqual(i + 1);
            expect(r.wins + r.losses).toBeLessThanOrEqual(r.played);
          });

          const regular = s.pairings.filter((p) => !p.tiebreak && p.a !== null && p.b !== null);
          const keys = regular.map((p) => sorted([must(p.a), must(p.b)]).join('|'));
          expect(new Set(keys).size).toBe(keys.length);
          if (format === 'roundrobin') expect(regular).toHaveLength((n * (n - 1)) / 2);
          expect(s.tiebreakRounds).toBeLessThanOrEqual(TIEBREAK_MAX_ROUNDS);

          const pod = podium(s);
          const podIds = pod.flatMap((e) => e.ids);
          expect(new Set(podIds).size).toBe(podIds.length);
          expect(pod.map((e) => e.rank)).toEqual([...pod.map((e) => e.rank)].sort());
          for (const e of pod) {
            expect(e.ids.length).toBeGreaterThan(0);
            for (const id of e.ids) expect(rankOf(s, id)).toBe(e.rank);
          }
          const first = pod.find((e) => e.rank === 1);
          if (format === 'roundrobin') expect(first?.ids).toHaveLength(1);
          else expect(first === undefined || first.ids.length === 1).toBe(true);
          if (first) expect(rows.filter((r) => r.rank === 1)).toHaveLength(1);
          if (format === 'knockout') {
            // the final always produces a champion
            expect(rows.filter((r) => r.rank === 1)).toHaveLength(1);
            expect(podium(s)[0]?.rank).toBe(1);
          }
        }
      });
    }
  }
});
