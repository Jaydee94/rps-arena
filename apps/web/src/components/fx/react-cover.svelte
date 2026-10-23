<script lang="ts">
  /*
   * Cover (struck by wrap, "paper covers rock"): a ruled sheet of paper drops onto the sticker and lies over
   * it, two corners curling up off the face. The sheet is thin enough that the beaten gesture still shows
   * through it, dimmed. It overhangs the disc only a little at its corners. The static end pose and the last
   * keyframes both show the sheet lying flat with its corners curled (animations.css, "fx: wrap / fold" and
   * "fx static: wrap / fold"). Markup only; it ignores the overlay props ({ gesture, size }).
   */

  interface Props {
    gesture: string;
    size: number;
  }

  // The overlay draws only paper over the real sticker; the props are part of the reaction art contract.
  let { gesture: _gesture, size: _size }: Props = $props();

  /** Ruled lines (y) and how far each runs (x from, x to), in % of the sticker; clear of the curled corners. */
  const RULES = [
    { y: 26, from: 12, to: 74 },
    { y: 38, from: 10, to: 90 },
    { y: 50, from: 10, to: 90 },
    { y: 62, from: 10, to: 90 },
    { y: 74, from: 26, to: 90 },
  ];
</script>

<span class="cover" aria-hidden="true">
  <svg class="art cover-paper" viewBox="0 0 100 100" focusable="false">
    <g class="cover-sheet">
      <!-- The sheet with its top right and bottom left corners turned up (cut off here, drawn as curls below). -->
      <path class="white cover-body" d="M 4,6 H 80 L 96,22 V 94 H 22 L 4,76 Z" />
      {#each RULES as rule (rule.y)}<line class="st-sky cover-rule" x1={rule.from} y1={rule.y} x2={rule.to} y2={rule.y} />{/each}
      <line class="cover-margin" x1="18" y1="10" x2="18" y2="84" />
      <!-- Each curl: the corner lifted off the face, its grey underside showing, rolled at the tip. -->
      <path class="grey cover-curl cover-curl--top" d="M 80,6 Q 79,18 75,26 Q 86,24 96,22 Z" />
      <path class="grey cover-curl cover-curl--bottom" d="M 4,76 Q 16,77 26,71 Q 23,84 22,94 Z" />
    </g>
  </svg>
</span>

<style>
  /* Stacks exactly on the sticker (the sticker wrapper is a one-cell grid); its corners may overhang a little. */
  .cover {
    display: grid;
    grid-area: 1 / 1;
    position: relative;
    pointer-events: none;
  }

  /* Out of the grid flow, so it takes the sticker's size instead of setting it. */
  .cover-paper {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    stroke-width: 3;
  }

  /* Thin paper: the gesture underneath shows through, dimmed. */
  .cover-body {
    fill-opacity: 0.8;
  }

  .cover-rule {
    stroke-width: 1.5;
    stroke-opacity: 0.8;
  }

  .cover-margin {
    stroke: var(--pink);
    stroke-width: 1.5;
    stroke-opacity: 0.8;
  }

  .cover-sheet {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* Each curl lifts off from the middle of its fold line (the cut edge of the sheet). */
  .cover-curl {
    transform-box: fill-box;
  }

  .cover-curl--top {
    transform-origin: 64% 40%;
  }

  .cover-curl--bottom {
    transform-origin: 41% 62%;
  }
</style>
