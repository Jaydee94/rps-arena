<script lang="ts">
  /*
   * Squeeze (struck by absorb): the sticker is wrung out and sucked dry: it ends up squashed narrow, with pinch
   * marks pressing in on both sides and wrinkles crumpling its top and bottom rim where the juice is gone.
   * Decorative, stacked on the sticker and clipped to its disc; the wringing itself (squash, twist, shrink) lives
   * in animations.css ("fx: absorb / squeeze", "fx static: absorb / squeeze"). Markup only; it ignores the
   * overlay props ({ gesture, size }).
   */

  /** Pinch marks pressing in on both sides of the wrung sticker, in % of it. */
  const TWISTS = [
    'M7,28 C17,40 17,60 7,72',
    'M17,35 C24,44 24,56 17,65',
    'M93,28 C83,40 83,60 93,72',
    'M83,35 C76,44 76,56 83,65',
  ];
  /** Wrinkles crumpling its top and bottom rim (zigzag folds), clear of the icon in the middle. */
  const CREASES = ['26,14 33,20 40,13 47,20 54,13 61,20 68,13 75,19', '26,86 33,80 40,87 47,80 54,87 61,80 68,87 75,81'];
</script>

<span class="squeeze" aria-hidden="true">
  <span class="squeeze-dry"></span>
  <svg class="art squeeze-marks" viewBox="0 0 100 100" focusable="false">
    {#each CREASES as points (points)}<polyline class="squeeze-crease-under" {points} />{/each}
    {#each CREASES as points (points)}<polyline class="squeeze-crease" {points} />{/each}
    {#each TWISTS as d (d)}<path class="squeeze-twist" {d} />{/each}
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

  /* Dried out: a pale, dusty film at the rim. */
  .squeeze-dry {
    background: radial-gradient(circle, transparent 50%, var(--brown) 120%);
  }

  .squeeze-twist {
    stroke-width: 4.5;
  }

  /* Creases: a dark fold line with a light edge beside it, like crumpled paper. */
  .squeeze-crease-under {
    stroke: var(--white);
    stroke-width: 5;
    translate: 1.5px 0;
  }

  .squeeze-crease {
    stroke-width: 2.5;
  }
</style>
