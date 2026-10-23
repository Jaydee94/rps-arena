<script lang="ts">
  /*
   * Absorb (sponge): a suction ring closes in on the struck sticker and its juice is sucked out: two dashed
   * juice streams arc from its rim round both sides of the burst towards the attacker, with big drops running
   * along them. The frame is twice the sticker: the sticker covers the circle r = 50 around 0,0. Markup only;
   * motion: animations.css, "fx: absorb / squeeze".
   *
   * The streams are drawn with the attacker towards +x (about 230 units away in 1v1 and 2v2; the burst sits on
   * the line between them, roughly a circle r = 75 around x = 115), so they bulge out to the sides by ~90
   * units to stay clear of it. `.absorb-aim` turns them towards the attacker's corner (bottom right for
   * fx--at-mine, top left for fx--at-theirs; in the 2v2 panel the attacker sits to the side, not diagonally).
   */

  type Pt = [number, number];

  /** A quadratic arc from the rim towards the attacker, on side s (1 or -1). */
  const arc = (s: number): [Pt, Pt, Pt] => [
    [26, 44 * s],
    [104, 150 * s],
    [184, 44 * s],
  ];

  const at = ([a, b, c]: [Pt, Pt, Pt], t: number): Pt => [
    (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t ** 2 * c[0],
    (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t ** 2 * c[1],
  ];

  const heading = ([a, b, c]: [Pt, Pt, Pt], t: number): number => {
    const dx = 2 * (1 - t) * (b[0] - a[0]) + 2 * t * (c[0] - b[0]);
    const dy = 2 * (1 - t) * (b[1] - a[1]) + 2 * t * (c[1] - b[1]);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const SIDES = [1, -1];

  const STREAMS = SIDES.map((s) => {
    const [a, b, c] = arc(s);
    return `M${a[0]},${a[1]} Q${b[0]},${b[1]} ${c[0]},${c[1]}`;
  });

  /**
   * Drops running along the streams: each starts on the rim and travels the whole arc, pointing the way it
   * goes. Five stops per drop (--x1..--x4 / --y1..--y4 relative to the start, --r0..--r4 its heading) are read
   * by the keyframes; --s is its size, --d its stagger.
   */
  const DROPS = SIDES.flatMap((s, side) =>
    [0, 1, 2].map((k) => {
      const curve = arc(s);
      const [x0, y0] = curve[0];
      const stops = [0.25, 0.5, 0.75, 1].map((t) => at(curve, t));
      const vars: Record<string, string> = {};
      stops.forEach(([x, y], i) => {
        vars[`--x${i + 1}`] = `${(x - x0).toFixed(1)}px`;
        vars[`--y${i + 1}`] = `${(y - y0).toFixed(1)}px`;
      });
      [0, 0.25, 0.5, 0.75, 1].forEach((t, i) => {
        vars[`--r${i}`] = `${heading(curve, t).toFixed(1)}deg`;
      });
      return {
        x: x0,
        y: y0,
        s: [1.8, 1.5, 1.25][k] ?? 1,
        d: `${k * 170 + side * 60}ms`,
        style: Object.entries(vars)
          .map(([key, value]) => `${key}: ${value}`)
          .join('; '),
      };
    }),
  );

  /** A drop pointing towards +x (where it is pulled to), round end at 0,0. */
  const DROP = 'M14,0 C6,5 1,8 -3,8 C-8,8 -11,4 -11,0 C-11,-4 -8,-8 -3,-8 C1,-8 6,-5 14,0Z';
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <g class="absorb-ring">
    <circle class="absorb-under" r="74" />
    <circle class="absorb-top" r="74" />
  </g>
  <g class="absorb-aim">
    {#each STREAMS as d, i (i)}
      <g class="absorb-stream">
        <path class="absorb-under" {d} />
        <path class="absorb-top" {d} />
      </g>
    {/each}
    {#each DROPS as drop, i (i)}
      <g transform="translate({drop.x} {drop.y})">
        <g class="absorb-drop" style="--s: {drop.s}; --d: {drop.d}; {drop.style}">
          <path class="absorb-juice" d={DROP} />
          <ellipse class="white absorb-shine" cx="-4" cy="-3" rx="3" ry="2" />
        </g>
      </g>
    {/each}
  </g>
</svg>

<style>
  /* Turns the streams towards the attacker (the frame never mirrors). */
  .absorb-aim {
    transform-box: view-box;
    transform-origin: 0 0;
    rotate: 55deg;
  }

  :global(.fx--at-theirs) .absorb-aim {
    rotate: 235deg;
  }

  /* 2v2: the attacker sits beside the struck sticker (slightly above or below), not diagonally. */
  :global(.compact .fx--at-mine) .absorb-aim {
    rotate: 12deg;
  }

  :global(.compact .fx--at-theirs) .absorb-aim {
    rotate: 193deg;
  }

  .absorb-ring,
  .absorb-stream {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* A drop turns and scales round its own round end. */
  .absorb-drop {
    transform-box: view-box;
    transform-origin: 0 0;
  }

  /* Dashed juice tubes: a dark dash under a light one. */
  .absorb-under,
  .absorb-top {
    stroke-dasharray: 14 12;
  }

  .absorb-under {
    stroke-width: 11;
  }

  .absorb-top {
    stroke: var(--sky);
    stroke-width: 5;
  }

  .absorb-juice {
    fill: var(--sky);
    stroke-width: 3.5;
  }

  .absorb-shine {
    stroke: none;
  }
</style>
