<script lang="ts">
  /*
   * Split (struck by slash): the sticker is cut in two along a straight diagonal; the upper half slides down
   * the cut and the halves part, showing the panel through the gap. Each half is a decorative copy of the
   * sticker cut with a static clip-path and inked along its cut edge. --sx/--sy/--sr is where each half ends
   * up: the static end pose and the last keyframe both read it (animations.css, "fx: slash / split" and
   * "fx static: slash / split"). Markup only.
   */
  import GestureIcon from '../GestureIcon.svelte';

  interface Props {
    gesture: string;
    size: number;
  }

  let { gesture, size }: Props = $props();

  // The cut, in % of the sticker: through the centre, rising to the right at 40 degrees, rim to rim.
  const CUT = { x1: 13, y1: 81, x2: 87, y2: 19 };
</script>

{#snippet half(kind: string, sx: string, sy: string, sr: string)}
  <span class="split-half split-half--{kind}" style:--sx={sx} style:--sy={sy} style:--sr={sr}>
    <GestureIcon id={gesture} {size} copy />
    <svg class="art split-edge" viewBox="0 0 100 100" focusable="false">
      <line x1={CUT.x1} y1={CUT.y1} x2={CUT.x2} y2={CUT.y2} />
    </svg>
  </span>
{/snippet}

<span class="split" aria-hidden="true">
  {@render half('low', '2px', '3px', '3deg')}
  {@render half('high', '-13px', '6px', '-8deg')}
  <svg class="art split-flash" viewBox="0 0 100 100" focusable="false">
    <line class="split-glow" x1={CUT.x1} y1={CUT.y1} x2={CUT.x2} y2={CUT.y2} />
    <line class="st-yellow" x1={CUT.x1} y1={CUT.y1} x2={CUT.x2} y2={CUT.y2} />
  </svg>
</span>

<style>
  /* Stacks exactly on the sticker (the sticker wrapper is a one-cell grid). */
  .split,
  .split > * {
    display: grid;
    grid-area: 1 / 1;
  }

  /* The halves stay close to the sticker's silhouette (plus its offset shadow). */
  .split {
    clip-path: circle(56% at 50% 50%);
    pointer-events: none;
  }

  .split-half {
    position: relative;
  }

  /* Out of the grid flow, so they take the sticker's size instead of setting it. */
  .split-edge,
  .split-flash {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* Drawn on the cut, so each half keeps the outer half of the line: an inked edge. */
  .split-edge {
    stroke-width: 6;
  }

  .split-flash {
    stroke-width: 5;
  }

  /* Dark underlay of the yellow flash line: an outlined tube. */
  .split-glow {
    stroke-width: 10;
  }

  .split-half--high {
    clip-path: polygon(-15% -15%, 115% -15%, 115% -4.5%, -15% 104.5%);
    transform-origin: 30% 30%;
  }

  .split-half--low {
    clip-path: polygon(115% -4.5%, 115% 115%, -15% 115%, -15% 104.5%);
    transform-origin: 70% 70%;
  }
</style>
