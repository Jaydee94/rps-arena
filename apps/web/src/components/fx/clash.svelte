<script lang="ts">
  /*
   * Clash (a draw): the two stickers collide head-on and bounce apart. A white shock ring spreads from the
   * seam past the burst, and sparks squirt out sideways along the seam (up right and down left). The frame
   * is twice the centre slot of the panel; the burst covers its middle, so everything that matters lives
   * beyond r = 70 or flies there. Markup only; motion: animations.css, "fx: clash".
   */

  /** Sparks along the seam (it rises about 16 degrees to the right): where they fly and how far they spin. */
  const SPARKS = [
    { dx: 150, dy: -46, rot: 140, s: 1.4 },
    { dx: 132, dy: -8, rot: -120, s: 1.1 },
    { dx: 116, dy: -80, rot: 200, s: 1 },
    { dx: -150, dy: 46, rot: -140, s: 1.4 },
    { dx: -132, dy: 8, rot: 120, s: 1.1 },
    { dx: -116, dy: 80, rot: -200, s: 1 },
  ];

  /** A four-pointed comic spark around 0,0. */
  const SPARK = '0,-16 4,-4 16,0 4,4 0,16 -4,4 -16,0 -4,-4';
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <path class="white clash-ring" fill-rule="evenodd" d="M0,-62 A62,62 0 1 1 0,62 A62,62 0 1 1 0,-62 Z M0,-50 A50,50 0 1 0 0,50 A50,50 0 1 0 0,-50 Z" />
  {#each SPARKS as spark, i (i)}
    <polygon
      class="{i % 3 === 1 ? 'white' : 'yellow'} clash-spark"
      points={SPARK}
      style:--dx="{spark.dx}px"
      style:--dy="{spark.dy}px"
      style:--spin="{spark.rot}deg"
      style:--s={spark.s}
    />
  {/each}
</svg>

<style>
  .clash-ring,
  .clash-spark {
    transform-box: fill-box;
    transform-origin: center;
  }

  .clash-spark {
    stroke-width: 3;
  }
</style>
