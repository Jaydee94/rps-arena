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
</script>

<span class="crumble" aria-hidden="true">
  <span class="crumble-gap"></span>
  <span class="crumble-shard crumble-shard--left" style:--sx="-3px" style:--sy="2px" style:--sr="-6deg">
    <GestureIcon id={gesture} {size} copy />
  </span>
  <span class="crumble-shard crumble-shard--top" style:--sx="5px" style:--sy="-2px" style:--sr="8deg">
    <GestureIcon id={gesture} {size} copy />
  </span>
  <span class="crumble-shard crumble-shard--bottom" style:--sx="5px" style:--sy="13px" style:--sr="15deg">
    <GestureIcon id={gesture} {size} copy />
  </span>
</span>

<style>
  /* Stacks exactly on the sticker (the sticker wrapper is a one-cell grid). */
  .crumble,
  .crumble > * {
    display: grid;
    grid-area: 1 / 1;
  }

  .crumble {
    pointer-events: none;
  }

  /* What shows through the cracks: a dark disc, slightly smaller than the sticker. */
  .crumble-gap {
    place-self: center;
    width: 90%;
    height: 90%;
    border-radius: 50%;
    background: var(--line);
  }

  /* Crack: top edge 56% -> 52/18 -> 60/34 -> centre 48/52 -> 56/70 -> 44/88 -> bottom 50%, a branch to the right. */
  .crumble-shard--left {
    clip-path: polygon(-15% -15%, 56% -15%, 52% 18%, 60% 34%, 48% 52%, 56% 70%, 44% 88%, 50% 115%, -15% 115%);
    transform-origin: 30% 50%;
  }

  .crumble-shard--top {
    clip-path: polygon(56% -15%, 115% -15%, 115% 64%, 78% 50%, 66% 58%, 48% 52%, 60% 34%, 52% 18%);
    transform-origin: 75% 25%;
  }

  .crumble-shard--bottom {
    clip-path: polygon(48% 52%, 66% 58%, 78% 50%, 115% 64%, 115% 115%, 50% 115%, 44% 88%, 56% 70%);
    transform-origin: 70% 80%;
  }
</style>
