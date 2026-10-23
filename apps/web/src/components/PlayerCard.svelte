<script lang="ts">
  import { gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import type { StickerFx } from '../lib/matchup-fx';
  import ClashFx from './ClashFx.svelte';
  import { reactionArt } from './fx';
  import GestureIcon from './GestureIcon.svelte';

  interface Props {
    /** Accessible name of the region and first part of the name tag, e.g. "Du" or "Gegner" (nicknames in 2v2). */
    label: string;
    /** The revealed gesture; null or undefined when this seat picked nothing (timeout). */
    gesture?: string | null;
    /** Own side (top left of the reveal panel) or the opponent (bottom right, mirrored). */
    side: 'mine' | 'theirs';
    /** This side lost its duel: the sticker droops (see animations.css). */
    loser?: boolean;
    /** Smaller sticker for the half-height panels of 2v2. */
    compact?: boolean;
    /** Matchup effect hooks of the sticker (`data-fx` plus `attack-*`, `react-*` or `fx-clash`); none without a scene. */
    fx?: StickerFx | null;
  }

  let { label, gesture = null, side, loser = false, compact = false, fx = null }: Props = $props();

  const Reaction = $derived(fx?.reaction ? reactionArt(fx.reaction) : null);
</script>

<!-- One reveal side: a name tag ("Du · Stein") and the big gesture sticker. -->
<section
  class="player {side}"
  class:slam-left={side === 'mine'}
  class:slam-right={side === 'theirs'}
  class:loser
  class:compact
  class:struck={fx?.role === 'loser'}
  aria-label={label}
>
  <p class="tag">
    <span class="who">{label}</span> ·
    {#if gesture}<span class="gesture-name">{t(gestureKey(gesture))}</span>{:else}<span class="gesture-name">{t('board.no_pick')}</span>{/if}
  </p>
  <!-- The stage is the sticker's box, unrotated and unmirrored: the effect frame of an attack on this sticker is centred on it. -->
  <span class="stage">
    {#if fx?.role === 'loser' && fx.attack}<ClashFx attack={fx.attack} {side} />{/if}
    <span class="tilt">
      <span class="reveal-art {fx?.className ?? ''}" data-fx={fx?.role}>
        {#if gesture}
          <GestureIcon id={gesture} size={compact ? 88 : 138} />
          {#if Reaction}<Reaction {gesture} size={compact ? 88 : 138} />{/if}
        {:else}
          <span class="none" aria-hidden="true">?</span>
        {/if}
      </span>
    </span>
  </span>
</section>

<style>
  .player {
    position: absolute;
    z-index: 3;
    display: grid;
    gap: var(--space-2);
    max-width: calc(100% - 2 * var(--space-4));
  }

  .mine {
    /* Matchup effects: the sign of "towards the other sticker" on the y axis of the (mirrored) sticker. */
    --fx-toward: 1;
    top: var(--space-4);
    left: var(--space-4);
    justify-items: start;
  }

  /*
   * In 2v2 the duel result chip hangs top right (--chip-w is set by the duel panel in RevealPanel): the own
   * side stops short of it, so a long name wraps inside the tag instead of running under the chip.
   */
  .mine.compact {
    max-width: calc(100% - 2 * var(--space-4) - var(--chip-w, 0px) - var(--space-2));
  }

  .theirs {
    --fx-toward: -1;
    right: var(--space-4);
    bottom: var(--space-4);
    justify-items: end;
  }

  /* The opponent mirrors the own side: sticker on top, name tag below. */
  .theirs .tag {
    order: 2;
  }

  .tag {
    max-width: 100%;
    padding: 0 var(--space-3);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.04em;
    line-height: 1.3;
    rotate: var(--tilt-1);
  }

  .theirs .tag {
    rotate: var(--tilt-2);
  }

  .compact .tag {
    font-size: var(--text-md);
  }

  /*
   * A struck card (one that hosts an effect frame) lies above the other card, so the chunks and splashes of
   * the attack fly over it; the burst (z-index 4, later in the panel) and the duel chip (5) stay on top.
   */
  .struck {
    z-index: 4;
  }

  .stage {
    position: relative;
    display: grid;
  }

  .tilt {
    display: grid;
    rotate: -10deg;
  }

  /* Mirrored: the opponent's hand points back at the own one. */
  .theirs .tilt {
    rotate: 14deg;
    scale: -1 1;
  }

  .reveal-art {
    display: grid;
  }

  /* One cell: reaction art (components/fx/react-*.svelte) stacks exactly on the sticker. */
  .reveal-art > :global(*) {
    grid-area: 1 / 1;
  }

  .none {
    display: grid;
    place-items: center;
    width: 138px;
    height: 138px;
    border: var(--border);
    border-radius: 50%;
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    font-family: var(--font-display);
    font-size: 5rem;
    line-height: 1;
  }

  /* A question mark must not read mirrored. */
  .theirs .none {
    scale: -1 1;
  }

  .compact .none {
    width: 88px;
    height: 88px;
    font-size: 3.25rem;
  }
</style>
