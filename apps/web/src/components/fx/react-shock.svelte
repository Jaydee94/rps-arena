<script lang="ts">
  /*
   * Shock (struck by zap): the sticker flashes dark like an X-ray while the current runs through it,
   * then is left frazzled with sparks crackling on it and a little soot. Decorative, stacked on the
   * sticker and clipped to its disc. The end pose lives in animations.css, "fx static: zap / shock".
   * Markup only; it ignores the overlay props ({ gesture, size }).
   */

  /** Small sparks on the sticker, in % of it. */
  const SPARKS = ['16,30 24,24 26,34 36,28', '64,18 72,24 70,14 80,18', '70,74 78,66 80,76 88,70', '14,66 22,72 20,62 30,66'];
</script>

<span class="shock" aria-hidden="true">
  <span class="shock-flash"></span>
  <span class="shock-soot"></span>
  <svg class="art shock-sparks" viewBox="0 0 100 100" focusable="false">
    {#each SPARKS as points (points)}
      <g class="shock-spark">
        <polyline class="shock-under" {points} />
        <polyline class="shock-top" {points} />
      </g>
    {/each}
  </svg>
</span>

<style>
  .shock {
    position: relative;
    display: block;
    clip-path: circle(50% at 50% 50%);
    pointer-events: none;
  }

  .shock > * {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* The X-ray flash: the whole disc goes dark for a blink. */
  .shock-flash {
    background: var(--line);
  }

  .shock-soot {
    background: radial-gradient(circle, transparent 50%, var(--line) 100%);
  }

  .shock-spark {
    transform-box: fill-box;
    transform-origin: center;
  }

  .shock-under {
    stroke-width: 7;
  }

  .shock-top {
    stroke: var(--yellow);
    stroke-width: 3;
  }
</style>
