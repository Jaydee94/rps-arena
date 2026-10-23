import { activeSeats, type PlayerView, type SpectatorView, type SeatId, type Team } from '@rps/shared';

export const teamOf = (seat: SeatId): Team => (seat.startsWith('a') ? 'a' : 'b');

export const otherTeam = (team: Team): Team => (team === 'a' ? 'b' : 'a');

/** Duel opponent: same slot index on the other team (a0 <-> b0, a1 <-> b1). */
export const opponentSeat = (seat: SeatId): SeatId =>
  `${otherTeam(teamOf(seat))}${seat.slice(1)}` as SeatId;

/** Whether this viewer hosts the room; the server decides (spectators are never host in stage 1). */
export const isHost = (room: PlayerView | SpectatorView): boolean => room.isHost;

/** A match can start once every required seat is taken. */
export const canStart = (room: PlayerView): boolean =>
  activeSeats(room.config.mode).every((seat) => room.players[seat] !== undefined);
