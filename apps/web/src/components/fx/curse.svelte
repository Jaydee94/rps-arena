<script lang="ts">
  /*
   * Curse (devil): a pink hex circle with dark runes snaps shut around the struck sticker and turns, dark
   * smoke wisps curl off its rim and pink sparks pop around it. The frame is twice the sticker: the sticker
   * covers the circle r = 50 around 0,0. Markup only; motion: animations.css, "fx: curse / hexed".
   */

  /** Runes on the ring: angle (degrees from the top) and which glyph. */
  const RUNES = [0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => ({ angle, glyph: i % 3 }));
  const GLYPHS = ['M-4,-5 L4,-5 L0,5 Z', 'M-5,0 L5,0 M0,-5 L0,5', 'M-4,-4 L4,4 M4,-4 L-4,4'];

  /** Dark smoke puffs rising off the rim: where they sit and which way they drift. */
  const WISPS = [
    { x: -58, y: -40, dx: -26, dy: -34 },
    { x: 60, y: -36, dx: 28, dy: -32 },
    { x: -66, y: 22, dx: -34, dy: -10 },
    { x: 64, y: 30, dx: 34, dy: -8 },
    { x: 4, y: -72, dx: 4, dy: -36 },
  ];

  /** Pink sparks popping around the ring. */
  const SPARKS = [
    { x: -80, y: -64, s: 1 },
    { x: 82, y: -60, s: 0.8 },
    { x: -86, y: 54, s: 0.7 },
    { x: 84, y: 66, s: 0.9 },
  ];
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <g class="curse-ring">
    <path class="pink" fill-rule="evenodd" d="M0,-80 A80,80 0 1 1 0,80 A80,80 0 1 1 0,-80 Z M0,-62 A62,62 0 1 0 0,62 A62,62 0 1 0 0,-62 Z" />
    {#each RUNES as rune (rune.angle)}
      <path class="curse-rune" d={GLYPHS[rune.glyph]} transform="rotate({rune.angle}) translate(0 -71)" />
    {/each}
  </g>
  {#each WISPS as wisp, i (i)}
    <g transform="translate({wisp.x} {wisp.y})">
      <path
        class="line curse-wisp"
        d="M-12,6 A7,7 0 0 1 -9,-5 A8,8 0 0 1 4,-10 A8,8 0 0 1 13,0 A6,6 0 0 1 8,8 Z"
        style:--dx="{wisp.dx}px"
        style:--dy="{wisp.dy}px"
      />
    </g>
  {/each}
  {#each SPARKS as spark, i (i)}
    <g transform="translate({spark.x} {spark.y})">
      <polygon class="pink curse-spark" points="0,-13 3,-3 13,0 3,3 0,13 -3,3 -13,0 -3,-3" style:--s={spark.s} />
    </g>
  {/each}
</svg>

<style>
  .curse-ring,
  .curse-wisp,
  .curse-spark {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* The runes are drawn lines on the pink ring, in the outline colour. */
  .curse-rune {
    stroke-width: 3;
  }

  .curse-spark {
    stroke-width: 3;
  }
</style>
