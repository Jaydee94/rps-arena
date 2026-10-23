/**
 * The matchup scene of one duel of the reveal: which side attacks with what, how the other side reacts,
 * and the verb sentence of the rule line. Shared by the board and the spectator view (RevealPanel).
 */
import { matchupFor, type Attack, type Reaction, type SeatId } from '@rps/shared';
import type { DuelView } from './board';
import { gestureKey } from './gestures-ui';
import { hasKey, t } from './i18n';

export type FxSide = 'mine' | 'theirs';

/** A decided duel with both picks: the winner attacks, the loser reacts. */
export interface DecidedScene {
  kind: 'decided';
  winner: FxSide;
  loser: FxSide;
  winnerGesture: string;
  loserGesture: string;
  attack: Attack;
  reaction: Reaction;
}

/** A draw with both picks: both stickers clash (the clash scene is built separately). */
export interface DrawScene {
  kind: 'draw';
}

export type DuelScene = DecidedScene | DrawScene;

type Picks = Partial<Record<SeatId, string>>;

/** The scene of a duel; null when a pick is missing (timeout) or a gesture is unknown. */
export function sceneFor(duel: DuelView, picks: Picks): DuelScene | null {
  const mine = picks[duel.mine];
  const theirs = picks[duel.theirs];
  if (!mine || !theirs) return null;
  if (duel.outcome === 'draw') return { kind: 'draw' };
  const winner: FxSide = duel.outcome === 'win' ? 'mine' : 'theirs';
  const [winnerGesture, loserGesture] = winner === 'mine' ? [mine, theirs] : [theirs, mine];
  try {
    const { attack, reaction } = matchupFor(winnerGesture, loserGesture);
    return { kind: 'decided', winner, loser: winner === 'mine' ? 'theirs' : 'mine', winnerGesture, loserGesture, attack, reaction };
  } catch {
    return null;
  }
}

function ruleSentence(winner: string, loser: string, winnerName: string): string {
  const key = `rule.${winner}.${loser}`;
  return t(hasKey(key) ? key : 'rule.generic', { winner: winnerName, loser: t(gestureKey(loser)) });
}

/** "Rock crushes Scissors" for a decided duel, the generic sentence for a pair without a verb; else null. */
export function ruleFor(duel: DuelView, picks: Picks): string | null {
  const mine = picks[duel.mine];
  const theirs = picks[duel.theirs];
  if (duel.outcome === 'draw' || !mine || !theirs) return null;
  const [winner, loser] = duel.outcome === 'win' ? [mine, theirs] : [theirs, mine];
  return ruleSentence(winner, loser, t(gestureKey(winner)));
}

/**
 * What `gesture` does to each of `targets`, as the verbs of the reveal rule lines without their subject:
 * "crushes Scissors, scares Wolf". The subject stays the same, so the verbs agree with it.
 */
export function actionsOf(gesture: string, targets: readonly string[]): string {
  return targets.map((target) => ruleSentence(gesture, target, '').trim()).join(', ');
}

/** "Rock crushes Scissors, scares Wolf": the gesture's name followed by what it does. */
export function doesSentence(gesture: string, targets: readonly string[]): string {
  return `${t(gestureKey(gesture))} ${actionsOf(gesture, targets)}`;
}

/** The effect hooks of one reveal sticker: `data-fx` and its class (`attack-*`, `react-*` or `fx-clash`). */
export interface StickerFx {
  role: 'winner' | 'loser' | 'draw';
  className: string;
  /** The reaction of a losing sticker (selects its overlay art); null otherwise. */
  reaction: Reaction | null;
  /** The attack that strikes a losing sticker (its PlayerCard renders the effect frame); null otherwise. */
  attack: Attack | null;
}

export function stickerFx(scene: DuelScene | null, side: FxSide): StickerFx | null {
  if (!scene) return null;
  if (scene.kind === 'draw') return { role: 'draw', className: 'fx-clash', reaction: null, attack: null };
  return scene.winner === side
    ? { role: 'winner', className: `attack-${scene.attack}`, reaction: null, attack: null }
    : { role: 'loser', className: `react-${scene.reaction}`, reaction: scene.reaction, attack: scene.attack };
}
