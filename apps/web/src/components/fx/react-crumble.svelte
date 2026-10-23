<script lang="ts">
  /*
   * Crumble (struck by smash): the sticker breaks into three shards along a jagged crack. The shards are
   * decorative copies of the sticker cut with static clip-paths; a dark disc behind them shows through
   * the cracks once they shift. --sx/--sy/--sr is where each shard ends up: the static end pose and the
   * last keyframe both read it (animations.css, "fx: smash / crumble" and "fx static: smash / crumble").
   * Markup only.
   */
  import GestureIcon from '../GestureIcon.svelte';

  interface Props {
    gesture: string;
    size: number;
  }

  let { gesture, size }: Props = $props();

  // Hairline cracks running off the main crack, in % of the sticker; every shard carries them (clipped to it).
  const CRACKS = [
    '48,52 37,45 31,49 19,38',
    '52,18 41,13 36,4',
    '60,34 71,29 79,33',
    '56,70 68,79 72,92',
    '44,88 33,84 26,90',
  ];
</script>

{#snippet shard(kind: string, sx: string, sy: string, sr: string)}
  <span class="crumble-shard crumble-shard--{kind}" style:--sx={sx} style:--sy={sy} style:--sr={sr}>
    <GestureIcon id={gesture} {size} copy />
    <svg class="art crumble-cracks" viewBox="0 0 100 100" focusable="false">
      {#each CRACKS as points (points)}<polyline {points} />{/each}
    </svg>
  </span>
{/snippet}

<span class="crumble" aria-hidden="true">
  <span class="crumble-gap"></span>
  {@render shard('left', '-2px', '1px', '-4deg')}
  {@render shard('top', '3px', '-1px', '5deg')}
  {@render shard('bottom', '2px', '5px', '6deg')}
</span>

<style>
  /* Stacks exactly on the sticker (the sticker wrapper is a one-cell grid). */
  .crumble,
  .crumble > * {
    display: grid;
    grid-area: 1 / 1;
  }

  /* Nothing leaves the sticker's silhouette (plus its offset shadow): broken, but tidy. */
  .crumble {
    clip-path: circle(54% at 50% 50%);
    pointer-events: none;
  }

  .crumble-shard {
    position: relative;
  }

  /* Out of the grid flow, so it takes the sticker's size instead of setting it. */
  .crumble-cracks {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    stroke-width: 3;
  }

  /* What shows through the cracks: a dark disc inside the sticker's rim. */
  .crumble-gap {
    place-self: center;
    width: 92%;
    height: 92%;
    border-radius: 50%;
    background: var(--line);
  }

  /* Crack: top edge 56% -> 52/18 -> 60/34 -> centre 48/52 -> 56/70 -> 44/88 -> bottom 50%, a branch to the right. */
  .crumble-shard--left {
    clip-path: polygon(-15% -15%, 56% -15%, 52% 18%, 60% 34%, 48% 52%, 56% 70%, 44% 88%, 50% 115%, -15% 115%);
    transform-origin: 0% 50%;
  }

  .crumble-shard--top {
    clip-path: polygon(56% -15%, 115% -15%, 115% 64%, 78% 50%, 66% 58%, 48% 52%, 60% 34%, 52% 18%);
    transform-origin: 90% 10%;
  }

  .crumble-shard--bottom {
    clip-path: polygon(48% 52%, 66% 58%, 78% 50%, 115% 64%, 115% 115%, 50% 115%, 44% 88%, 56% 70%);
    transform-origin: 85% 90%;
  }
</style>
