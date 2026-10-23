<script lang="ts">
  /*
   * Burn (fire, dragon): comic flames lick up around the struck sticker, embers fly up and smoke rises
   * once the flames die down. The frame is twice the sticker: the sticker covers the circle r = 50 around 0,0.
   * Markup only; motion: animations.css, "fx: burn / char, extinguish".
   */

  /** One flame tongue pointing up from its base at 0,0: height h, half width w. */
  const tongue = (h: number, w: number): string =>
    [
      'M0,0',
      `C${-w},0 ${-w * 1.05},${-h * 0.42} ${-w * 0.45},${-h * 0.66}`,
      `C${-w * 0.2},${-h * 0.76} ${-w * 0.3},${-h * 0.9} ${-w * 0.05},${-h}`,
      `C${w * 0.3},${-h * 0.82} ${w * 1.1},${-h * 0.56} ${w * 0.85},${-h * 0.24}`,
      `C${w * 0.7},${-h * 0.06} ${w * 0.4},0 0,0Z`,
    ].join(' ');

  /**
   * Flames around the rim (angle in degrees, maths style: 0 right, 90 up), taller at the top. Each one
   * leans outwards and upwards, like fire climbing the sticker. --d staggers them.
   */
  const RIM = [
    { a: 90, h: 64, d: 0 },
    { a: 125, h: 54, d: 50 },
    { a: 55, h: 56, d: 30 },
    { a: 160, h: 46, d: 80 },
    { a: 20, h: 48, d: 60 },
    { a: 195, h: 38, d: 110 },
    { a: -15, h: 40, d: 90 },
    { a: 235, h: 32, d: 140 },
    { a: -55, h: 32, d: 120 },
  ];
  const FLAMES = RIM.map(({ a, h, d }) => {
    const rad = (a * Math.PI) / 180;
    const [rx, ry] = [Math.cos(rad), -Math.sin(rad)];
    // Lean: the outward direction pulled up.
    const [dx, dy] = [rx, ry - 0.9];
    const lean = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return {
      at: `translate(${(rx * 44).toFixed(1)} ${(ry * 44).toFixed(1)}) rotate(${lean.toFixed(1)})`,
      outer: tongue(h, h * 0.36),
      inner: tongue(h * 0.58, h * 0.2),
      d: `${d}ms`,
    };
  });

  /** Embers flying up and out: start on the rim, travel by dx/dy. */
  const EMBERS = [
    { x: -30, y: -50, dx: -26, dy: -64, r: 5 },
    { x: 26, y: -54, dx: 30, dy: -58, r: 4 },
    { x: -56, y: -6, dx: -40, dy: -48, r: 4 },
    { x: 54, y: -14, dx: 36, dy: -52, r: 5 },
    { x: 4, y: -62, dx: 4, dy: -40, r: 3.5 },
  ];

  /** Dark smoke puffs rising once the fire dies down (dark, so they read on the light panel half too). */
  const SMOKE = [
    { x: -20, y: -64, r: 18, d: 0 },
    { x: 22, y: -70, r: 15, d: 90 },
    { x: 0, y: -88, r: 13, d: 170 },
    { x: -44, y: -78, r: 10, d: 240 },
  ];
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  {#each SMOKE as puff, i (i)}
    <circle class="line burn-smoke" cx={puff.x} cy={puff.y} r={puff.r} style:--d="{puff.d}ms" />
  {/each}
  {#each FLAMES as flame, i (i)}
    <g transform={flame.at}>
      <g class="burn-flame" style:--d={flame.d}>
        <path class="red" d={flame.outer} />
        <path class="yellow burn-core" d={flame.inner} />
      </g>
    </g>
  {/each}
  {#each EMBERS as ember, i (i)}
    <circle class="yellow burn-ember" cx={ember.x} cy={ember.y} r={ember.r} style:--dx="{ember.dx}px" style:--dy="{ember.dy}px" />
  {/each}
</svg>

<style>
  .burn-flame,
  .burn-ember,
  .burn-smoke {
    transform-box: fill-box;
  }

  /* A flame grows from its base on the rim. */
  .burn-flame {
    transform-origin: 50% 100%;
  }

  .burn-ember,
  .burn-smoke {
    transform-origin: center;
  }

  .burn-core {
    stroke-width: 3;
  }

  /* A light rim keeps the dark puffs apart from the outline-coloured panel gaps and from each other. */
  .burn-smoke {
    stroke: var(--grey);
    stroke-width: 3;
  }
</style>
