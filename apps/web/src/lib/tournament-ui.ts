import type { ModeId, PublicPairing, PublicParticipant, PublicTournament, RoomView } from '@rps/shared';

/** The gesture modes a tournament may use (the server rejects bluff and 2v2). */
export const TOURNAMENT_MODES: readonly ModeId[] = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15'];

/** The tournament of a view, or null for duel rooms. */
export const tournamentOf = (view: RoomView | null): PublicTournament | null => view?.tournament ?? null;

/** The participant with this id (a pairing slot may be a bye = null, or a person who is gone). */
export const participantById = (tournament: PublicTournament, id: string | null): PublicParticipant | undefined =>
  id === null ? undefined : tournament.participants.find((p) => p.id === id);

/** Display name of a participant id; empty when unknown. */
export const participantName = (tournament: PublicTournament, id: string | null): string =>
  participantById(tournament, id)?.nickname ?? '';

/**
 * The pairing that plays next, mirroring the server's `nextPairing`: undecided, both sides real people
 * and neither forfeited. Null when nothing is left to play.
 */
export const upcomingPairing = (tournament: PublicTournament): PublicPairing | null => {
  const out = new Set(tournament.participants.filter((p) => p.forfeited).map((p) => p.id));
  return (
    tournament.pairings.find(
      (p) => p.decidedBy === null && p.a !== null && p.b !== null && !out.has(p.a) && !out.has(p.b),
    ) ?? null
  );
};

/** The pairing that `currentPairingId` points at (in the intermission and when finished: the one that just ended). */
export const currentPairing = (tournament: PublicTournament): PublicPairing | null =>
  tournament.pairings.find((p) => p.id === tournament.currentPairingId) ?? null;

/** Number of knockout rounds, from the size of the first round (later rounds appear only once paired). */
export const knockoutRoundCount = (tournament: PublicTournament): number => {
  const first = tournament.pairings.filter((p) => p.round === 1).length;
  return first > 0 ? Math.round(Math.log2(first * 2)) : 0;
};

/** i18n key and variables naming a round: Final / Semifinal / Round n (knockout), Tie-break, or Round n. */
export function roundLabel(tournament: PublicTournament, pairing: Pick<PublicPairing, 'round' | 'tiebreak'>): {
  key: string;
  vars?: Record<string, number>;
} {
  if (pairing.tiebreak) return { key: 'tournament.tiebreak' };
  if (tournament.format === 'knockout') {
    const total = knockoutRoundCount(tournament);
    if (pairing.round === total) return { key: 'tournament.final' };
    if (pairing.round === total - 1) return { key: 'tournament.semifinal' };
  }
  return { key: 'tournament.round', vars: { n: pairing.round } };
}

export interface BracketColumn {
  round: number;
  /** The round's pairings in order; null for a pairing that does not exist yet. */
  pairings: (PublicPairing | null)[];
}

/** Knockout columns, one per round; rounds that are not paired yet are filled with null placeholders. */
export function bracketColumns(tournament: PublicTournament): BracketColumn[] {
  const total = knockoutRoundCount(tournament);
  const first = tournament.pairings.filter((p) => p.round === 1).length;
  return Array.from({ length: total }, (_, i) => {
    const round = i + 1;
    const known = tournament.pairings.filter((p) => p.round === round && !p.tiebreak);
    const size = Math.max(known.length, Math.ceil(first / 2 ** i));
    return { round, pairings: Array.from({ length: size }, (_, k) => known[k] ?? null) };
  });
}

/** Round-robin position of the current pairing: "match i of n" over every pairing known so far. */
export function matchNumber(tournament: PublicTournament): { i: number; n: number } | null {
  const index = tournament.pairings.findIndex((p) => p.id === tournament.currentPairingId);
  return index < 0 ? null : { i: index + 1, n: tournament.pairings.length };
}

/** Ranks held by more than one participant. */
export const sharedRanks = (tournament: PublicTournament): Set<number> => {
  const seen = new Map<number, number>();
  for (const row of tournament.standings) seen.set(row.rank, (seen.get(row.rank) ?? 0) + 1);
  return new Set([...seen].filter(([, count]) => count > 1).map(([rank]) => rank));
};

/**
 * The pairing to highlight with `aria-current`: the running one during a match, the one that plays next
 * during the draw and the intermission (there `currentPairingId` still names the finished one), none at the end.
 */
export function highlightedPairing(tournament: PublicTournament): { id: string; live: boolean } | null {
  if (tournament.phase === 'match') {
    return tournament.currentPairingId ? { id: tournament.currentPairingId, live: true } : null;
  }
  if (tournament.phase === 'draw' || tournament.phase === 'intermission') {
    const next = upcomingPairing(tournament);
    return next ? { id: next.id, live: false } : null;
  }
  return null;
}

/** The draw: the first round's pairings, plus round-robin participants who sit that round out. */
export function drawSlots(tournament: PublicTournament): { pairings: PublicPairing[]; sittingOut: string[] } {
  const pairings = tournament.pairings.filter((p) => p.round === 1 && !p.tiebreak);
  const seated = new Set(pairings.flatMap((p) => [p.a, p.b]));
  const sittingOut = pairings.length ? tournament.participants.map((p) => p.id).filter((id) => !seated.has(id)) : [];
  return { pairings, sittingOut };
}
