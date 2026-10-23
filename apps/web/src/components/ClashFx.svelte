<script lang="ts">
  import type { Attack } from '@rps/shared';
  import { attackArt } from './fx';

  interface Props {
    /** The winner's attack, or `clash` for a draw. */
    attack: Attack | 'clash';
    /**
     * Where the effect lands: on the losing sticker of that side (rendered inside its PlayerCard), or at the
     * centre of the panel for a draw (rendered by RevealPanel).
     */
    side: 'mine' | 'theirs' | 'centre';
  }

  let { attack, side }: Props = $props();

  // Only attacks with a scene file in fx/ render; the others (and `clash` until its task) render nothing.
  const Art = $derived(attackArt(attack));
</script>

<!--
  The effect frame of one duel, centred on the box it is rendered in (the struck sticker, or the panel
  centre for a clash). Decorative only. Motion: animations.css (REVEAL, fx sub-sections); without motion
  the frame stays invisible (the scene's last frame is empty anyway), the static end pose lives on the
  losing sticker.
-->
{#if Art}
  <div class="fx fx--{attack} fx--at-{side}" aria-hidden="true">
    <Art />
  </div>
{/if}

<style>
  /*
   * The frame is twice the box it sits in (the sticker's stage in PlayerCard, or the centre slot of the panel
   * for a draw) and centred on it: the art's viewBox -100..100 puts that box at the circle r = 50. Below the
   * card's own content (sticker, name tag), above the panel behind it.
   */
  .fx {
    position: absolute;
    inset: 50% auto auto 50%;
    z-index: -1;
    width: 200%;
    height: 200%;
    translate: -50% -50%;
    /* Static: invisible. The REVEAL motion rules show the frame only while motion is allowed. */
    opacity: 0;
    pointer-events: none;
  }

  .fx :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
