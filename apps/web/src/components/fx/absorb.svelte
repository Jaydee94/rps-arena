<script lang="ts">
  /*
   * Absorb (sponge): a suction ring closes in on the struck sticker and its juice is sucked out: two dashed
   * juice streams arc from its rim round both sides of the burst towards the attacker, with big drops running
   * along them. The frame is twice the sticker: the sticker covers the circle r = 50 around 0,0. Markup only;
   * motion: animations.css, "fx: absorb / squeeze".
   *
   * The streams are drawn with the attacker towards +x; `.absorb-aim` turns them towards the attacker (bottom
   * right for fx--at-mine, top left for fx--at-theirs). Both the direction and the distance to the attacker
   * depend on the layout, so there is one set of streams and drops per layout and the styles below pick it:
   * - narrow (1v1 below 30rem): the attacker is ~230 units away and the burst (r ~75) sits half way, so the
   *   arcs bulge ~95 units to the sides to stay clear of it;
   * - mid (1v1 from 30rem to 46rem): the attacker is 260-430 units away, the burst a little further off, so the
   *   arcs run longer and bulge less (the struck sticker sits closer to the panel edge);
   * - wide (1v1 from 46rem, the panel at its full width): the attacker is ~450 units away, so the arcs run
   *   long and reach it;
   * - team (2v2): the burst is small (r ~64) and the attacker's name tag sits right above it, so the arcs are
   *   shorter and the upper one stays low, clear of the name tag and the duel chip.
   */

  type Pt = [number, number];
  type Curve = [Pt, Pt, Pt];

  /** Each layout's quadratic arc from the rim towards the attacker, on side s (1 or -1). */
  const LAYOUTS: { name: string; arc: (s: number) => Curve }[] = [
    { name: 'narrow', arc: (s) => [[26, 44 * s], [104, 150 * s], [184, 44 * s]] },
    { name: 'mid', arc: (s) => [[26, 44 * s], [130, 118 * s], [250, 40 * s]] },
    { name: 'wide', arc: (s) => [[26, 44 * s], [225, 130 * s], [395, 40 * s]] },
    // There is no room between the attacker's name tag and the small burst (the tag is above the attacker when
    // the opponent is struck, below it when the own sticker is), so the arc on the tag's side (s = 1 after either
    // turn) stays low and dips behind the burst's rim.
    { name: 'team', arc: (s) => (s > 0 ? [[26, 36], [96, 70], [160, 30]] : [[26, -40], [96, -112], [160, -34]]) },
  ];

  const at = ([a, b, c]: Curve, t: number): Pt => [
    (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t ** 2 * c[0],
    (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t ** 2 * c[1],
  ];

  const heading = ([a, b, c]: Curve, t: number): number => {
    const dx = 2 * (1 - t) * (b[0] - a[0]) + 2 * t * (c[0] - b[0]);
    const dy = 2 * (1 - t) * (b[1] - a[1]) + 2 * t * (c[1] - b[1]);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const SIDES = [1, -1];

  /**
   * Drops running along the streams: each starts on the rim and travels the whole arc, pointing the way it
   * goes. Five stops per drop (--x1..--x4 / --y1..--y4 relative to the start, --r0..--r4 its heading) are read
   * by the keyframes; --s is its size, --d its stagger.
   */
  const drops = (arc: (s: number) => Curve) =>
    SIDES.flatMap((s, side) =>
      [0, 1, 2].map((k) => {
        const curve = arc(s);
        const [x0, y0] = curve[0];
        const vars: Record<string, string> = {};
        [0.25, 0.5, 0.75, 1].forEach((t, i) => {
          const [x, y] = at(curve, t);
          vars[`--x${i + 1}`] = `${(x - x0).toFixed(1)}px`;
          vars[`--y${i + 1}`] = `${(y - y0).toFixed(1)}px`;
        });
        [0, 0.25, 0.5, 0.75, 1].forEach((t, i) => {
          vars[`--r${i}`] = `${heading(curve, t).toFixed(1)}deg`;
        });
        return {
          x: x0,
          y: y0,
          style: [
            `--s: ${[1.8, 1.5, 1.25][k] ?? 1}`,
            `--d: ${k * 170 + side * 60}ms`,
            ...Object.entries(vars).map(([key, value]) => `${key}: ${value}`),
          ].join('; '),
        };
      }),
    );

  const SETS = LAYOUTS.map(({ name, arc }) => ({
    name,
    streams: SIDES.map((s) => {
      const [a, b, c] = arc(s);
      return `M${a[0]},${a[1]} Q${b[0]},${b[1]} ${c[0]},${c[1]}`;
    }),
    drops: drops(arc),
  }));

  /** A drop pointing towards +x (where it is pulled to), round end at 0,0. */
  const DROP = 'M14,0 C6,5 1,8 -3,8 C-8,8 -11,4 -11,0 C-11,-4 -8,-8 -3,-8 C1,-8 6,-5 14,0Z';
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <g class="absorb-ring">
    <circle class="absorb-under" r="74" />
    <circle class="absorb-top" r="74" />
  </g>
  <g class="absorb-aim">
    {#each SETS as set (set.name)}
      <g class="absorb-set absorb-set--{set.name}">
        {#each set.streams as d, i (i)}
          <g class="absorb-stream">
            <path class="absorb-under" {d} />
            <path class="absorb-top" {d} />
          </g>
        {/each}
        {#each set.drops as drop, i (i)}
          <g transform="translate({drop.x} {drop.y})">
            <g class="absorb-drop" style={drop.style}>
              <path class="absorb-juice" d={DROP} />
              <ellipse class="white absorb-shine" cx="-4" cy="-3" rx="3" ry="2" />
            </g>
          </g>
        {/each}
      </g>
    {/each}
  </g>
</svg>

<style>
  /*
   * Turns the streams towards the attacker (the frame never mirrors). The panel keeps its height and widens
   * with the page up to its full width at 46rem, so the attacker's direction flattens step by step.
   */
  .absorb-aim {
    transform-box: view-box;
    transform-origin: 0 0;
    rotate: 55deg;
  }

  :global(.fx--at-theirs) .absorb-aim {
    rotate: 235deg;
  }

  @media (min-width: 30rem) {
    :global(.fx--at-mine) .absorb-aim {
      rotate: 37deg;
    }

    :global(.fx--at-theirs) .absorb-aim {
      rotate: 217deg;
    }
  }

  @media (min-width: 38rem) {
    :global(.fx--at-mine) .absorb-aim {
      rotate: 27deg;
    }

    :global(.fx--at-theirs) .absorb-aim {
      rotate: 207deg;
    }
  }

  @media (min-width: 46rem) {
    :global(.fx--at-mine) .absorb-aim {
      rotate: 24deg;
    }

    :global(.fx--at-theirs) .absorb-aim {
      rotate: 204deg;
    }
  }

  /* 2v2: the attacker sits beside the struck sticker (slightly above or below), not diagonally. */
  :global(.compact .fx--at-mine) .absorb-aim {
    rotate: 13deg;
  }

  :global(.compact .fx--at-theirs) .absorb-aim {
    rotate: 193deg;
  }

  @media (min-width: 30rem) {
    :global(.compact .fx--at-mine) .absorb-aim {
      rotate: 8deg;
    }

    :global(.compact .fx--at-theirs) .absorb-aim {
      rotate: 188deg;
    }
  }

  /* One set of streams and drops per layout (narrow below 30rem, mid to 46rem, wide beyond; team in 2v2). */
  .absorb-set--mid,
  .absorb-set--wide,
  .absorb-set--team,
  :global(.compact) .absorb-set--narrow {
    display: none;
  }

  :global(.compact) .absorb-set--team {
    display: inline;
  }

  @media (min-width: 30rem) {
    :global(.player:not(.compact)) .absorb-set--narrow {
      display: none;
    }

    :global(.player:not(.compact)) .absorb-set--mid {
      display: inline;
    }
  }

  @media (min-width: 46rem) {
    :global(.player:not(.compact)) .absorb-set--mid {
      display: none;
    }

    :global(.player:not(.compact)) .absorb-set--wide {
      display: inline;
    }
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
