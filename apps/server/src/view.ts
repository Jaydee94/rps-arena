import type {
  PlayerView,
  PublicMatch,
  PublicPlayer,
  PublicSpectator,
  SeatId,
  SpectatorView,
} from '@rps/shared';
import { spectatorsOf } from './room';
import type { Player, Room, Spectator } from './room';

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

/**
 * The room as a seated player sees it. Built from an explicit allow-list:
 * no `picks` of other seats and no player or spectator `token`.
 */
export function viewFor(room: Room, seat: SeatId): PlayerView {
  return {
    role: 'player',
    code: room.code,
    config: room.config,
    you: seat,
    hostSeat: room.hostSeat,
    isHost: seat === room.hostSeat,
    players: publicPlayers(room),
    spectators: spectatorsOf(room).map(publicSpectator),
    match: room.match ? publicMatch(room.match, seat) : null,
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
    deadline: room.phaseDeadline,
  };
}
