/**
 * Pure tournament logic: draw, pairings, results, standings, tie-break and podium.
 *
 * Every function is pure: no IO, no clock, inputs are never mutated, and randomness only comes
 * from the injected `rng` (draw and coin flips), so tests can run with fixed randomness.
 *
 * Rules (see the tournament plan's Global Constraints):
 * - Knockout: random bracket with byes (never two byes in one pairing), the winner advances.
 *   Next rounds pair the winners in pairing order; a missing winner (both forfeited) leaves a
 *   bye slot. Ranks are the placement reached: champion 1, final loser 2, semifinal losers 3,
 *   quarter-final losers 5 (and players still in the bracket share rank 1 while it runs).
 * - Round-robin: circle method, everyone plays everyone once, ranked by matches won. Ties are
 *   resolved by the head-to-head mini-table among the tied players only. The mini-table is
 *   applied recursively: a group that it splits is split, and each part that is still tied is
 *   ranked again by the mini-table among just its own members. Only a group still tied for 1st
 *   place plays tie-breaks: a best-of-1 round-robin among the group (one match for two players).
 *   Its results refine the order of the whole group with the same recursive mini-table; if 1st
 *   place is still tied, the remaining top group plays another tie-break round-robin, up to
 *   `TIEBREAK_MAX_ROUNDS` tie-break round-robins in total. After that a coin flip
 *   (`coinWinner`) picks 1st place among the remaining top group, the rest of it shares 2nd.
 *   Ties anywhere else stay shared. All matches of one tie-break round-robin share one `round`
 *   number. The table columns (`played`, `wins`, ...) count regular matches only.
 * - Match without a winner: knockout → more rounds won advances, else a coin flip
 *   (`decidedBy: 'coin'`); round-robin → lost for both (`decidedBy: 'none'`).
 * - Forfeit: a forfeited participant (via `markForfeited` or a forfeit inside a match) loses every
 *   open pairing automatically (`decidedBy: 'forfeit'`); if both sides are out nobody wins, and
 *   in the knockout bracket the next opponent gets a bye.
 * - The knockout final always produces a champion. A final without a winner (no-winner match,
 *   both forfeited inside it, or both finalists already out) is decided like any no-winner
 *   knockout match: more rounds won if a score exists, otherwise a coin flip among the finalists
 *   (`decidedBy: 'coin'`, the rng is consumed only then). With one real finalist left and an
 *   empty slot, that finalist wins (`decidedBy: 'bye'`). With both final slots empty, the coin
 *   picks among the participants who got furthest (eliminated in the latest round), in join order.
 *
 * UI-facing notes:
 * - The champion may be a forfeited participant who has already left the room.
 * - A round-robin winner may be forfeited as well (forfeits only lose the remaining pairings).
 * - A semifinal decided by "both forfeited" adds both to the shared 3rd place, so 3rd place can
 *   hold three IDs.
 * - All matches of one tie-break round-robin share one `round` number.
 * - In a running knockout, a forfeited participant still shows rank 1 until their next pairing
 *   exists and is decided automatically.
 */
import { TIEBREAK_MAX_ROUNDS, TOURNAMENT_MAX_PLAYERS, TOURNAMENT_MIN_PLAYERS } from './constants';

export type Rng = () => number;

export type TournamentFormat = 'knockout' | 'roundrobin';

export interface MatchOutcome {
  winner: 'a' | 'b' | null;
  score: { a: number; b: number };
  forfeit: 'a' | 'b' | 'both' | null;
}

export interface PairingResult {
  winner: string | null;
  score: { a: number; b: number } | null;
  decidedBy: 'match' | 'forfeit' | 'coin' | 'bye' | 'none';
}

export interface Pairing {
  id: string;
  round: number;
  /** Participant ID, or null for a bye slot. */
  a: string | null;
  /** Participant ID, or null for a bye slot. */
  b: string | null;
  bestOf: 1 | 3;
  tiebreak: boolean;
  result: PairingResult | null;
}

