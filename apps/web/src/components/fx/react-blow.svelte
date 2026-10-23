<script lang="ts">
  /*
   * Blow (struck by gust): swoosh marks flick along the sticker's far side while it is pushed back. Decorative,
   * stacked on the sticker and clipped to its disc; the sticker's own shove and tilt live in
   * animations.css ("fx: gust / blow", "fx static: gust / blow"). Markup only; it ignores the overlay
   * props ({ gesture, size }).
   */

  /**
   * Swoosh marks on the sticker's lee side (-x, away from the wind; the sticker's own frame is mirrored
   * for the opponent, so this is always the side away from the attacker), in % of it.
   */
  const LINES = ['M30,14 C18,22 12,32 10,44', 'M28,86 C18,80 12,70 10,58', 'M22,40 C18,46 18,54 22,60'];
</script>

<span class="blow" aria-hidden="true">
  <svg class="art blow-lines" viewBox="0 0 100 100" focusable="false">
    {#each LINES as d (d)}
      <g class="blow-line">
        <path class="blow-under" {d} />
        <path class="blow-top" {d} />
      </g>
    {/each}
  </svg>
</span>

<style>
  .blow {
    position: relative;
    display: block;
    clip-path: circle(50% at 50% 50%);
    pointer-events: none;
  }

  .blow-lines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .blow-line {
    transform-box: fill-box;
    transform-origin: center;
  }

  .blow-under {
    stroke-width: 7;
  }

  .blow-top {
    stroke: var(--white);
    stroke-width: 3;
  }
</style>
