import { podium, standings } from '@rps/shared';
import type {
  Pairing,
  PlayerView,
  PublicMatch,
  PublicPairing,
  PublicParticipant,
  PublicPlayer,
  PublicSpectator,
  PublicTournament,
  SeatId,
  SpectatorView,
} from '@rps/shared';
import { spectatorsOf } from './room';
import type { Participant, Player, Room, Spectator } from './room';
import { participantOut } from './settle';
import { participantIdOfSeat } from './tournament';

function publicPlayer(player: Player): PublicPlayer {
  // Explicit field list (not a rest spread) so a future secret field cannot leak by default.
  return {
    seat: player.seat,
    nickname: player.nickname,
    avatar: player.avatar,
    connected: player.connected,
    disconnectedAt: player.disconnectedAt,
    isBot: player.isBot,
  };
}

function publicSpectator(spectator: Spectator): PublicSpectator {
  // Explicit allow-list: never the token, socket id or disconnect time.
  return {
    id: spectator.id,
    nickname: spectator.nickname,
    avatar: spectator.avatar,
    connected: spectator.connected,
  };
}

function publicPlayers(room: Room): PlayerView['players'] {
  const players: PlayerView['players'] = {};
  for (const [playerSeat, player] of Object.entries(room.players) as [SeatId, Player][]) {
    players[playerSeat] = publicPlayer(player);
  }
  return players;
}

/** `seat` is the viewing player's seat; spectators pass `null` and never see a pick. */
function publicMatch(match: NonNullable<Room['match']>, seat: SeatId | null): PublicMatch {
  return {
    config: match.config,
    phase: match.phase,
    round: match.round,
    score: match.score,
    announces: match.announces,
    // Which seats have locked in, never what they picked.
    lockedSeats: Object.keys(match.picks) as SeatId[],
    yourPick: seat ? (match.picks[seat] ?? null) : null,
    // Only ever holds an already revealed round.
    lastRound: match.lastRound,
    winner: match.winner,
    forfeited: match.forfeited,
  };
}

function publicParticipant(room: Room, participant: Participant): PublicParticipant {
  // Explicit allow-list: never the token, socket id or disconnect time.
  return {
    id: participant.id,
    nickname: participant.nickname,
    avatar: participant.avatar,
    connected: participant.connected,
    forfeited: participantOut(room, participant),
  };
}

function publicPairing(pairing: Pairing): PublicPairing {
  return {
    id: pairing.id,
    round: pairing.round,
    a: pairing.a,
    b: pairing.b,
    // The pairing's own length: tie-breaks are best of 1 while `room.config.bestOf` stays 3.
    bestOf: pairing.bestOf,
    tiebreak: pairing.tiebreak,
    winner: pairing.result?.winner ?? null,
    decidedBy: pairing.result?.decidedBy ?? null,
    score: pairing.result?.score ? { a: pairing.result.score.a, b: pairing.result.score.b } : null,
  };
}

/**
 * The tournament layer as `forId` (a participant id, or null for spectators) sees it. Identical
 * for everyone except `youId`: participants are tournament-local ids with public fields only (never
 * a token, socket id or disconnect time); standings and podium come from the pure logic (the
 * podium holds only places that are already settled).
 */
export function tournamentViewFor(room: Room, forId: string | null): PublicTournament {
  const t = room.tournament;
  if (!t) throw new Error('tournamentViewFor: not a tournament room');
  return {
    format: t.format,
    phase: t.phase,
    participants: t.participants.map((p) => publicParticipant(room, p)),
    pairings: t.state ? t.state.pairings.map(publicPairing) : [],
    currentPairingId: t.currentPairingId,
    standings: t.state ? standings(t.state) : [],
    podium: t.state ? podium(t.state) : [],
    youId: forId,
    untilMs: t.untilMs,
  };
}

/**
 * The room as a seated player sees it. Built from an explicit allow-list:
 * no `picks` of other seats and no player or spectator `token`. In a tournament room the seat is
 * one of the running pairing (a0/b0); `isHost` and `tournament.youId` follow the participant id.
 */
export function viewFor(room: Room, seat: SeatId): PlayerView {
  const id = room.tournament ? participantIdOfSeat(room, seat) : null;
  return {
    role: 'player',
    code: room.code,
    config: room.config,
    you: seat,
    hostSeat: room.hostSeat,
    isHost: room.tournament ? id !== null && id === room.tournament.hostId : seat === room.hostSeat,
    players: publicPlayers(room),
    spectators: spectatorsOf(room).map(publicSpectator),
    match: room.match ? publicMatch(room.match, seat) : null,
    tournament: room.tournament ? tournamentViewFor(room, id) : null,
    // The phase timer, not the internal wake-up time (which may be a reconnect-grace expiry).
    deadline: room.phaseDeadline,
  };
}

/**
 * The room as every spectator sees it (identical for all, so it holds no own id). Same allow-list
 * as `viewFor`, but `yourPick` is always `null`: a spectator learns a gesture only through
 * `lastRound` after the reveal.
 */
export function spectatorViewFor(room: Room): SpectatorView {
  return {
    role: 'spectator',
    code: room.code,
    config: room.config,
    hostSeat: room.hostSeat,
    isHost: false,
    me: null,
    players: publicPlayers(room),
    spectators: spectatorsOf(room).map(publicSpectator),
    match: room.match ? publicMatch(room.match, null) : null,
    tournament: room.tournament ? tournamentViewFor(room, null) : null,
    deadline: room.phaseDeadline,
  };
}

/**
 * The own view of a tournament participant who is not on a seat of the running pairing (waiting,
 * eliminated, or forfeited and back as a watcher): the spectator view (never a pick, `yourPick`
 * null) plus `me`, `isHost` and `tournament.youId` for this participant. Sent on the participant's
 * personal channel only.
 */
export function participantViewFor(room: Room, participantId: string): SpectatorView {
  const t = room.tournament;
  if (!t) throw new Error('participantViewFor: not a tournament room');
  return {
    ...spectatorViewFor(room),
    isHost: participantId === t.hostId,
    me: { id: participantId },
    tournament: tournamentViewFor(room, participantId),
  };
}