export interface TournamentState {
  format: TournamentFormat;
  /** Participant IDs in the order they were given (join order); the draw lives in `pairings`. */
  participants: string[];
  /** In playing order. */
  pairings: Pairing[];
  forfeited: string[];
  /** Number of tie-break round-robins created so far (round-robin only). */
  tiebreakRounds: number;
  /** 1st place decided by a coin flip after `TIEBREAK_MAX_ROUNDS` tie-break round-robins. */
  coinWinner: string | null;
}

export interface StandingRow {
  participantId: string;
  played: number;
  wins: number;
  losses: number;
  roundsWon: number;
  roundsLost: number;
  rank: number;
}

export function createTournament(format: TournamentFormat, participantIds: string[], rng: Rng): TournamentState {
  const n = participantIds.length;
  if (n < TOURNAMENT_MIN_PLAYERS || n > TOURNAMENT_MAX_PLAYERS) {
    throw new Error(`a tournament needs ${TOURNAMENT_MIN_PLAYERS} to ${TOURNAMENT_MAX_PLAYERS} participants`);
  }
  if (new Set(participantIds).size !== n) throw new Error('duplicate participant IDs');
  const drawn = shuffle(participantIds, rng);
  const pairings = format === 'knockout' ? knockoutFirstRound(drawn) : roundRobin(drawn, 1, false);
  const state: TournamentState = {
    format,
    participants: [...participantIds],
    pairings,
    forfeited: [],
    tiebreakRounds: 0,
    coinWinner: null,
  };
  return settleAutomatic(state, rng);
}

export function nextPairing(state: TournamentState): Pairing | null {
  const out = new Set(state.forfeited);
  return (
    state.pairings.find(
      (p) => p.result === null && p.a !== null && p.b !== null && !out.has(p.a) && !out.has(p.b),
    ) ?? null
  );
}

export function settleAutomatic(state: TournamentState, rng: Rng): TournamentState {
  let s = state;
  for (;;) {
    const decided = decideAutomatic(s, rng);
    if (decided !== s.pairings) s = { ...s, pairings: decided };
    if (!s.pairings.every((p) => p.result !== null)) return s;

    if (s.format === 'knockout') {
      const last = lastRound(s);
      if (last >= knockoutRounds(s)) return s;
      s = { ...s, pairings: [...s.pairings, ...knockoutNextRound(s, last)] };
      continue;
    }

    const top = rankGroups(s)[0] ?? [];
    if (top.length < 2) return s;
    if (s.tiebreakRounds < TIEBREAK_MAX_ROUNDS) {
      s = {
        ...s,
        pairings: [...s.pairings, ...roundRobin(top, lastRound(s) + 1, true)],
        tiebreakRounds: s.tiebreakRounds + 1,
      };
      continue;
    }
    const coinWinner = top[Math.min(top.length - 1, Math.floor(rng() * top.length))] ?? null;
    return { ...s, coinWinner };
  }
}

export function recordResult(
  state: TournamentState,
  pairingId: string,
  outcome: MatchOutcome,
  rng: Rng,
): TournamentState {
  const pairing = state.pairings.find((p) => p.id === pairingId);
  if (!pairing) throw new Error(`unknown pairing ${pairingId}`);
  if (pairing.result !== null) throw new Error(`pairing ${pairingId} is already decided`);
  const { a, b } = pairing;
  if (a === null || b === null) throw new Error(`pairing ${pairingId} has a bye slot`);

  const score = { ...outcome.score };
  let result: PairingResult;
  let forfeited = state.forfeited;
  if (outcome.forfeit !== null) {
    const gone = outcome.forfeit === 'both' ? [a, b] : [outcome.forfeit === 'a' ? a : b];
    forfeited = [...forfeited, ...gone.filter((id) => !forfeited.includes(id))];
    const winner = outcome.forfeit === 'both' ? null : outcome.forfeit === 'a' ? b : a;
    result =
      winner === null && isKnockoutFinal(state, pairing)
        ? knockoutNoWinner(state, pairing, score, rng)
        : { winner, score, decidedBy: 'forfeit' };
  } else if (outcome.winner !== null) {
    result = { winner: outcome.winner === 'a' ? a : b, score, decidedBy: 'match' };
  } else if (state.format === 'roundrobin') {
    result = { winner: null, score, decidedBy: 'none' };
  } else {
    result = knockoutNoWinner(state, pairing, score, rng);
  }

  const pairings = state.pairings.map((p) => (p.id === pairingId ? { ...p, result } : p));
  return settleAutomatic({ ...state, pairings, forfeited }, rng);
}

