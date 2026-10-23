<script lang="ts">
  /*
   * Fold (struck by wrap): two ruled paper flaps fold in over the sides of the sticker and a strip of tape
   * holds them shut, a wrapped parcel with the gesture peeking out in the middle. Inside the sticker's
   * silhouette; the gesture underneath stays the real sticker. The static end pose and the last keyframes
   * both show the parcel closed (animations.css, "fx: wrap / fold" and "fx static: wrap / fold"). Markup only.
   */

  interface Props {
    gesture: string;
    size: number;
  }

  // The overlay draws only paper over the real sticker; the props are part of the reaction art contract.
  let { gesture: _gesture, size: _size }: Props = $props();

  /** Ruled lines on each flap, in % of the sticker. */
  const RULES = [22, 36, 50, 64, 78];
</script>

<span class="fold" aria-hidden="true">
  <svg class="art fold-paper" viewBox="0 0 100 100" focusable="false">
    <g class="fold-flap fold-flap--left">
      <polygon class="white" points="-6,-6 32,-6 24,106 -6,106" />
      {#each RULES as y (y)}<line class="st-sky fold-rule" x1="0" y1={y} x2={31 - y * 0.08} y2={y} />{/each}
      <polygon class="grey nostroke" points="32,-6 27,-6 19,106 24,106" />
    </g>
    <g class="fold-flap fold-flap--right">
      <polygon class="white" points="74,-6 106,-6 106,106 67,106" />
      {#each RULES as y (y)}<line class="st-sky fold-rule" x1={76 - y * 0.06} y1={y} x2="100" y2={y} />{/each}
      <polygon class="grey nostroke" points="74,-6 79,-6 72,106 67,106" />
    </g>
    <g class="fold-tape">
      <polygon class="yellow" points="14,60 88,54 89,65 15,71" />
    </g>
  </svg>
</span>

<style>
  /* Stacks exactly on the sticker (the sticker wrapper is a one-cell grid), clipped to its disc. */
  .fold {
    display: grid;
    grid-area: 1 / 1;
    position: relative;
    clip-path: circle(46% at 50% 50%);
    pointer-events: none;
  }

  /* Out of the grid flow, so it takes the sticker's size instead of setting it. */
  .fold-paper {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    stroke-width: 3;
  }

  .fold-rule {
    stroke-width: 1.5;
  }

  .fold-flap,
  .fold-tape {
    transform-box: fill-box;
  }

  /* Each flap folds in from its outer edge; the tape is pulled across from the left. */
  .fold-flap--left,
  .fold-tape {
    transform-origin: 0% 50%;
  }

  .fold-flap--right {
    transform-origin: 100% 50%;
  }
</style>
