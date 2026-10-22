import type { RoomView } from '@rps/shared';
import { countdownMs, prefersReducedMotion } from './motion';

/**
 * True when the transition from `prev` to `next` is the start of a reveal that should be
 * introduced by the countdown. Never during reduced motion or when the countdown is switched off.
 */
export function shouldCountDown(prev: RoomView | null, next: RoomView | null): boolean {
  const before = prev?.match;
  const after = next?.match;
  if (!before || !after) return false;
  return before.phase !== 'reveal' && after.phase === 'reveal' && !prefersReducedMotion() && countdownMs() > 0;
}
