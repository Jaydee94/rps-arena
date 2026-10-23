import { z } from 'zod';
import { normalizeCode } from './codes';
import { BLUFF_EMOTES } from './constants';
import type { ModeId } from './gestures';
import type { MatchState, RoomConfig, RoundResult, SeatId, Team } from './match';
import type { PairingResult, StandingRow, TournamentFormat } from './tournament';

export type BotLevel = 'easy' | 'medium' | 'hard';

export const ERROR_CODES = [
  'room_not_found',
  'room_full',
  'invalid_input',
  'wrong_phase',
  'invalid_gesture',
  'already_picked',
  'not_host',
  'bad_token',
  /** The tournament cannot start with fewer than `TOURNAMENT_MIN_PLAYERS` participants. */
  'not_enough_players',
  /** A spectator sent a game or host event; only players may do that. */
  'not_player',
  /** Too many events from one connection in a short time; the event was dropped. */
  'rate_limited',
  /** Unexpected server-side failure (e.g. no free room code); retrying may help. */
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class ProtocolError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

export const AVATARS: readonly string[] = [
  'fox',
  'robot',
  'cat',
  'owl',
  'panda',
  'dino',
  'alien',
  'ghost',
  'shark',
  'frog',
  'unicorn',
  'penguin',
  'octopus',
  'rabbit',
  'vampire',
  'zombie',
  'yeti',
  'wizard',
  'mermaid',
  'cyclops',
  'astronaut',
  'ninja',
  'pirate',
  'cyborg',
  'hero',
  'viking',
  'pizza',
  'taco',
  'donut',
  'cactus',
  'mushroom',
  'banana',
];

export const NICKNAME_MAX_LENGTH = 16;

// --- Schemas ---------------------------------------------------------------

const MODE_IDS = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15', 'bluff', 'team2v2'] as const;
// Compile-time guard: fails if a ModeId is missing from MODE_IDS.
const _allModesListed: Exclude<ModeId, (typeof MODE_IDS)[number]> extends never ? true : never = true;
void _allModesListed;

const seatSchema = z.enum(['a0', 'a1', 'b0', 'b1']);

const configSchema = z.object({
  mode: z.enum(MODE_IDS),
  bestOf: z.union([z.literal(3), z.literal(5), z.literal(7)]),
});

const nicknameSchema = z
  .string()
  .trim()
  .refine((s) => s.length > 0, 'empty')
  .refine((s) => [...s].length <= NICKNAME_MAX_LENGTH, 'too long')
  .refine((s) => !/\p{Cc}/u.test(s), 'control characters');

const avatarSchema = z.string().refine((s) => AVATARS.includes(s), 'unknown avatar');
const codeSchema = z.string().transform(normalizeCode).pipe(z.string().min(1).max(16));
const emoteSchema = z.string().refine((s) => BLUFF_EMOTES.includes(s), 'unknown emote');
const botLevelSchema = z.enum(['easy', 'medium', 'hard']);
const emptySchema = z.object({});

export const ClientEvents = {
  'room:create': z.object({
    config: configSchema,
    nickname: nicknameSchema,
    avatar: avatarSchema,
    vsBot: botLevelSchema.optional(),
    tournament: z.object({ format: z.enum(['knockout', 'roundrobin']) }).optional(),
  }),
  'room:join': z.object({ code: codeSchema, nickname: nicknameSchema, avatar: avatarSchema }),
  'room:rejoin': z.object({ code: codeSchema, token: z.string().min(1).max(128) }),
  'room:start': emptySchema,
  'seat:move': z.object({ from: seatSchema, to: seatSchema }),
  'game:announce': z.object({ emote: emoteSchema.nullable() }),
  'game:pick': z.object({ gesture: z.string().min(1).max(32) }),
  'game:next': emptySchema,
  'room:rematch': emptySchema,
  'tournament:skip': emptySchema,
} as const;

export type ClientEventName = keyof typeof ClientEvents;
export type ClientEventPayloads = { [K in ClientEventName]: z.infer<(typeof ClientEvents)[K]> };

/** Trims and validates a nickname (1-16 characters, no control characters). */
export function parseNickname(raw: string): string {
  const result = nicknameSchema.safeParse(raw);
  if (!result.success) throw new ProtocolError('invalid_input');
  return result.data;
}

// --- Server -> client view types --------------------------------------------

export interface PublicPlayer {
  seat: SeatId;
  nickname: string;
  avatar: string;
  connected: boolean;
  disconnectedAt: number | null;
  isBot: boolean;
}

export interface PublicMatch {
  config: RoomConfig;
  phase: MatchState['phase'];
  round: number;
  score: MatchState['score'];
  announces: MatchState['announces'];
  lockedSeats: SeatId[];
  yourPick: string | null;
  lastRound: RoundResult | null;
  winner: Team | null;
  forfeited: SeatId[];
}

export interface PublicSpectator {
  id: string;
  nickname: string;
  avatar: string;
  connected: boolean;
}

export interface PublicParticipant {
  id: string;
  nickname: string;
  avatar: string;
  connected: boolean;
  forfeited: boolean;
}

export interface PublicPairing {
  id: string;
  round: number;
  /** Participant ID, or null for a bye slot. */
  a: string | null;
  /** Participant ID, or null for a bye slot. */
  b: string | null;
  bestOf: 1 | 3;
  tiebreak: boolean;
  winner: string | null;
  decidedBy: PairingResult['decidedBy'] | null;
  score: { a: number; b: number } | null;
}

export interface PublicTournament {
  format: TournamentFormat;
  phase: 'lobby' | 'draw' | 'match' | 'intermission' | 'finished';
  participants: PublicParticipant[];
  pairings: PublicPairing[];
  currentPairingId: string | null;
  standings: StandingRow[];
  podium: { rank: 1 | 2 | 3; ids: string[] }[];
  /** The viewer's own participant ID, or null (e.g. for spectators). */
  youId: string | null;
  /** The host's participant ID (public, never a token); null only if no host exists. It moves on host succession. */
  hostId: string | null;
  /** End of the draw or intermission (epoch ms), otherwise null. */
  untilMs: number | null;
}

/** The room as seen by a seated player. */
export interface PlayerView {
  role: 'player';
  code: string;
  config: RoomConfig;
  you: SeatId;
  hostSeat: SeatId;
  isHost: boolean;
  players: Partial<Record<SeatId, PublicPlayer>>;
  spectators: PublicSpectator[];
  match: PublicMatch | null;
  tournament: PublicTournament | null;
  deadline: number | null;
}

/**
 * The room as seen by a spectator; identical for all spectators. `match.yourPick` is always
 * `null`. In stage 1 `isHost` is always `false` and `me` always `null`.
 */
export interface SpectatorView {
  role: 'spectator';
  code: string;
  config: RoomConfig;
  hostSeat: SeatId;
  isHost: boolean;
  me: { id: string } | null;
  players: Partial<Record<SeatId, PublicPlayer>>;
  spectators: PublicSpectator[];
  match: PublicMatch | null;
  tournament: PublicTournament | null;
  deadline: number | null;
}

export type RoomView = PlayerView | SpectatorView;

/**
 * Sent only to the socket that just created, joined or rejoined a room. The token is the secret
 * session credential for `room:rejoin`; it never appears in `room:state`. `seat` is `null` for
 * spectators.
 */
export interface RoomJoined {
  code: string;
  token: string;
  role: 'player' | 'spectator';
  seat: SeatId | null;
}

export type ServerEvents = {
  'room:joined': RoomJoined;
  'room:state': RoomView;
  'room:error': { code: ErrorCode; message: string };
};