export function markForfeited(state: TournamentState, participantId: string, rng: Rng): TournamentState {
  if (!state.participants.includes(participantId)) throw new Error(`unknown participant ${participantId}`);
  const forfeited = state.forfeited.includes(participantId)
    ? state.forfeited
    : [...state.forfeited, participantId];
  return settleAutomatic({ ...state, forfeited }, rng);
}

export function isFinished(state: TournamentState): boolean {
  if (!state.pairings.every((p) => p.result !== null)) return false;
  if (state.format === 'knockout') return lastRound(state) >= knockoutRounds(state);
  return (rankGroups(state)[0]?.length ?? 0) <= 1;
}

export function standings(state: TournamentState): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    state.participants.map((id) => [
      id,
      { participantId: id, played: 0, wins: 0, losses: 0, roundsWon: 0, roundsLost: 0, rank: 1 },
    ]),
  );
  for (const p of state.pairings) {
    if (p.tiebreak || p.result === null || p.a === null || p.b === null) continue;
    const { winner, score } = p.result;
    for (const [id, own, other] of [
      [p.a, score?.a ?? 0, score?.b ?? 0],
      [p.b, score?.b ?? 0, score?.a ?? 0],
    ] as const) {
      const row = rows.get(id);
      if (!row) continue;
      row.played += 1;
      if (winner === id) row.wins += 1;
      else row.losses += 1;
      row.roundsWon += own;
      row.roundsLost += other;
    }
  }

  const ranks = state.format === 'knockout' ? knockoutRanks(state) : roundRobinRanks(state);
  const order = new Map(state.participants.map((id, i) => [id, i]));
  return [...rows.values()]
    .map((row) => ({ ...row, rank: ranks.get(row.participantId) ?? 1 }))
    .sort((x, y) => x.rank - y.rank || (order.get(x.participantId) ?? 0) - (order.get(y.participantId) ?? 0));
}

/**
 * Settled podium places, best first, each with its participants in join order. Knockout: 3rd
 * place once the semifinal round is complete, 1st and 2nd once the final is decided.
 * Round-robin: only after `isFinished`, because tie-breaks can still change the order.
 */
