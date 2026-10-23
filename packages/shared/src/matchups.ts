import { gestureBeats, getGestureSet } from './gestures';
import type { GestureSetId } from './gestures';

/** The attack archetype of a winning gesture. */
export type Attack =
  | 'smash'
  | 'slash'
  | 'wrap'
  | 'burn'
  | 'splash'
  | 'gust'
  | 'zap'
  | 'shoot'
  | 'bite'
  | 'punch'
  | 'entangle'
  | 'absorb'
  | 'curse'
  | 'poison';

/** How the losing gesture reacts: one per attack, plus `extinguish` and `cover` which only overrides use. */
export type Reaction =
  | 'crumble'
  | 'split'
  | 'fold'
  | 'char'
  | 'drench'
  | 'blow'
  | 'shock'
  | 'perforate'
  | 'chomp'
  | 'knockback'
  | 'bind'
  | 'squeeze'
  | 'hexed'
  | 'wobble'
  | 'extinguish'
  | 'cover';

export interface Matchup {
  attack: Attack;
  reaction: Reaction;
  /** `${winner}>${loser}` */
  key: string;
}

/** The attack archetype per gesture (all gestures of all five sets). */
export const GESTURE_ATTACK: Readonly<Record<string, Attack>> = Object.freeze({
  rock: 'smash',
  scissors: 'slash',
  paper: 'wrap',
  fire: 'burn',
  water: 'splash',
  air: 'gust',
  lightning: 'zap',
  gun: 'shoot',
  snake: 'bite',
  wolf: 'bite',
  human: 'punch',
  tree: 'entangle',
  sponge: 'absorb',
  devil: 'curse',
  dragon: 'burn',
  lizard: 'poison',
  spock: 'zap',
});

/** The generic reaction of the loser, one per attack archetype. */
export const REACTION_FOR_ATTACK: Readonly<Record<Attack, Reaction>> = Object.freeze({
  smash: 'crumble',
  slash: 'split',
  wrap: 'fold',
  burn: 'char',
  splash: 'drench',
  gust: 'blow',
  zap: 'shock',
  shoot: 'perforate',
  bite: 'chomp',
  punch: 'knockback',
  entangle: 'bind',
  absorb: 'squeeze',
  curse: 'hexed',
  poison: 'wobble',
});

/** Pairs (`winner>loser`) where the generic attack/reaction would look wrong. */
export const PAIR_OVERRIDES: Readonly<Record<string, Partial<Pick<Matchup, 'attack' | 'reaction'>>>> =
  Object.freeze({
    // Water does not soak fire like paper, it puts it out.
    'water>fire': Object.freeze({ reaction: 'extinguish' as const }),

    // The sentence is canon: Spock smashes the scissors, the lizard eats the paper.
    'spock>scissors': Object.freeze({ attack: 'smash' as const }),
    'lizard>paper': Object.freeze({ attack: 'bite' as const }),

    // Fire as the loser: a flame does not char, crumble or get shot full of holes, it goes out.
    'rock>fire': Object.freeze({ reaction: 'extinguish' as const }),
    'air>fire': Object.freeze({ reaction: 'extinguish' as const }),
    'gun>fire': Object.freeze({ reaction: 'extinguish' as const }),
    'lightning>fire': Object.freeze({ reaction: 'extinguish' as const }),
    'dragon>fire': Object.freeze({ reaction: 'extinguish' as const }),
    'devil>fire': Object.freeze({ reaction: 'extinguish' as const }),

    // Nothing to tie up, punch or bite on air and water: they are taken in, blown about or splashed.
    'tree>water': Object.freeze({ attack: 'absorb' as const }),
    'tree>air': Object.freeze({ attack: 'absorb' as const }),
    'human>air': Object.freeze({ attack: 'absorb' as const }),
    'human>water': Object.freeze({ attack: 'absorb' as const }),
    'wolf>air': Object.freeze({ attack: 'gust' as const }),
    'wolf>water': Object.freeze({ reaction: 'drench' as const }),
    'snake>air': Object.freeze({ reaction: 'blow' as const }),
    'snake>water': Object.freeze({ attack: 'slash' as const }),

    // Paper covers its loser like a sheet laid over it instead of taping it up.
    'paper>rock': Object.freeze({ reaction: 'cover' as const }),
    'paper>spock': Object.freeze({ reaction: 'cover' as const }),
    'paper>air': Object.freeze({ reaction: 'cover' as const }),
    'paper>water': Object.freeze({ reaction: 'cover' as const }),
    'paper>lightning': Object.freeze({ reaction: 'cover' as const }),
    'paper>devil': Object.freeze({ reaction: 'cover' as const }),
    'paper>gun': Object.freeze({ reaction: 'cover' as const }),
    'paper>dragon': Object.freeze({ reaction: 'cover' as const }),
  });

const SET_IDS: readonly GestureSetId[] = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15'];

function attackOf(gesture: string): Attack {
  const attack = Object.hasOwn(GESTURE_ATTACK, gesture) ? GESTURE_ATTACK[gesture] : undefined;
  if (!attack) throw new Error(`Unknown gesture "${gesture}" for a matchup`);
  return attack;
}

/**
 * The attack and reaction for `winner` beating `loser`: the generic mapping of the winner's
 * attack, replaced by a pair override where one exists. Throws on an unknown gesture id; it
 * does not check that `winner` really beats `loser`.
 */
export function matchupFor(winner: string, loser: string): Matchup {
  const attack = attackOf(winner);
  attackOf(loser);
  const key = `${winner}>${loser}`;
  const override = Object.hasOwn(PAIR_OVERRIDES, key) ? PAIR_OVERRIDES[key] : undefined;
  const finalAttack = override?.attack ?? attack;
  return {
    attack: finalAttack,
    reaction: override?.reaction ?? REACTION_FOR_ATTACK[finalAttack],
    key,
  };
}

/** Every distinct winner/loser pair of every gesture set, derived from `gestureBeats`. */
export function allRelations(): { winner: string; loser: string }[] {
  const seen = new Set<string>();
  const out: { winner: string; loser: string }[] = [];
  for (const id of SET_IDS) {
    const set = getGestureSet(id);
    for (const winner of set.gestures) {
      for (const loser of gestureBeats(set, winner)) {
        const key = `${winner}>${loser}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ winner, loser });
      }
    }
  }
  return out;
}
