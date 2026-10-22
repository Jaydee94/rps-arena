import { duel } from '@rps/shared';
import type { BotLevel, GestureSet } from '@rps/shared';

type History = { human: string; bot: string }[];
type Rng = () => number;

/** Probability that the bot sends no bluff emote at all. */
const EMOTE_SKIP_CHANCE = 0.25;
/** Number of most recent rounds the medium bot looks at. */
const MEDIUM_WINDOW = 3;

function pickFrom<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]!;
}

/** All gestures that beat at least one of the targets, as one pool to draw a counter from. */
function countersOf(set: GestureSet, targets: readonly string[]): string[] {
  return set.gestures.filter((g) => targets.some((t) => duel(set, g, t) === 'a'));
}

/** The gestures with the highest count (all of them on a tie). */
function mostFrequent(counts: Map<string, number>): string[] {
  const max = Math.max(...counts.values());
  return [...counts].filter(([, c]) => c === max).map(([g]) => g);
}

function counterTo(set: GestureSet, targets: readonly string[], rng: Rng): string {
  return pickFrom(countersOf(set, targets), rng);
}

function chooseMedium(set: GestureSet, history: History, rng: Rng): string {
  const recent = history.slice(-MEDIUM_WINDOW);
  if (recent.length === 0) return pickFrom(set.gestures, rng);
  const counts = new Map<string, number>();
  for (const { human } of recent) counts.set(human, (counts.get(human) ?? 0) + 1);
  return counterTo(set, mostFrequent(counts), rng);
}

function chooseHard(set: GestureSet, history: History, rng: Rng): string {
  const last = history.at(-1)?.human;
  if (last === undefined) return chooseMedium(set, history, rng);
  // First-order Markov model: what did the human play after each previous occurrence of `last`?
  const followers = new Map<string, number>();
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i]!.human !== last) continue;
    const next = history[i + 1]!.human;
    followers.set(next, (followers.get(next) ?? 0) + 1);
  }
  if (followers.size === 0) return chooseMedium(set, history, rng);
  return counterTo(set, mostFrequent(followers), rng);
}

/**
 * Picks the bot's gesture for the next round. It only receives the finished rounds,
 * never the human's current pick.
 */
export function chooseBotGesture(
  level: BotLevel,
  set: GestureSet,
  history: History,
  rng: Rng = Math.random,
): string {
  switch (level) {
    case 'easy':
      return pickFrom(set.gestures, rng);
    case 'medium':
      return chooseMedium(set, history, rng);
    case 'hard':
      return chooseHard(set, history, rng);
  }
}

/** Optional bluff emote: null (no emote) with ~25% probability, otherwise a gesture of the set. */
export function chooseBotEmote(set: GestureSet, rng: Rng = Math.random): string | null {
  if (rng() < EMOTE_SKIP_CHANCE) return null;
  return pickFrom(set.gestures, rng);
}