export function podium(state: TournamentState): { rank: 1 | 2 | 3; ids: string[] }[] {
  const rows = standings(state);
  let settled: (rank: number) => boolean;
  if (state.format === 'roundrobin') {
    if (!isFinished(state)) return [];
    settled = () => true;
  } else {
    const total = knockoutRounds(state);
    const complete = (r: number) => {
      const ps = state.pairings.filter((p) => p.round === r);
      return ps.length > 0 && ps.every((p) => p.result !== null);
    };
    settled = (rank) => complete(rank === 3 ? total - 1 : total);
  }
  const out: { rank: 1 | 2 | 3; ids: string[] }[] = [];
  for (const rank of [1, 2, 3] as const) {
    if (!settled(rank)) continue;
    const ids = rows.filter((r) => r.rank === rank).map((r) => r.participantId);
    if (ids.length > 0) out.push({ rank, ids });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

function pairing(round: number, index: number, a: string | null, b: string | null, tiebreak = false): Pairing {
  return { id: `r${round}-${index + 1}`, round, a, b, bestOf: tiebreak ? 1 : 3, tiebreak, result: null };
}

/**
 * First knockout round. Byes go to the pairings at even positions first, then odd ones, so a
 * bye player tends to meet a match winner in round 2; there are always fewer byes than
 * pairings, so no pairing gets two byes.
 */
function knockoutFirstRound(drawn: string[]): Pairing[] {
  let size = 1;
  while (size < drawn.length) size *= 2;
  const count = size / 2;
  const positions = Array.from({ length: count }, (_, i) => i);
  const byeSlots = new Set(
    [...positions.filter((i) => i % 2 === 0), ...positions.filter((i) => i % 2 === 1)].slice(0, size - drawn.length),
  );
  const queue = [...drawn];
  return positions.map((i) => {
    const a = queue.shift() ?? null;
    const b = byeSlots.has(i) ? null : (queue.shift() ?? null);
    return pairing(1, i, a, b);
  });
}

function knockoutRounds(state: TournamentState): number {
  const first = state.pairings.filter((p) => p.round === 1).length;
  return Math.round(Math.log2(first * 2));
}

function lastRound(state: TournamentState): number {
  return state.pairings.reduce((max, p) => Math.max(max, p.round), 0);
}

function knockoutNextRound(state: TournamentState, last: number): Pairing[] {
  const winners = state.pairings.filter((p) => p.round === last).map((p) => p.result?.winner ?? null);
  const next: Pairing[] = [];
  for (let i = 0; i + 1 < winners.length; i += 2) {
    next.push(pairing(last + 1, i / 2, winners[i] ?? null, winners[i + 1] ?? null));
  }
  return next;
}

/** Circle method; odd counts get a sit-out slot, which is skipped (round-robin has no byes). */
function roundRobin(ids: readonly string[], firstRound: number, tiebreak: boolean): Pairing[] {
  let slots: (string | null)[] = ids.length % 2 === 0 ? [...ids] : [...ids, null];
  const n = slots.length;
  const out: Pairing[] = [];
  for (let r = 0; r < n - 1; r++) {
    // a tie-break round-robin is one repetition, so all its matches share one round number
    const round = tiebreak ? firstRound : firstRound + r;
    for (let i = 0; i < n / 2; i++) {
      const a = slots[i] ?? null;
      const b = slots[n - 1 - i] ?? null;
      if (a !== null && b !== null) {
        out.push(pairing(round, out.filter((p) => p.round === round).length, a, b, tiebreak));
      }
    }
    slots = [slots[0] ?? null, slots[n - 1] ?? null, ...slots.slice(1, n - 1)];
  }
  return out;
}

/** Decides open pairings that involve a bye slot or a forfeited participant. */
function decideAutomatic(state: TournamentState, rng: Rng): Pairing[] {
  const forfeited = new Set(state.forfeited);
  let changed = false;
  const pairings = state.pairings.map((p) => {
    if (p.result !== null) return p;
    let result = automaticResult(p, forfeited);
    if (result === null) return p;
    if (result.winner === null && isKnockoutFinal(state, p)) result = knockoutNoWinner(state, p, null, rng);
    changed = true;
    return { ...p, result };
  });
  return changed ? pairings : state.pairings;
}

function automaticResult(p: Pairing, forfeited: Set<string>): PairingResult | null {
  const aOut = p.a === null || forfeited.has(p.a);
  const bOut = p.b === null || forfeited.has(p.b);
  if (!aOut && !bOut) return null;
  if (aOut && bOut) {
    return { winner: null, score: null, decidedBy: p.a === null && p.b === null ? 'none' : 'forfeit' };
  }
  const [gone, winner] = aOut ? [p.a, p.b] : [p.b, p.a];
  return { winner, score: null, decidedBy: gone === null ? 'bye' : 'forfeit' };
}

function isKnockoutFinal(state: TournamentState, p: Pairing): boolean {
  return state.format === 'knockout' && p.round === knockoutRounds(state);
}

/**
 * A knockout pairing without a winner: more rounds won advances, otherwise a coin flip among the
 * pairing's participants. Used for every no-winner match and, for the final only, also when both
 * finalists are out (see the header comment).
 */
function knockoutNoWinner(
  state: TournamentState,
  p: Pairing,
  score: { a: number; b: number } | null,
  rng: Rng,
): PairingResult {
  if (score !== null && score.a !== score.b && p.a !== null && p.b !== null) {
    return { winner: score.a > score.b ? p.a : p.b, score, decidedBy: 'match' };
  }
  const inPairing = [p.a, p.b].filter((id): id is string => id !== null);
  const pool = inPairing.length > 0 ? inPairing : furthest(state, p.round);
  if (pool.length <= 1) return { winner: pool[0] ?? null, score, decidedBy: pool.length === 1 ? 'bye' : 'none' };
  const winner = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] ?? null;
  return { winner, score, decidedBy: 'coin' };
}

/** Participants (join order) eliminated in the latest decided round before `round`. */
function furthest(state: TournamentState, round: number): string[] {
  const reached = new Map<string, number>();
  for (const p of state.pairings) {
    if (p.round >= round || p.result === null) continue;
    for (const id of [p.a, p.b]) if (id !== null) reached.set(id, Math.max(reached.get(id) ?? 0, p.round));
  }
  const best = Math.max(0, ...reached.values());
  return state.participants.filter((id) => reached.get(id) === best);
}

/**
 * Knockout rank = placement reached: still in → 1, lost in round r of R → 2^(R - r) + 1; the
 * final's winner is always rank 1 (even when drawn from earlier rounds, see the header).
 */
function knockoutRanks(state: TournamentState): Map<string, number> {
  const total = knockoutRounds(state);
  const ranks = new Map<string, number>();
  for (const p of state.pairings) {
    if (p.result === null) continue;
    for (const id of [p.a, p.b]) {
      if (id !== null && id !== p.result.winner) ranks.set(id, 2 ** (total - p.round) + 1);
    }
  }
  const champion = state.pairings.find((p) => p.round === total)?.result?.winner;
  if (champion != null) ranks.set(champion, 1);
  return ranks;
}

function roundRobinRanks(state: TournamentState): Map<string, number> {
  const ranks = new Map<string, number>();
  let place = 1;
  for (const group of rankGroups(state)) {
    for (const id of group) ranks.set(id, place);
    place += group.length;
  }
  return ranks;
}

function winsAmong(ids: readonly string[], pairings: readonly Pairing[]): Map<string, number> {
  const members = new Set(ids);
  const wins = new Map(ids.map((id) => [id, 0]));
  for (const p of pairings) {
    const w = p.result?.winner;
    if (w == null || p.a === null || p.b === null || !members.has(p.a) || !members.has(p.b)) continue;
    wins.set(w, (wins.get(w) ?? 0) + 1);
  }
  return wins;
}

/** Splits `ids` (in order) into groups by descending `score`; equal scores stay together. */
function splitBy(ids: readonly string[], score: Map<string, number>): string[][] {
  const values = [...new Set(ids.map((id) => score.get(id) ?? 0))].sort((x, y) => y - x);
  return values.map((v) => ids.filter((id) => (score.get(id) ?? 0) === v));
}

/** Recursive head-to-head mini-table among the members of `group`. */
function miniTable(group: readonly string[], pairings: readonly Pairing[]): string[][] {
  if (group.length < 2) return [[...group]];
  const parts = splitBy(group, winsAmong(group, pairings));
  if (parts.length === 1) return [[...group]];
  return parts.flatMap((part) => miniTable(part, pairings));
}

/** Round-robin order as groups of equally ranked participants, best first. */
function rankGroups(state: TournamentState): string[][] {
  const regular = state.pairings.filter((p) => !p.tiebreak);
  const totals = new Map(state.participants.map((id) => [id, 0]));
  for (const p of regular) {
    const w = p.result?.winner;
    if (w != null) totals.set(w, (totals.get(w) ?? 0) + 1);
  }
  let groups = splitBy(state.participants, totals).flatMap((g) => miniTable(g, regular));

  const tiebreakRounds = [...new Set(state.pairings.filter((p) => p.tiebreak).map((p) => p.round))].sort(
    (x, y) => x - y,
  );
  for (const round of tiebreakRounds) {
    const [top = [], ...rest] = groups;
    if (top.length < 2) break;
    groups = [...miniTable(top, state.pairings.filter((p) => p.round === round)), ...rest];
  }

  const [top = [], ...rest] = groups;
  const coin = state.coinWinner;
  if (coin !== null && top.length > 1 && top.includes(coin)) {
    groups = [[coin], top.filter((id) => id !== coin), ...rest];
  }
  return groups;
}
