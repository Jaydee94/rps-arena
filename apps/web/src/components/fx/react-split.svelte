<script lang="ts">
  /*
   * Split (struck by slash): the sticker is cut in two along a straight diagonal; the upper half slides down
   * the cut and the halves part, showing the panel through the gap. Each half is a decorative copy of the
   * sticker cut with a static clip-path and inked along its cut edge. --sx/--sy/--sr is where each half ends
   * up: the static end pose and the last keyframe both read it (animations.css, "fx: slash / split" and
   * "fx static: slash / split"). Markup only.
   *
   * On screen the cut always rises to the right, across the line to the attacker (so slash.svelte's swoosh,
   * which follows it, is not hidden behind the sticker and the burst). The opponent's sticker is mirrored,
   * so it has its own cut in sticker space (falling to the right) and its own clips and end offsets.
   */
  import GestureIcon from '../GestureIcon.svelte';

  interface Props {
    gesture: string;
    size: number;
  }

  let { gesture, size }: Props = $props();

  /** The cuts in % of the sticker, rim to rim through the centre: own card (rises at 40 deg), opponent's (falls at 52 deg). */
  const CUTS = [
    { side: 'mine', x1: 13, y1: 81, x2: 87, y2: 19 },
    { side: 'theirs', x1: 20.4, y1: 12.2, x2: 79.6, y2: 87.8 },
  ];

  /**
   * Where each half ends up, per card: the upper half slides down the cut and parts from it; the lower one
   * gives a little. The opponent's values are the own ones mirrored along its own cut.
   */
  const HALVES = [
    { kind: 'low', mine: ['2px', '3px', '3deg'], theirs: ['-2px', '3px', '-3deg'] },
    { kind: 'high', mine: ['-13px', '6px', '-8deg'], theirs: ['11px', '9px', '8deg'] },
  ];
</script>

{#snippet cutLines(cls: string)}
  {#each CUTS as cut (cut.side)}
    <line class="{cls} split-cut--{cut.side}" x1={cut.x1} y1={cut.y1} x2={cut.x2} y2={cut.y2} />
  {/each}
{/snippet}

<span class="split" aria-hidden="true">
  {#each HALVES as h (h.kind)}
    <span
      class="split-half split-half--{h.kind}"
      style:--sx-mine={h.mine[0]}
      style:--sy-mine={h.mine[1]}
      style:--sr-mine={h.mine[2]}
      style:--sx-theirs={h.theirs[0]}
      style:--sy-theirs={h.theirs[1]}
      style:--sr-theirs={h.theirs[2]}
    >
      <GestureIcon id={gesture} {size} copy />
      <svg class="art split-edge" viewBox="0 0 100 100" focusable="false">{@render cutLines('')}</svg>
    </span>
  {/each}
  <svg class="art split-flash" viewBox="0 0 100 100" focusable="false">
    {@render cutLines('split-glow')}
    {@render cutLines('st-yellow')}
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
    --sx: var(--sx-mine);
    --sy: var(--sy-mine);
    --sr: var(--sr-mine);
  }

  :global(.theirs) .split-half {
    --sx: var(--sx-theirs);
    --sy: var(--sy-theirs);
    --sr: var(--sr-theirs);
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
  .split-flash .split-glow {
    stroke-width: 10;
  }

  /* One cut per card. */
  .split-cut--theirs,
  :global(.theirs) .split-cut--mine {
    display: none;
  }

  :global(.theirs) .split-cut--theirs {
    display: inline;
  }

  /* Own card: the cut rises to the right; the upper half is the top left one. */
  .split-half--high {
    clip-path: polygon(-15% -15%, 115% -15%, 115% -4.5%, -15% 104.5%);
    transform-origin: 30% 30%;
  }

  .split-half--low {
    clip-path: polygon(115% -4.5%, 115% 115%, -15% 115%, -15% 104.5%);
    transform-origin: 70% 70%;
  }

  /* Opponent's (mirrored) card: the cut falls to the right; the top right half shows as the upper one. */
  :global(.theirs) .split-half--high {
    clip-path: polygon(-0.8% -15%, 115% -15%, 115% 115%, 100.8% 115%);
    transform-origin: 70% 30%;
  }

  :global(.theirs) .split-half--low {
    clip-path: polygon(-15% -15%, -0.8% -15%, 100.8% 115%, -15% 115%);
    transform-origin: 30% 70%;
  }
</style>
