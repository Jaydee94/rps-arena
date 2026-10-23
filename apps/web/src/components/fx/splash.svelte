<script lang="ts">
  /*
   * Splash (water): a blue splat bursts behind the struck sticker and drops fly off its rim, with a few
   * light spray drops in between. The frame is twice the sticker: the sticker covers the circle r = 50
   * around 0,0. Markup only; motion: animations.css, "fx: splash / drench" (also drawn for water>fire,
   * where the fire reacts with `extinguish`).
   */

  // A splat: round lobes between dents, with a fixed wobble so it stays the same between renders.
  const LOBES = 11;
  const REACH = [90, 78, 94, 82, 88, 76, 92, 80, 86, 95, 79];
  const at = (r: number, angle: number) => `${(r * Math.cos(angle)).toFixed(1)},${(r * Math.sin(angle)).toFixed(1)}`;
  const splat =
    Array.from({ length: LOBES }, (_, i) => {
      const step = (Math.PI * 2) / LOBES;
      const a = i * step - Math.PI / 2;
      const reach = REACH[i] ?? 86;
      const dent = at(60, a);
      return `${i === 0 ? 'M' : 'L'}${dent} C${at(reach, a + step * 0.12)} ${at(reach, a + step * 0.88)} ${at(60, a + step)}`;
    }).join(' ') + 'Z';

  /** A drop pointing up (its round end at 0,0), rotated to fly outwards. */
  const DROP = 'M0,-14 C5,-6 8,-1 8,3 C8,8 4,11 0,11 C-4,11 -8,8 -8,3 C-8,-1 -5,-6 0,-14Z';

  /** Drops off the rim: direction (degrees, 0 = up, clockwise), distance flown, size. */
  const DROPS = [
    { a: -20, far: 58, s: 1.2 },
    { a: 30, far: 52, s: 1 },
    { a: 75, far: 60, s: 1.1 },
    { a: 120, far: 46, s: 0.9 },
    { a: 165, far: 54, s: 1.1 },
    { a: 210, far: 50, s: 1 },
    { a: 250, far: 58, s: 1.2 },
    { a: 295, far: 48, s: 0.9 },
  ].map(({ a, far, s }) => {
    const rad = (a * Math.PI) / 180;
    const [ux, uy] = [Math.sin(rad), -Math.cos(rad)];
    return {
      at: `translate(${(ux * 64).toFixed(1)} ${(uy * 64).toFixed(1)}) rotate(${a}) scale(${s})`,
      // Local to the rotated drop: outwards is up.
      far: `${-far}px`,
    };
  });

  /** Light spray between the big drops. */
  const SPRAY = [
    { x: -70, y: -44, r: 5 },
    { x: 60, y: -62, r: 4 },
    { x: 80, y: 30, r: 5 },
    { x: -40, y: 74, r: 4 },
    { x: -84, y: 22, r: 4 },
    { x: 30, y: 82, r: 5 },
  ];
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <path class="splash-splat" d={splat} />
  {#each DROPS as drop, i (i)}
    <g transform={drop.at}>
      <path class="blue splash-drop" d={DROP} style:--far={drop.far} />
    </g>
  {/each}
  {#each SPRAY as spray, i (i)}
    <circle class="white splash-spray" cx={spray.x} cy={spray.y} r={spray.r} />
  {/each}
</svg>

<style>
  .splash-splat,
  .splash-drop,
  .splash-spray {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* Light water: it reads on the blue half as well as on the yellow one. */
  .splash-splat {
    fill: var(--sky);
    stroke-width: 5;
  }
</style>
