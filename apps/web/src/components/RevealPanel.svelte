<script lang="ts">
  import type { SeatId } from '@rps/shared';
  import type { DuelView } from '../lib/board';
  import { t } from '../lib/i18n';
  import ComicBurst from './ComicBurst.svelte';
  import PlayerCard from './PlayerCard.svelte';
  import SpeedLines from './SpeedLines.svelte';

  interface Props {
    /** The duels of the round, the viewpoint already applied (`mine` is the top left side). */
    duels: DuelView[];
    /** What every seat picked in the round; a seat without an entry picked nothing (timeout). */
    picks: Partial<Record<SeatId, string>>;
    /** Accessible name and name tag of a seat, e.g. "Du", "Gegner" or a nickname. */
    label: (seat: SeatId) => string;
    /** 2v2: half-height panels with the result of each duel. */
    team?: boolean;
  }

  let { duels, picks, label, team = false }: Props = $props();

  // The sound effect of every clash: a win is a POW, a loss a BAM, a draw a ZAP.
  const BURST = {
    win: { text: 'pow', variant: 'pow' },
    lose: { text: 'bam', variant: 'bam' },
    draw: { text: 'zap', variant: 'zap' },
  } as const;
</script>

<!--
  One diagonally split comic panel per duel: the viewpoint's side on top in yellow, the other below in blue.
  No wrapper element: the panels stay direct children of the grid of the screen that uses them.
-->
{#each duels as duel (duel.mine)}
  <div class="duel clash" class:team data-testid="duel">
    <span class="half half-mine" aria-hidden="true"></span>
    <span class="half half-theirs" aria-hidden="true"></span>
    <SpeedLines />
    <span class="impact-flash" aria-hidden="true"></span>
    <PlayerCard label={label(duel.mine)} gesture={picks[duel.mine]} side="mine"
      loser={duel.outcome === 'lose'} compact={team} />
    <PlayerCard label={label(duel.theirs)} gesture={picks[duel.theirs]} side="theirs"
      loser={duel.outcome === 'win'} compact={team} />
    <div class="impact"><ComicBurst text={t(`burst.${BURST[duel.outcome].text}`)} variant={BURST[duel.outcome].variant} /></div>
    {#if team}<p class="duel-result">{t(`board.duel_${duel.outcome}`)}</p>{/if}
  </div>
{/each}

<style>
  /* The panel: a dark --line ground shows as the gap between the two diagonal halves. */
  .duel {
    position: relative;
    height: 32.5rem;
    border: var(--outline) solid var(--line);
    border-radius: var(--radius-panel);
    background: var(--line);
    box-shadow: var(--shadow-panel);
    /* Flying stickers, rays and flash stay inside the panel: nothing may widen the page. */
    overflow: clip;
    /*
     * The z-index values 0-5 of the panel parts (halves, rays, flash, cards, burst, duel result) are a
     * local stacking order inside this context, not page layers, so the --z-* tokens do not apply.
     */
    isolation: isolate;
  }

  .duel.team {
    height: 17rem;
  }

  .half {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  .half-mine {
    background:
      radial-gradient(circle, color-mix(in srgb, var(--red) 45%, transparent) 22%, transparent 25%) 0 0 /
        var(--dot-panel-size) var(--dot-panel-size),
      var(--yellow);
    clip-path: polygon(0 0, 100% 0, 100% 38%, 0 58%);
  }

  .half-theirs {
    background:
      radial-gradient(circle, var(--sky) 22%, transparent 25%) 0 0 / var(--dot-panel-size) var(--dot-panel-size),
      var(--blue);
    clip-path: polygon(0 61%, 100% 41%, 100% 100%, 0 100%);
  }

  /* Ben-Day flash at the point of impact: only ever visible while it moves (REVEAL section). */
  .impact-flash {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 2;
    width: 220px;
    height: 220px;
    translate: -50% -50%;
    border-radius: 50%;
    background:
      radial-gradient(circle, var(--pink) 30%, transparent 33%) 0 0 / 16px 16px,
      var(--white);
    opacity: 0;
    pointer-events: none;
  }

  /* The burst sits on the seam, over everything else. */
  .impact {
    --burst-size: min(13.5rem, 52vw);
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 4;
    translate: -50% -50%;
  }

  .team .impact {
    --burst-size: 7rem;
  }

  .duel-result {
    position: absolute;
    top: var(--space-4);
    right: var(--space-4);
    z-index: 5;
    max-width: 38%;
    padding: 0 var(--space-2);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    overflow-wrap: anywhere;
    text-align: center;
    font-size: var(--text-sm);
    font-weight: 700;
    rotate: var(--tilt-2);
  }
</style>
