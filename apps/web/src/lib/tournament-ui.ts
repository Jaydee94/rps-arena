import type { ModeId, PublicParticipant, PublicTournament, RoomView } from '@rps/shared';

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
