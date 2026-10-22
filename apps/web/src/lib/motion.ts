/** True when the user asked for less motion. Safe where matchMedia is missing (SSR, old jsdom). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Timing knobs shared by code that must stay in step with the CSS animations. Mutable so tests
 * can switch the countdown off (test/setup.ts) or on.
 */
export const motion: { countdownBeatMs: number } = {
  // Must equal --dur-beat in styles/tokens.css.
  countdownBeatMs: 420,
};

/** The reveal countdown shows three beats. */
export const COUNTDOWN_BEATS = 3;

/** Total length of the reveal countdown in milliseconds (0 when switched off). */
export function countdownMs(): number {
  return motion.countdownBeatMs * COUNTDOWN_BEATS;
}
