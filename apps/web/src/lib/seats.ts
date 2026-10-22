import { activeSeats, type RoomView, type SeatId, type Team } from '@rps/shared';

export const teamOf = (seat: SeatId): Team => (seat.startsWith('a') ? 'a' : 'b');

export const otherTeam = (team: Team): Team => (team === 'a' ? 'b' : 'a');

/** Duel opponent: same slot index on the other team (a0 <-> b0, a1 <-> b1). */
export const opponentSeat = (seat: SeatId): SeatId =>
  `${otherTeam(teamOf(seat))}${seat.slice(1)}` as SeatId;

export const isHost = (room: RoomView): boolean => room.you === room.hostSeat;

/** A match can start once every required seat is taken. */
export const canStart = (room: RoomView): boolean =>
  activeSeats(room.config.mode).every((seat) => room.players[seat] !== undefined);
