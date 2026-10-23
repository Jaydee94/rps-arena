<script lang="ts">
  /*
   * Hexed (struck by curse): a dark veil falls over the sticker and a ring of pink hex stars keeps circling
   * its face, inside a dotted seal with rune marks branded round its rim. --veil is the veil's end opacity and --orbit how far the star ring has turned: the static end
   * pose and the last keyframe both read them (animations.css, "fx: curse / hexed" and
   * "fx static: curse / hexed"). Markup only.
   */
  interface Props {
    gesture: string;
    size: number;
  }

  // The overlay does not copy the sticker, it only darkens it; the props are part of the reaction contract.
  let { gesture: _gesture, size: _size }: Props = $props();

  /** Hex stars on a ring around the centre, in % of the sticker. */
  const STARS = [0, 72, 144, 216, 288].map((angle) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: 50 + 30 * Math.cos(rad), y: 50 + 30 * Math.sin(rad) };
  });

  /**
   * Rune marks branded between the stars, near the rim (the glyphs of curse.svelte's rune ring), so the hexed end
   * pose reads by its marks, not only by its dim colours.
   */
  const GLYPHS = ['M-4,-5 L4,-5 L0,5 Z', 'M-5,0 L5,0 M0,-5 L0,5', 'M-4,-4 L4,4 M4,-4 L-4,4'];
  const RUNES = [36, 108, 180, 252, 324].map((angle, i) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { at: `translate(${(50 + 38 * Math.cos(rad)).toFixed(1)} ${(50 + 38 * Math.sin(rad)).toFixed(1)}) rotate(${angle})`, d: GLYPHS[i % 3] };
  });
</script>

<span class="hexed" aria-hidden="true" style:--veil="0.24" style:--orbit="160deg">
  <span class="hexed-veil"></span>
  <svg class="art hexed-orbit" viewBox="0 0 100 100" focusable="false">
    <circle class="hexed-seal" cx="50" cy="50" r="44" />
    {#each RUNES as rune (rune.at)}
      <g transform={rune.at}>
        <path class="hexed-rune-under" d={rune.d} />
        <path class="hexed-rune" d={rune.d} />
      </g>
    {/each}
    {#each STARS as star, i (i)}
      <polygon
        class="pink"
        points="0,-8 2,-2 8,0 2,2 0,8 -2,2 -8,0 -2,-2"
        transform="translate({star.x.toFixed(1)} {star.y.toFixed(1)})"
      />
    {/each}
  </svg>
</span>

<style>
  /* Stacks exactly on the sticker (the sticker wrapper is a one-cell grid); stays inside its outline ring. */
  .hexed {
    position: relative;
    display: grid;
    grid-area: 1 / 1;
    clip-path: circle(47% at 50% 50%);
    pointer-events: none;
  }

  /* Out of the grid flow, so they take the sticker's size instead of setting it. */
  .hexed-veil,
  .hexed-orbit {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .hexed-veil {
    border-radius: 50%;
    background: var(--line);
  }

  .hexed-orbit {
    stroke-width: 2.5;
  }

  /* The seal: a dotted pink circle just inside the rim. */
  .hexed-seal {
    stroke: var(--pink);
    stroke-width: 3;
    stroke-dasharray: 0.1 6;
  }

  /* Runes: dark glyphs on a pink underlay, readable on the light sticker and under the veil. */
  .hexed-rune-under {
    stroke: var(--pink);
    stroke-width: 6;
  }

  .hexed-rune {
    stroke-width: 2.5;
  }
</style>
