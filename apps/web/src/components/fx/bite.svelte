<script lang="ts">
  /*
   * Bite (snake, wolf): a big toothy maw snaps shut round the struck sticker from the attacker's side, the
   * teeth showing round its rim, with snap lines at the corners of the mouth. Drawn for an attacker at the
   * bottom right (the struck sticker is the own one) and turned round for one at the top left. Frame: the
   * sticker is the circle r = 50 around 0,0. Markup only; motion: animations.css, "fx: bite / chomp".
   */

  const rad = (deg: number) => (deg * Math.PI) / 180;
  const at = (r: number, deg: number) => `${(r * Math.cos(rad(deg))).toFixed(1)},${(r * Math.sin(rad(deg))).toFixed(1)}`;

  /** One jaw centred on `mid` (degrees): a gum band from r 62 to 88 over 130 degrees, teeth pointing inwards. */
  function jaw(mid: number) {
    const from = mid - 65;
    const to = mid + 65;
    const gum = `M ${at(88, from)} A 88 88 0 0 1 ${at(88, to)} L ${at(62, to)} A 62 62 0 0 0 ${at(62, from)} Z`;
    const teeth = [-48, -24, 0, 24, 48].map((offset) => {
      const deg = mid + offset;
      const long = Math.abs(offset) === 48 ? 40 : 46;
      return `${at(64, deg - 8)} ${at(long, deg)} ${at(64, deg + 8)}`;
    });
    return { gum, teeth };
  }

  const JAWS = [
    { kind: 'upper', ...jaw(-90) },
    { kind: 'lower', ...jaw(90) },
  ];

  /** Snap lines at both corners of the mouth: short dashes from r 80 to 98. */
  const SNAPS = [-24, 0, 24, 156, 180, 204].map((deg) => ({
    deg,
    x1: 80 * Math.cos(rad(deg)),
    y1: 80 * Math.sin(rad(deg)),
    x2: 98 * Math.cos(rad(deg)),
    y2: 98 * Math.sin(rad(deg)),
  }));
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <g class="bite-aim">
    <!-- A box far round the frame, centred on the sticker: the aim group turns round the sticker centre. -->
    <rect class="n nostroke" x="-300" y="-300" width="600" height="600" />
    <!-- The mouth opens towards the attacker (bottom right): its jaws lie across that line. -->
    <g transform="translate(14 14) rotate(45)">
      {#each JAWS as j (j.kind)}
        <g class="bite-jaw bite-jaw--{j.kind}">
          <path class="red" d={j.gum} />
          {#each j.teeth as points (points)}<polygon class="white" {points} />{/each}
        </g>
      {/each}
      {#each SNAPS as snap (snap.deg)}
        <line class="bite-snap" x1={snap.x1} y1={snap.y1} x2={snap.x2} y2={snap.y2} />
      {/each}
    </g>
  </g>
</svg>

<style>
  .bite-aim,
  .bite-jaw,
  .bite-snap {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* Turned round when the attacker sits at the top left (the struck sticker is the opponent's). */
  :global(.fx--at-theirs) .bite-aim {
    scale: -1 -1;
  }

  .bite-jaw {
    stroke-width: 3.5;
  }

  .bite-snap {
    stroke-width: 5;
  }
</style>
