import { ANNOUNCE_TIMEOUT_MS, PICK_TIMEOUT_MS, REVEAL_MS, type PublicMatch } from '@rps/shared';

const TICK_MS = 250;

/** Milliseconds left until `deadline`; never negative, so clock skew cannot break the UI. */
export const remainingMs = (deadline: number, now: number = Date.now()): number =>
  Math.max(0, deadline - now);

/** Share of the phase that is left, clamped to [0, 1]. */
export const fraction = (remaining: number, total: number): number =>
  total <= 0 ? 0 : Math.min(1, Math.max(0, remaining / total));

export function phaseDuration(phase: PublicMatch['phase']): number {
  if (phase === 'pick') return PICK_TIMEOUT_MS;
  if (phase === 'announce') return ANNOUNCE_TIMEOUT_MS;
  if (phase === 'reveal') return REVEAL_MS;
  return 0;
}

/** Reports the remaining time now and every 250 ms. Returns the cleanup function. */
export function startCountdown(deadline: number, onTick: (remaining: number) => void): () => void {
  const tick = () => onTick(remainingMs(deadline));
  tick();
  const id = setInterval(tick, TICK_MS);
  return () => clearInterval(id);
}
