<script lang="ts">
  const PIECES = Array.from({ length: 24 }, (_, i) => i);
</script>

<!-- Pure CSS confetti for the victory screen; the motion lives in styles/animations.css. -->
<div class="confetti" aria-hidden="true">
  {#each PIECES as i (i)}
    <i style:--i={i}></i>
  {/each}
</div>

<style>
  .confetti {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: var(--z-overlay);
  }

  i {
    position: absolute;
    top: -2rem;
    left: calc(mod(var(--i) * 37, 100) * 1%);
    width: 0.8rem;
    height: 1.2rem;
    border: 3px solid var(--line);
    background: var(--yellow);
    opacity: 0;
  }

  i:nth-child(5n + 1) { background: var(--red); }
  i:nth-child(5n + 2) { background: var(--blue); border-radius: 50%; width: 1rem; height: 1rem; }
  i:nth-child(5n + 3) { background: var(--pink); }
  i:nth-child(5n + 4) { background: var(--teal); clip-path: polygon(50% 0, 100% 100%, 0 100%); border: 0; }
</style>
