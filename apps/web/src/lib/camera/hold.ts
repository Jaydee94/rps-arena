import type { Pose } from './mapping';

export interface HoldOptions {
  /** How long a pose has to be held without interruption. */
  holdMs: number;
  /** Lowest recognizer confidence that still counts as holding the pose. */
  minScore: number;
}

export interface HoldConfirmer {
  /** Feeds one frame; returns the pose once, when it has been held for `holdMs`. */
  push(pose: Pose | null, score: number, nowMs: number): Pose | null;
  /** Hold progress 0..1 as of the last frame (1 once fired, until `reset()`). */
  progress(): number;
  reset(): void;
}

export function createHoldConfirmer({ holdMs, minScore }: HoldOptions): HoldConfirmer {
  let held: Pose | null = null;
  let since = 0;
  let last = 0;
  let fired = false;

  function reset() {
    held = null;
    fired = false;
  }

  return {
    push(pose, score, nowMs) {
      last = nowMs;
      if (fired) return null;
      if (pose === null || score < minScore) {
        held = null;
        return null;
      }
      if (pose !== held) {
        held = pose;
        since = nowMs;
      }
      if (nowMs - since < holdMs) return null;
      fired = true;
      return pose;
    },
    progress() {
      if (fired) return 1;
      return held === null ? 0 : Math.min(1, (last - since) / holdMs);
    },
    reset,
  };
}
