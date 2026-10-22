import { getGestureSet } from './gestures';

/** Time a player has to pick a gesture. */
export const PICK_TIMEOUT_MS = 20_000;
/** Time a player has to announce (or skip) a bluff emote. */
export const ANNOUNCE_TIMEOUT_MS = 8_000;
/**
 * How long a round result stays on screen before the next round. Includes the client-side
 * reveal countdown (Schnick, Schnack, Schnuck) of about 1.26 s.
 */
export const REVEAL_MS = 5_500;
/** How long a disconnected player may rejoin before forfeiting. */
export const RECONNECT_GRACE_MS = 30_000;
/**
 * A match ends as abandoned (finished, no winner) after this many consecutive rounds that timed
 * out without any human pick or announce, so idle or ghost rooms stop ticking and expire.
 */
export const IDLE_ROUNDS_LIMIT = 3;
/** Lifetime of an idle room, in seconds. */
export const ROOM_TTL_S = 1800;
/** Maximum number of spectators in one room; further joins get `room_full`. */
export const MAX_SPECTATORS = 16;

/** Emotes a player may announce in bluff mode: the gestures of the bluff set (lizard-spock). */
export const BLUFF_EMOTES: readonly string[] = getGestureSet('lizard-spock').gestures;
