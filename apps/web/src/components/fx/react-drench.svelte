<script lang="ts">
  /*
   * Drench (struck by splash): water washes over the sticker from the top and hangs off it in drips,
   * drops falling away. Decorative, stacked on the sticker and clipped to its disc. --fall is how far a
   * drop has fallen in the end pose: the static pose and the last keyframe both read it (animations.css, "fx: splash / drench"
   * and "fx static: splash / drench"). Markup only; it ignores the overlay props ({ gesture, size }).
   */

  /**
   * The water running over the sticker's top: a band whose lower edge hangs down in drips (in % of the
   * sticker; the clip trims it to the disc).
   */
  const BAND =
    'M-5,-5 L105,-5 L105,20 C96,20 92,24 88,24 C84,24 84,30 80,34 C76,38 70,36 70,30 C70,24 64,22 58,24' +
    ' C54,26 54,40 48,42 C42,44 40,38 40,30 C40,24 34,22 28,24 C24,26 24,32 20,34 C14,36 12,26 6,22 C2,20 -5,20 -5,20Z';
  /** Drops falling off the band: position (%), and --fall, how far they have dropped in the end pose (art units). */
  const DROPS = [
    { x: 48, y: 50, fall: '10px' },
    { x: 80, y: 42, fall: '6px' },
  ];
  const DROP = 'M0,-6 C3,-2 4,1 4,3 C4,6 2,7 0,7 C-2,7 -4,6 -4,3 C-4,1 -3,-2 0,-6Z';
</script>

<span class="drench" aria-hidden="true">
  <span class="drench-wash"></span>
  <svg class="art drench-drips" viewBox="0 0 100 100" focusable="false">
    <path class="drench-band" d={BAND} />
    {#each DROPS as drop (drop.x)}
      <g transform="translate({drop.x} {drop.y})">
        <path class="blue drench-drop" d={DROP} style:--fall={drop.fall} />
      </g>
    {/each}
  </svg>
</span>

<style>
  .drench {
    position: relative;
    display: block;
    clip-path: circle(50% at 50% 50%);
    pointer-events: none;
  }

  .drench > * {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* Soaked: a light blue film, heaviest at the top. */
  .drench-wash {
    background: linear-gradient(var(--sky), transparent 80%);
  }

  .drench-drips {
    stroke-width: 2.5;
  }

  /* Light water, so the gesture still shows through where the band covers it. */
  .drench-band {
    fill: var(--sky);
    opacity: 0.9;
  }

  .drench-band,
  .drench-drop {
    transform-box: fill-box;
    transform-origin: 50% 0%;
  }
</style>
