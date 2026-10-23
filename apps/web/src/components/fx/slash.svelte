<script lang="ts">
  /*
   * Slash (scissors): one long white blade swoosh cuts diagonally through the struck sticker, with speed lines
   * along it and sparks where the blade leaves the rim. The cut runs along the split line of react-split, so
   * the swoosh is mirrored for the opponent's (mirrored) sticker. Frame: the sticker is the circle r = 50
   * around 0,0. Markup only; motion: animations.css, "fx: slash / split".
   */

  /** Sparks at both ends of the cut (along the swoosh, which runs on the x axis of the aim group). */
  const SPARKS = [
    { x: -76, y: 8, s: 1 },
    { x: 80, y: -6, s: 1.25 },
    { x: 64, y: 16, s: 0.7 },
  ];

  /** Speed lines parallel to the swoosh: offset across it and their length. */
  const LINES = [
    { y: -24, x1: -70, x2: 30 },
    { y: 22, x1: -30, x2: 74 },
    { y: 34, x1: -84, x2: -20 },
  ];

  // A 4-point twinkle star around 0,0.
  const SPARK = '0,-16 4,-4 16,0 4,4 0,16 -4,4 -16,0 -4,-4';
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <g class="slash-aim">
    <!-- A box far round the frame, centred on the sticker: the aim group mirrors around the sticker centre. -->
    <rect class="n nostroke" x="-300" y="-300" width="600" height="600" />
    <g transform="rotate(-50)">
      {#each LINES as line, i (i)}
        <line class="slash-line" x1={line.x1} y1={line.y} x2={line.x2} y2={line.y} />
      {/each}
      <path class="white slash-swoosh" d="M -100,6 C -50,-22 50,-26 100,-6 C 50,14 -50,18 -100,6 Z" />
      {#each SPARKS as spark, i (i)}
        <g transform="translate({spark.x} {spark.y}) scale({spark.s})"><polygon class="yellow slash-spark" points={SPARK} /></g>
      {/each}
    </g>
  </g>
</svg>

<style>
  .slash-aim {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* The opponent's sticker is mirrored: so is its cut. */
  :global(.fx--at-theirs) .slash-aim {
    scale: -1 1;
  }

  .slash-swoosh,
  .slash-spark,
  .slash-line {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* The swoosh grows from its tail, the blade's path. */
  .slash-swoosh {
    transform-origin: 0% 50%;
    stroke-width: 4;
  }

  .slash-line {
    stroke-width: 3;
  }
</style>
