import type { BotLevel, MatchState, PublicPlayer, PublicSpectator, RoomConfig, SeatId } from '@rps/shared';

/**
 * Server-side player. `token` is the secret session token and must never reach a client view.
 * `socketId` is the one Socket.IO connection currently allowed to act for this seat (null while
 * disconnected, and always for bots); a newer rejoin with the token takes the seat over.
 */
export type Player = PublicPlayer & { token: string; socketId: string | null };

/**
 * Server-side spectator: watches, never plays. Same secrets as a player (`token`, `socketId`).
 * `disconnectedAt` starts the reconnect grace period after which the ticker drops the spectator.
 */
export type Spectator = PublicSpectator & {
  token: string;
  socketId: string | null;
  disconnectedAt: number | null;
};

/** Full authoritative room state. Clients only ever see `RoomView` (see `viewFor`). */
export interface Room {
  code: string;
  /** Starts at 0; the store increments it by exactly 1 per successful update. */
  version: number;
  config: RoomConfig;
  hostSeat: SeatId;
  players: Partial<Record<SeatId, Player>>;
  match: MatchState | null;
  /**
   * Epoch ms at which the ticker must look at the room next: the earliest of `phaseDeadline`,
   * the first reconnect-grace expiry of a disconnected seat and that of a disconnected spectator
   * (the latter only to drop the spectator). Null if nothing is pending.
   */
  deadline: number | null;
  /** Epoch ms at which the current match phase times out (what clients count down to). */
  phaseDeadline: number | null;
  botLevel: BotLevel | null;
  /** Revealed rounds of a bot room (human vs bot gesture), the bot's only knowledge. */
  history: { human: string; bot: string }[];
  /** Seats that asked to skip the current reveal (`game:next`). */
  nextReady: SeatId[];
  /**
   * Consecutive rounds that timed out without any human action (see IDLE_ROUNDS_LIMIT).
   * Optional: rooms stored before this field existed count as 0.
   */
  idleRounds?: number;
  /** Whether a human picked or announced in the current round. Missing counts as false. */
  roundActed?: boolean;
  /**
   * People watching the room (in join order). They never count as players.
   * Optional: rooms stored before this field existed have none (see `spectatorsOf`).
   */
  spectators?: Spectator[];
}

/** The room's spectators; an empty list for rooms stored before spectators existed. */
export function spectatorsOf(room: Room): Spectator[] {
  return room.spectators ?? [];
}
