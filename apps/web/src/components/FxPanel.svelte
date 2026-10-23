<script lang="ts">
  /*
   * DEV-ONLY (matchup effect gallery, lib/demo.ts): the reveal panel of one pair, the winner on top. `live`
   * replays the scene every `loopMs`; otherwise every animation of the panel is held at its end, so the
   * static end pose shows. Bump `replay` to restart the scene at once.
   */
  import type { SeatId } from '@rps/shared';
  import type { DuelView } from '../lib/board';
  import { t } from '../lib/i18n';
  import RevealPanel from './RevealPanel.svelte';

  interface Props {
    winner: string;
    /** The same gesture as `winner` for a draw. */
    loser: string;
    live: boolean;
    loopMs?: number;
    replay?: number;
  }

  let { winner, loser, live, loopMs = 4000, replay = 0 }: Props = $props();

  const duels = $derived<DuelView[]>([{ mine: 'a0', theirs: 'b0', outcome: winner === loser ? 'draw' : 'win' }]);
  const picks = $derived<Partial<Record<SeatId, string>>>({ a0: winner, b0: loser });
  const label = (seat: SeatId) => t(seat === 'a0' ? 'board.you' : 'board.opponent');

  let host = $state<HTMLElement | null>(null);

  /** Holds every animation of the panel at its end (an endless one where its first loop ends). */
  function holdAtEnd(el: HTMLElement): void {
    if (typeof el.getAnimations !== 'function') return;
    for (const a of el.getAnimations({ subtree: true })) {
      const timing = a.effect?.getComputedTiming();
      const end = Number(timing?.endTime);
      const once = Number(timing?.delay ?? 0) + Number(timing?.duration ?? 0);
      a.pause();
      a.currentTime = Number.isFinite(end) ? end : once;
    }
  }

  let tick = $state(0);
  // A new run (a replay, a new pair, the next loop, live on or off) remounts the panel, so the scene starts from scratch.
  const run = $derived(`${winner}>${loser}#${replay}.${tick}.${live}`);

  $effect(() => {
    if (!live) return;
    const id = setInterval(() => tick++, loopMs);
    return () => clearInterval(id);
  });

  $effect(() => {
    void run;
    const el = host;
    if (live || !el) return;
    // The CSS animations exist once the new panel has been styled: wait one frame.
    const id = requestAnimationFrame(() => holdAtEnd(el));
    return () => cancelAnimationFrame(id);
  });
</script>

<div class="fx-panel" bind:this={host}>
  {#key run}
    <RevealPanel {duels} {picks} {label} />
  {/key}
</div>

<style>
  .fx-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
</style>
