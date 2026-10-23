<script lang="ts">
  import type { SeatId } from '@rps/shared';
  import type { DuelView } from '../lib/board';
  import { ruleFor } from '../lib/matchup-fx';

  interface Props {
    /** The duels of the round (viewpoint applied), as given to RevealPanel. */
    duels: DuelView[];
    /** What every seat picked in the round; a seat without an entry picked nothing (timeout). */
    picks: Partial<Record<SeatId, string>>;
  }

  let { duels, picks }: Props = $props();

  // One verb sentence per decided duel ("Rock crushes Scissors"); none for draws and missing picks.
  const rules = $derived(duels.map((duel) => ruleFor(duel, picks)).filter((rule): rule is string => rule !== null));
</script>

<!-- No wrapper: the lines stay direct children of the screen's grid, which places them (class `rule`). -->
{#each rules as rule, i (i)}
  <p class="rule">{rule}</p>
{/each}

<style>
  .rule {
    justify-self: center;
    max-width: 100%;
    margin: 0;
    overflow-wrap: anywhere;
    text-align: center;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.04em;
  }
</style>
