<script lang="ts">
  /*
   * Chomp (struck by bite): a scalloped bite is missing from the sticker's rim on the attacker's side; the
   * panel shows through it. The bitten sticker is a decorative copy cut with a static clip-path, inked along
   * the bite. The attacker's side differs per card (the opponent's sticker is mirrored), so there is one bite
   * per side. Static end pose and last keyframe: animations.css, "fx: bite / chomp" and
   * "fx static: bite / chomp". Markup only.
   */
  import GestureIcon from '../GestureIcon.svelte';

  interface Props {
    gesture: string;
    size: number;
  }

  let { gesture, size }: Props = $props();

  const rad = (deg: number) => (deg * Math.PI) / 180;

  /** The bite at rim angle `deg` (in % of the sticker): a central bowl and three tooth scallops inside it. */
  function bite(deg: number) {
    const bx = 50 + 50 * Math.cos(rad(deg));
    const by = 50 + 50 * Math.sin(rad(deg));
    const circles = [{ x: bx, y: by, r: 17 }];
    for (const offset of [-55, 0, 55]) {
      const a = rad(deg + 180 + offset);
      circles.push({ x: bx + 15 * Math.cos(a), y: by + 15 * Math.sin(a), r: 10 });
    }
    // The sticker's outline (plus its shadow), cut back along each ray to where it first enters the bite.
    const points: string[] = [];
    for (let step = 0; step < 180; step++) {
      const a = rad(step * 2);
      const [ux, uy] = [Math.cos(a), Math.sin(a)];
      let r = 56;
      for (const c of circles) {
        const along = (c.x - 50) * ux + (c.y - 50) * uy;
        const across2 = (c.x - 50) ** 2 + (c.y - 50) ** 2 - along ** 2;
        if (along > 0 && across2 < c.r ** 2) r = Math.min(r, along - Math.sqrt(c.r ** 2 - across2));
      }
      points.push(`${(50 + r * ux).toFixed(1)}% ${(50 + r * uy).toFixed(1)}%`);
    }
    return { clip: `polygon(${points.join(', ')})`, circles };
  }

  // Towards the other sticker: down right on the own (unmirrored) card, up right on the opponent's mirrored one.
  const MINE = bite(45);
  const THEIRS = bite(-45);
</script>

<span class="chomp" aria-hidden="true">
  <span class="chomp-bitten" style:--bite-mine={MINE.clip} style:--bite-theirs={THEIRS.clip}>
    <GestureIcon id={gesture} {size} copy />
    <svg class="art chomp-edge" viewBox="0 0 100 100" focusable="false">
      <g class="chomp-edge--mine">{#each MINE.circles as c, i (i)}<circle cx={c.x} cy={c.y} r={c.r} />{/each}</g>
      <g class="chomp-edge--theirs">{#each THEIRS.circles as c, i (i)}<circle cx={c.x} cy={c.y} r={c.r} />{/each}</g>
    </svg>
  </span>
</span>

<style>
  /* Stacks exactly on the sticker (the sticker wrapper is a one-cell grid). */
  .chomp,
  .chomp > * {
    display: grid;
    grid-area: 1 / 1;
  }

  .chomp {
    pointer-events: none;
  }

  .chomp-bitten {
    position: relative;
    clip-path: var(--bite-mine);
  }

  :global(.theirs) .chomp-bitten {
    clip-path: var(--bite-theirs);
  }

  /* Out of the grid flow, so it takes the sticker's size instead of setting it. */
  .chomp-edge {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    stroke-width: 5;
  }

  .chomp-edge--theirs,
  :global(.theirs) .chomp-edge--mine {
    display: none;
  }

  :global(.theirs) .chomp-edge--theirs {
    display: inline;
  }
</style>
