import type { PublicMatch, PublicPlayer, RoomView, SeatId } from '@rps/shared';
import type { Player, Room } from './room';

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

function publicMatch(match: NonNullable<Room['match']>, seat: SeatId): PublicMatch {
  return {
    config: match.config,
    phase: match.phase,
    round: match.round,
    score: match.score,
    announces: match.announces,
    // Which seats have locked in, never what they picked.
    lockedSeats: Object.keys(match.picks) as SeatId[],
    yourPick: match.picks[seat] ?? null,
    // Only ever holds an already revealed round.
    lastRound: match.lastRound,
    winner: match.winner,
    forfeited: match.forfeited,
  };
}

/**
 * The only way room state reaches a client. Built from an explicit allow-list:
 * no `picks` of other seats and no player `token`.
 */
export function viewFor(room: Room, seat: SeatId): RoomView {
  const players: RoomView['players'] = {};
  for (const [playerSeat, player] of Object.entries(room.players) as [SeatId, Player][]) {
    players[playerSeat] = publicPlayer(player);
  }
  return {
    code: room.code,
    config: room.config,
    you: seat,
    hostSeat: room.hostSeat,
    players,
    match: room.match ? publicMatch(room.match, seat) : null,
    deadline: room.deadline,
  };
}
