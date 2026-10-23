/**
 * DEV-ONLY helpers of the matchup effect gallery (`?demo=fxgallery`) and the looping single scene
 * (`?demo=fx`). Only lib/demo.ts and the gallery components use them, so they never reach a production build.
 */
import { allRelations, GESTURE_ATTACK, matchupFor, PAIR_OVERRIDES, REACTION_FOR_ATTACK, type Attack, type Reaction } from '@rps/shared';

/** The 14 attack archetypes in the order of the model (smash, slash, wrap, ...): the gallery groups. */
export const ATTACKS: readonly Attack[] = Object.keys(REACTION_FOR_ATTACK) as Attack[];

/** The gesture both sides show in the draw card (the clash scene does not depend on the gesture). */
export const DRAW_GESTURE = 'rock';

/** One decided pair of the gallery. */
export interface GalleryEntry {
  winner: string;
  loser: string;
  /** `${winner}>${loser}` */
  key: string;
  attack: Attack;
  reaction: Reaction;
  /** A pair override (PAIR_OVERRIDES) changes the generic attack or reaction of this pair. */
  override: boolean;
}

export interface GalleryGroup {
  attack: Attack;
  entries: GalleryEntry[];
}

export function galleryEntry(winner: string, loser: string): GalleryEntry {
  const { attack, reaction, key } = matchupFor(winner, loser);
  return { winner, loser, key, attack, reaction, override: Object.hasOwn(PAIR_OVERRIDES, key) };
}

/** Every gesture in the order it first appears in `relations` (as winner or loser). */
function gestureOrder(relations: readonly { winner: string; loser: string }[]): Map<string, number> {
  const order = new Map<string, number>();
  for (const { winner, loser } of relations) {
    if (!order.has(winner)) order.set(winner, order.size);
    if (!order.has(loser)) order.set(loser, order.size);
  }
  return order;
}

/**
 * The relations grouped by the attack of their matchup (after overrides), groups in ATTACKS order, empty
 * groups left out. Inside a group the pairs are sorted by winner, then loser, in the order the gestures
 * first appear in `relations` (rock, scissors, paper, ... for allRelations()).
 */
export function galleryGroups(relations: readonly { winner: string; loser: string }[] = allRelations()): GalleryGroup[] {
  const order = gestureOrder(relations);
  const rank = (g: string) => order.get(g) ?? Number.MAX_SAFE_INTEGER;
  const entries = relations
    .map(({ winner, loser }) => galleryEntry(winner, loser))
    .sort((x, y) => rank(x.winner) - rank(y.winner) || rank(x.loser) - rank(y.loser));
  return ATTACKS.map((attack) => ({ attack, entries: entries.filter((e) => e.attack === attack) })).filter(
    (g) => g.entries.length > 0,
  );
}

/** The pair of a `?demo=fx` URL: a decided pair (winner first) or a draw (both the same gesture). */
export type FxPair = { kind: 'decided'; winner: string; loser: string } | { kind: 'draw'; gesture: string };

/**
 * Reads winner=/loser= (or a=/b=) from the URL. Equal gestures are a draw. A pair given the wrong way round
 * (loser beats winner) is turned around. Null for a missing or unknown gesture, or two gestures that never
 * meet in any gesture set.
 */
export function parseFxPair(params: URLSearchParams, relations = allRelations()): FxPair | null {
  const a = params.get('winner') ?? params.get('a');
  const b = params.get('loser') ?? params.get('b');
  if (!a || !b || !Object.hasOwn(GESTURE_ATTACK, a) || !Object.hasOwn(GESTURE_ATTACK, b)) return null;
  if (a === b) return { kind: 'draw', gesture: a };
  if (relations.some((r) => r.winner === a && r.loser === b)) return { kind: 'decided', winner: a, loser: b };
  if (relations.some((r) => r.winner === b && r.loser === a)) return { kind: 'decided', winner: b, loser: a };
  return null;
}

/** The URL of the looping single scene of a pair (a draw when winner and loser are the same gesture). */
export function fxHref(winner: string, loser: string): string {
  return `?demo=fx&winner=${encodeURIComponent(winner)}&loser=${encodeURIComponent(loser)}`;
}

/**
 * The previous and next pair around `key` in the flat gallery order (all groups, then the draw), wrapping
 * around at both ends; the draw has the key `draw`. Null for an unknown key.
 */
export function neighbours(groups: readonly GalleryGroup[], key: string): { prev: string; next: string } | null {
  const hrefs = [
    ...groups.flatMap((g) => g.entries.map((e) => ({ key: e.key, href: fxHref(e.winner, e.loser) }))),
    { key: 'draw', href: fxHref(DRAW_GESTURE, DRAW_GESTURE) },
  ];
  const i = hrefs.findIndex((h) => h.key === key);
  if (i < 0) return null;
  const at = (j: number) => hrefs[(j + hrefs.length) % hrefs.length]!.href;
  return { prev: at(i - 1), next: at(i + 1) };
}
