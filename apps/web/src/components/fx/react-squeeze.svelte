<script lang="ts">
  /*
   * Squeeze (struck by absorb): the sticker is wrung out and sucked dry: squeeze marks press in on its
   * sides and dry cracks show where the juice is gone. Decorative, stacked on the sticker and clipped to its disc;
   * the wringing itself (squash, twist, shrink) lives in animations.css ("fx: absorb / squeeze",
   * "fx static: absorb / squeeze"). Markup only; it ignores the overlay props ({ gesture, size }).
   */

  /** Squeeze marks pressing in on both sides of the wrung sticker, in % of it. */
  const TWISTS = [
    'M8,30 C16,40 16,60 8,70',
    'M17,37 C22,45 22,55 17,63',
    'M92,30 C84,40 84,60 92,70',
    'M83,37 C78,45 78,55 83,63',
  ];
  /** Dry cracks between them. */
  const CRACKS = ['22,40 28,46 26,52', '70,36 76,42 82,40', '46,70 52,64 58,70'];
</script>

<span class="squeeze" aria-hidden="true">
  <span class="squeeze-dry"></span>
  <svg class="art squeeze-marks" viewBox="0 0 100 100" focusable="false">
    {#each TWISTS as d (d)}<path class="squeeze-twist" {d} />{/each}
    {#each CRACKS as points (points)}<polyline class="squeeze-crack" {points} />{/each}
  </svg>
</span>

<style>
  .squeeze {
    position: relative;
    display: block;
    clip-path: circle(50% at 50% 50%);
    pointer-events: none;
  }

  .squeeze > * {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* Dried out: a pale, dusty film over the sticker. */
  .squeeze-dry {
    background: radial-gradient(circle, transparent 40%, var(--brown) 110%);
  }

  .squeeze-twist {
    stroke-width: 3;
  }

  .squeeze-crack {
    stroke-width: 2.5;
  }
</style>
