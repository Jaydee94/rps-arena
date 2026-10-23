<script lang="ts">
  /*
   * Zap (lightning, spock): a jagged bolt strikes the sticker from above, a white crackle
   * ring flashes around its rim and electric sparks jump off it. The frame is twice the sticker: the
   * sticker covers the circle r = 50 around 0,0. Markup only; motion: animations.css, "fx: zap / shock".
   *
   * The bolt is drawn coming from +x; `.zap-aim` turns it to strike from above, into open sky: the
   * attacker's direction is where the POW burst sits, the own name tag is above the top left sticker
   * (fx--at-mine: from the upper right) and the panel edge is close to the right of the bottom right one
   * (fx--at-theirs: from nearly straight up).
   */

  // The bolt, drawn upright (its base at the top, the tip at the bottom); `.zap-aim` and the group around
  // it lay it down so the base sits beyond the frame edge (+x) and the tip on the sticker's rim.
  const BOLT = '4,-56 -20,4 -4,4 -14,52 22,-10 6,-10 18,-56';

  // A jagged ring around the rim: 16 points alternating in and out, with a fixed wobble.
  const SPIKES = 16;
  const WOBBLE = [8, 2, 10, 4, 7, 1, 9, 3, 6, 2, 10, 5, 8, 1, 7, 4];
  const crackle = Array.from({ length: SPIKES * 2 }, (_, i) => {
    const angle = (i / (SPIKES * 2)) * Math.PI * 2;
    const radius = i % 2 === 0 ? 70 + (WOBBLE[i / 2] ?? 0) : 58;
    return `${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

  /** Sparks jumping off the rim: direction (degrees), a short zigzag, stagger. */
  const SPARKS = [
    { a: -60, d: '0ms' },
    { a: 10, d: '90ms' },
    { a: 100, d: '40ms' },
    { a: 160, d: '130ms' },
    { a: 220, d: '60ms' },
    { a: 290, d: '110ms' },
  ].map(({ a, d }) => ({ at: `rotate(${a}) translate(70 0)`, d }));
  const SPARK = '0,0 10,-6 14,4 26,-4';
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <polygon class="white zap-crackle" points={crackle} />
  {#each SPARKS as spark, i (i)}
    <g transform={spark.at}>
      <g class="zap-spark" style:--d={spark.d}>
        <polyline class="zap-under" points={SPARK} />
        <polyline class="zap-top" points={SPARK} />
      </g>
    </g>
  {/each}
  <g class="zap-aim">
    <g transform="translate(98 0) rotate(90)">
      <polygon class="yellow zap-bolt" points={BOLT} />
    </g>
  </g>
</svg>

<style>
  /* Strikes from above (the frame never mirrors). */
  .zap-aim {
    transform-box: view-box;
    transform-origin: 0 0;
    rotate: -40deg;
  }

  :global(.fx--at-theirs) .zap-aim {
    rotate: -68deg;
  }

  .zap-crackle,
  .zap-spark {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* The bolt grows out of its base (beyond the frame edge) towards the rim. */
  .zap-bolt {
    transform-box: fill-box;
    transform-origin: 50% 0%;
    stroke-width: 5;
  }

  .zap-crackle {
    stroke-width: 4;
  }

  .zap-under {
    stroke-width: 9;
  }

  .zap-top {
    stroke: var(--yellow);
    stroke-width: 4;
  }
</style>
