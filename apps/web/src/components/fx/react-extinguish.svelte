<script lang="ts">
  /*
   * Extinguish (fire as the loser): the fire goes out. A wash dims the sticker (grey-blue and wet when
   * water douses it, smoke-grey for every other attacker) and white puffs billow up over it. Decorative,
   * stacked on the sticker and clipped to its disc. The end pose lives in animations.css, "fx static:
   * burn / char, extinguish". Markup only; it ignores the overlay props ({ gesture, size }).
   */

  /** Steam puffs in % of the sticker: centre, radius, and a stagger. */
  const PUFFS = [
    { x: 34, y: 34, r: 15, d: '0ms' },
    { x: 62, y: 28, r: 17, d: '60ms' },
    { x: 48, y: 16, r: 13, d: '120ms' },
    { x: 74, y: 46, r: 11, d: '180ms' },
    { x: 22, y: 52, r: 10, d: '100ms' },
  ];
</script>

<span class="extinguish" aria-hidden="true">
  <span class="extinguish-wash"></span>
  <svg class="art extinguish-steam" viewBox="0 0 100 100" focusable="false">
    {#each PUFFS as puff (puff.x)}
      <circle class="line extinguish-puff" cx={puff.x} cy={puff.y} r={puff.r + 2.5} style:--d={puff.d} />
    {/each}
    {#each PUFFS as puff (puff.x)}
      <circle class="white extinguish-puff" cx={puff.x} cy={puff.y} r={puff.r} style:--d={puff.d} />
    {/each}
  </svg>
</span>

<style>
  .extinguish {
    position: relative;
    display: block;
    clip-path: circle(50% at 50% 50%);
    pointer-events: none;
  }

  .extinguish > * {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* Smothered: the flame underneath goes dull under grey smoke. */
  .extinguish-wash {
    background: radial-gradient(circle at 50% 70%, var(--line) 0%, var(--grey) 75%);
  }

  /* Wet ash, only when water put it out (the splash graphic is in the same card). */
  :global(.player:has(.fx--splash)) .extinguish-wash {
    background: radial-gradient(circle at 50% 70%, var(--grey) 10%, var(--sky) 90%);
  }

  /* The puffs merge into one cloud: every outline sits under every fill. */
  .extinguish-steam circle {
    stroke: none;
  }

  .extinguish-puff {
    transform-box: fill-box;
    transform-origin: center;
  }
</style>
