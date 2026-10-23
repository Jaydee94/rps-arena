<script lang="ts">
  /*
   * Blow (struck by gust): bold swoosh marks and a wind curl flick along the sticker's far side while it is
   * pushed back; they stay on it as the trace of the gust. Decorative, stacked on the sticker and clipped to its
   * disc; the sticker's own shove and tilt live in animations.css ("fx: gust / blow", "fx static: gust / blow").
   * Markup only; it ignores the overlay props ({ gesture, size }).
   */

  /**
   * Swoosh marks on the sticker's lee side (-x, away from the wind; the sticker's own frame is mirrored
   * for the opponent, so this is always the side away from the attacker), in % of it.
   */
  const LINES = [
    'M36,10 C20,18 11,30 9,44',
    'M34,90 C20,82 11,70 9,56',
    'M24,36 C18,44 18,56 24,64',
    'M46,24 C36,30 32,38 31,46 C31,52 36,54 39,50 C41,46 37,43 35,46',
  ];
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
    stroke-width: 11;
  }

  .blow-top {
    stroke: var(--white);
    stroke-width: 5;
  }
</style>
