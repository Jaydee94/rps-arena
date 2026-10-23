<script lang="ts">
  import type { Attack } from '@rps/shared';
  import { attackArt } from './fx';

  interface Props {
    /** The winner's attack, or `clash` for a draw. */
    attack: Attack | 'clash';
    /** Where the effect lands: the losing sticker's side (own side top left, opponent bottom right). */
    side: 'mine' | 'theirs';
  }

  let { attack, side }: Props = $props();

  // Only attacks with a scene file in fx/ render; the others (and `clash` until its task) render nothing.
  const Art = $derived(attackArt(attack));
</script>

<!--
  The effect frame of one duel, centred on the sticker that takes the hit and drawn behind the cards.
  Decorative only. Motion: animations.css (REVEAL, fx sub-sections); without motion the frame stays
  invisible (the scene's last frame is empty anyway), the static end pose lives on the losing sticker.
-->
{#if Art}
  <div class="fx fx--{attack} fx--at-{side}" aria-hidden="true">
    <Art />
  </div>
{/if}

<style>
  .fx {
    /* Sticker edge length and name tag height of PlayerCard: the frame sits on the sticker's centre. */
    --fx-sticker: 138px;
    --fx-tag: 2.3rem;
    --fx-size: calc(var(--fx-sticker) * 2);
    --fx-inset: calc(var(--space-4) + var(--fx-sticker) / 2);
    --fx-inset-block: calc(var(--space-4) + var(--fx-tag) + var(--space-2) + var(--fx-sticker) / 2);
    position: absolute;
    z-index: 2;
    width: var(--fx-size);
    height: var(--fx-size);
    /* Static: invisible. The REVEAL motion rules show the frame only while motion is allowed. */
    opacity: 0;
    pointer-events: none;
  }

  :global(.duel.team) > .fx {
    --fx-sticker: 88px;
    --fx-tag: 1.9rem;
  }

  .fx--at-mine {
    top: var(--fx-inset-block);
    left: var(--fx-inset);
    translate: -50% -50%;
  }

  .fx--at-theirs {
    right: var(--fx-inset);
    bottom: var(--fx-inset-block);
    translate: 50% 50%;
  }

  .fx :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
