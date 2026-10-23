<script lang="ts">
  /*
   * Char (struck by burn): soot creeps in from the rim of the sticker, scorch smudges darken it and two
   * wisps of smoke curl off its top. Decorative, stacked on the sticker and clipped to its disc. The end pose
   * (soot opacity, smoke lift) lives in animations.css, "fx static: burn / char, extinguish".
   * Markup only; it ignores the overlay props ({ gesture, size }): the sticker itself stays underneath.
   */

  /** Scorch smudges near the rim, in % of the sticker. */
  const SMUDGES = [
    'M14,62 C10,52 18,44 26,48 C32,51 30,60 24,64 C20,67 16,67 14,62Z',
    'M70,78 C74,70 84,70 86,76 C88,83 80,88 74,86 C70,85 68,82 70,78Z',
    'M74,22 C80,18 88,24 86,31 C84,36 76,36 73,31 C71,28 71,24 74,22Z',
  ];
</script>

<span class="char" aria-hidden="true">
  <span class="char-soot"></span>
  <svg class="art char-marks" viewBox="0 0 100 100" focusable="false">
    {#each SMUDGES as d (d)}<path class="line char-smudge" {d} />{/each}
    <g class="char-smoke">
      <path class="char-wisp" d="M40,26 C36,22 42,18 39,13 C37,10 40,7 42,5" />
      <path class="char-wisp" d="M58,28 C62,24 56,20 60,15 C62,12 59,9 58,6" />
    </g>
  </svg>
</span>

<style>
  .char {
    position: relative;
    display: block;
    clip-path: circle(50% at 50% 50%);
    pointer-events: none;
  }

  .char > * {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* Soot from the rim inwards: the middle of the sticker stays readable. */
  .char-soot {
    border-radius: 50%;
    background: radial-gradient(circle, transparent 34%, var(--line) 92%);
  }

  .char-smudge {
    stroke: none;
    opacity: 0.55;
  }

  /* Smoke: a grey line on a dark underlay would be heavy here, so a light grey stroke with the art's width. */
  .char-wisp {
    stroke: var(--grey);
    stroke-width: 3;
  }

  .char-smoke {
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }
</style>
