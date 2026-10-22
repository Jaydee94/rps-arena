import type { BotLevel, MatchState, PublicPlayer, RoomConfig, SeatId } from '@rps/shared';

/** Server-side player. `token` is the secret session token and must never reach a client view. */
export type Player = PublicPlayer & { token: string };

/** Full authoritative room state. Clients only ever see `RoomView` (see `viewFor`). */
export interface Room {
  code: string;
  /** Starts at 0; the store increments it by exactly 1 per successful update. */
  version: number;
  config: RoomConfig;
  hostSeat: SeatId;
  players: Partial<Record<SeatId, Player>>;
  match: MatchState | null;
  /** Epoch ms at which the current phase times out, or null if nothing is pending. */
  deadline: number | null;
  botLevel: BotLevel | null;
}
