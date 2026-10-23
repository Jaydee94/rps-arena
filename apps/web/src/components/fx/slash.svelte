<script lang="ts">
  /*
   * Slash (scissors): one long white blade swoosh cuts diagonally through the struck sticker, with speed lines
   * along it and sparks where the blade leaves the rim. The swoosh runs along the on-screen cut of
   * react-split, which rises to the right on both cards (across the line to the attacker): -50 degrees on the
   * own card, -38 on the opponent's; only the one for the struck card shows. Frame: the sticker is the circle
   * r = 50 around 0,0. Markup only; motion: animations.css, "fx: slash / split".
   */

  /** The swoosh's heading per card (degrees), matching react-split's cut on screen. */
  const CUTS = [
    { side: 'mine', turn: -50 },
    { side: 'theirs', turn: -38 },
  ];

  /**
   * Sparks along the swoosh (its x axis): the lower end, and near the rim at the upper end, so on the own card
   * none sits under the name tag above and on either card none reaches the panel edge.
   */
  const SPARKS = [
    { x: -64, y: 0, s: 1 },
    { x: 50, y: 14, s: 1.15 },
    { x: -50, y: -16, s: 0.7 },
  ];

  /** Speed lines parallel to the swoosh: offset across it and their length. */
  const LINES = [
    { y: -34, x1: -96, x2: 20 },
    { y: 30, x1: -30, x2: 96 },
    { y: 44, x1: -110, x2: -30 },
  ];

  // A 4-point twinkle star around 0,0.
  const SPARK = '0,-16 4,-4 16,0 4,4 0,16 -4,4 -16,0 -4,-4';
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  {#each CUTS as cut (cut.side)}
    <g class="slash-cut slash-cut--{cut.side}" transform="rotate({cut.turn})">
      {#each LINES as line, i (i)}
        <line class="slash-line" x1={line.x1} y1={line.y} x2={line.x2} y2={line.y} />
      {/each}
      <path class="white slash-swoosh" d="M -130,8 C -60,-34 60,-40 130,-8 C 60,22 -60,28 -130,8 Z" />
      {#each SPARKS as spark, i (i)}
        <g class="slash-spot" transform="translate({spark.x} {spark.y}) scale({spark.s})"><polygon class="yellow slash-spark" points={SPARK} /></g>
      {/each}
    </g>
  {/each}
</svg>

<style>
  /* Only the swoosh of the struck card shows. */
  :global(.fx--at-mine) .slash-cut--theirs,
  :global(.fx--at-theirs) .slash-cut--mine {
    display: none;
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
    stroke-width: 5;
  }

  .slash-line {
    stroke-width: 5;
  }
</style>
