<script lang="ts">
  import { gestureSetFor, type PublicMatch, type RoomView, type SeatId } from '@rps/shared';
  import { announce, next, pick } from '../lib/connection';
  import { duelViews, outcomeFor, type Side } from '../lib/board';
  import { gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import { opponentSeat, teamOf } from '../lib/seats';
  import AnnouncePanel from './AnnouncePanel.svelte';
  import CameraToggle from './CameraToggle.svelte';
  import ComicBurst from './ComicBurst.svelte';
  import GesturePad from './GesturePad.svelte';
  import PlayerCard from './PlayerCard.svelte';
  import Scoreboard from './Scoreboard.svelte';
  import ThinkBubble from './ThinkBubble.svelte';
  import TimerBar from './TimerBar.svelte';

  interface Props {
    room: RoomView;
    match: PublicMatch;
  }

  let { room, match }: Props = $props();

  const you = $derived(room.you);
  const myTeam = $derived(teamOf(you));
  const isTeamMode = $derived(room.config.mode === 'team2v2');
  const opponent = $derived(opponentSeat(you));

  // Optimistic local state until the server confirms; reset whenever the round or phase moves on.
  let localPick = $state<string | null>(null);
  let localAnnounced = $state(false);
  let statusEl = $state<HTMLElement>();
  // A primitive key: equal-phase room updates must not wipe the optimistic state before the ack.
  const phaseKey = $derived(`${match.round}:${match.phase}`);
  $effect(() => {
    void phaseKey;
    localPick = null;
    localAnnounced = false;
  });

  const picked = $derived(match.yourPick ?? localPick);
  const announced = $derived(localAnnounced || you in match.announces);

  function onpick(gesture: string) {
    if (picked !== null) return;
    localPick = gesture;
    pick(gesture);
    statusEl?.focus(); // the disabled buttons drop keyboard focus
  }

  function onannounce(emote: string | null) {
    if (announced) return;
    localAnnounced = true;
    announce(emote);
    statusEl?.focus();
  }

  const nick = (seat: SeatId) => room.players[seat]?.nickname ?? '';
  const avatar = (seat: SeatId) => room.players[seat]?.avatar ?? '';
  const label = (seat: SeatId) => (isTeamMode ? nick(seat) : seat === you ? t('board.you') : t('board.opponent'));

  function side(team: 'a' | 'b', seat: SeatId): Side {
    return isTeamMode
      ? { name: t(`lobby.team_${team}`), avatar: null, team, score: match.score[team] }
      : { name: nick(seat), avatar: avatar(seat), team, score: match.score[team] };
  }
  const left = $derived(side(myTeam, you));
  const right = $derived(side(teamOf(opponent), opponent));

  const duels = $derived(match.phase === 'reveal' && match.lastRound ? duelViews(match.lastRound, you) : []);
  // The sound effect of every clash: a win is a POW, a loss a BAM, a draw a ZAP.
  const BURST = {
    win: { text: 'pow', variant: 'pow' },
    lose: { text: 'bam', variant: 'bam' },
    draw: { text: 'zap', variant: 'zap' },
  } as const;

  const roundOutcome = $derived(match.lastRound ? outcomeFor(match.lastRound.winner, myTeam) : 'draw');

  // Once the opponent has locked in, the thought bubble gives way to the ZACK star.
  const opponentLocked = $derived(match.phase !== 'announce' && match.lockedSeats.includes(opponent));
  const modeName = $derived(t(`mode.${room.config.mode}.name`));

  function opponentNotes(): string[] {
    const notes: string[] = [];
    if (match.phase !== 'announce') {
      notes.push(t(opponentLocked ? 'board.opponent_locked' : 'board.opponent_thinking'));
    }
    const said = match.announces[opponent];
    if (said) notes.push(t('board.opponent_announced', { gesture: t(gestureKey(said)) }));
    else if (said === null) notes.push(t('board.opponent_silent'));
    else if (match.phase === 'announce') notes.push(t('board.opponent_thinking'));
    return notes;
  }

  const prompt = $derived.by(() => {
    if (match.phase === 'reveal') return t(`result.round_${roundOutcome}`);
    if (match.phase === 'announce') return t(announced ? 'board.announced' : 'board.announce');
    return t(picked ? 'board.picked' : 'board.pick');
  });
</script>

<main class="board" class:picking={match.phase !== 'reveal'}>
  <Scoreboard {left} {right} round={match.round} bestOf={match.config.bestOf} {modeName} />
  <TimerBar deadline={room.deadline} phase={match.phase} />
  <!-- One persistent live region at one fixed position; where it shows is decided by CSS only. -->
  <p class="status bubble-status" role="status" tabindex="-1" bind:this={statusEl}>{prompt}</p>

  {#if match.phase === 'reveal'}
    {#each duels as duel (duel.mine)}
      {@const mineMissing = match.lastRound?.picks[duel.mine] === undefined}
      {@const theirsMissing = match.lastRound?.picks[duel.theirs] === undefined}
      <div class="duel clash" data-testid="duel">
        <PlayerCard label={label(duel.mine)} nickname={nick(duel.mine)} avatar={avatar(duel.mine)}
          gesture={match.lastRound?.picks[duel.mine]} missing={mineMissing} slam="left" />
        <PlayerCard label={label(duel.theirs)} nickname={nick(duel.theirs)} avatar={avatar(duel.theirs)}
          gesture={match.lastRound?.picks[duel.theirs]} missing={theirsMissing} slam="right" />
        <div class="impact"><ComicBurst text={t(`burst.${BURST[duel.outcome].text}`)} variant={BURST[duel.outcome].variant} /></div>
        {#if isTeamMode}<p class="duel-result">{t(`board.duel_${duel.outcome}`)}</p>{/if}
      </div>
    {/each}
    <button type="button" class="btn btn-primary" onclick={() => next()}>{t('board.next')}</button>
  {:else}
    <section class="who you" aria-label={label(you)}>
      <span class="nametag">{nick(you)}</span>
    </section>
    <section class="who them" aria-label={label(opponent)}>
      <ThinkBubble notes={opponentNotes()} locked={opponentLocked} />
      <span class="nametag">{nick(opponent)}</span>
    </section>
    {#if match.phase === 'announce'}
      <AnnouncePanel done={announced} {onannounce} />
    {:else}
      <GesturePad gestures={gestureSetFor(room.config.mode).gestures} {picked} {onpick} />
    {/if}
  {/if}
  {#if ['classic', 'team2v2'].includes(room.config.mode) && gestureSetFor(room.config.mode).id === 'classic'}<CameraToggle gestures={gestureSetFor(room.config.mode).gestures} {onpick} disabled={picked !== null || match.phase !== 'pick'} />{/if}
</main>

<style>
  .board {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: var(--space-4);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  /* The prompt is a speech bubble. */
  .status {
    justify-self: center;
    max-width: 100%;
    padding: var(--space-2) var(--space-5);
    border: var(--border);
    border-radius: var(--radius-lg);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    text-align: center;
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: 1.625rem;
    letter-spacing: 0.04em;
    line-height: 1.15;
    text-shadow: 2px 2px 0 var(--yellow);
  }

  /* :global, so the root elements of the child components span the board too. */
  .board > :global(*) {
    grid-column: 1 / -1;
  }

  /*
   * Pick phase, placed by CSS only: your status bubble above your nametag on the left, the opponent's
   * thought bubble and nametag on the right (rows: 1 scoreboard, 2 timer, 3 status, 4 nametag, 5 pad).
   */
  .picking > .status {
    grid-column: 1;
    grid-row: 3;
    align-self: end;
    justify-self: stretch;
    padding-inline: var(--space-3);
    text-align: start;
  }

  .picking > .you {
    grid-column: 1;
    grid-row: 4;
    align-self: start;
  }

  .picking > .them {
    grid-column: 2;
    grid-row: 3 / span 2;
  }

  .who {
    display: grid;
    align-content: start;
    gap: var(--space-2);
    min-width: 0;
  }

  .nametag {
    justify-self: start;
    max-width: 100%;
    padding: 0 var(--space-3);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--yellow);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    overflow-wrap: anywhere;
    font-weight: 700;
    line-height: 1.4;
    rotate: var(--tilt-1);
  }

  .them .nametag {
    justify-self: end;
    background: var(--sky);
    rotate: var(--tilt-2);
  }

  .duel {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  /* The burst sits on the seam between the two gestures. */
  .impact {
    --burst-size: 6.5rem;
    position: absolute;
    top: 3.2rem;
    left: 50%;
    translate: -50% 0;
    z-index: var(--z-raised);
  }

  @media (min-width: 40rem) {
    .impact {
      --burst-size: 8rem;
      top: 3rem;
    }
  }

  .duel-result {
    grid-column: 1 / -1;
    text-align: center;
    font-weight: 700;
  }

  .board > .btn {
    justify-self: center;
  }
</style>
