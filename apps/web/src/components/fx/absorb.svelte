<script lang="ts">
  /*
   * Absorb (sponge): suction rings close in on the struck sticker and its juice is pulled out in drops
   * that stream off towards the attacker. The frame is twice the sticker: the sticker covers the circle
   * r = 50 around 0,0. Markup only; motion: animations.css, "fx: absorb / squeeze".
   *
   * The drops are drawn with the attacker towards +x; `.absorb-aim` turns them towards the attacker's
   * corner (bottom right for fx--at-mine, top left for fx--at-theirs).
   */

  /** Suction rings, outermost first: radius and stagger. */
  const RINGS = [
    { r: 80, d: '0ms' },
    { r: 66, d: '120ms' },
  ];

  /** Drops leaving the rim: start on the rim (degrees around it), how far they travel towards +x, size. */
  const DROPS = [
    { a: -70, far: 96, s: 1 },
    { a: -35, far: 84, s: 1.2 },
    { a: 0, far: 70, s: 1.3 },
    { a: 35, far: 84, s: 1.1 },
    { a: 70, far: 96, s: 0.9 },
    { a: -110, far: 110, s: 0.8 },
    { a: 110, far: 110, s: 0.9 },
  ].map(({ a, far, s }, i) => {
    const rad = (a * Math.PI) / 180;
    return {
      x: (Math.cos(rad) * 56).toFixed(1),
      y: (Math.sin(rad) * 56).toFixed(1),
      // Towards +x and in towards the axis, so the stream narrows on its way to the sponge.
      dx: `${far}px`,
      dy: `${(-Math.sin(rad) * 40).toFixed(1)}px`,
      s,
      d: `${i * 50}ms`,
    };
  });

  /** A drop pointing towards +x (where it is pulled to), round end at 0,0. */
  const DROP = 'M14,0 C6,5 1,8 -3,8 C-8,8 -11,4 -11,0 C-11,-4 -8,-8 -3,-8 C1,-8 6,-5 14,0Z';
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  {#each RINGS as ring, i (i)}
    <g class="absorb-ring" style:--d={ring.d}>
      <circle class="absorb-under" r={ring.r} />
      <circle class="absorb-top" r={ring.r} />
    </g>
  {/each}
  <g class="absorb-aim">
    {#each DROPS as drop, i (i)}
      <g transform="translate({drop.x} {drop.y}) scale({drop.s})">
        <path class="blue absorb-drop" d={DROP} style:--dx={drop.dx} style:--dy={drop.dy} style:--d={drop.d} />
      </g>
    {/each}
  </g>
</svg>

<style>
  /* Turns the stream towards the attacker (the frame never mirrors). */
  .absorb-aim {
    transform-box: view-box;
    transform-origin: 0 0;
    rotate: 55deg;
  }

  :global(.fx--at-theirs) .absorb-aim {
    rotate: 235deg;
  }

  .absorb-ring,
  .absorb-drop {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* Dashed tubes: a dark dash under a light one. */
  .absorb-under,
  .absorb-top {
    stroke-dasharray: 14 12;
  }

  .absorb-under {
    stroke-width: 9;
  }

  .absorb-top {
    stroke: var(--sky);
    stroke-width: 4;
  }
</style>
