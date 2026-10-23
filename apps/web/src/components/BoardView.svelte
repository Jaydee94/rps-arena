<script lang="ts">
  import { gestureBeats, gestureSetFor, type PublicMatch, type PlayerView, type SeatId } from '@rps/shared';
  import { announce, leaveRoom, next, pick } from '../lib/connection';
  import { duelViews, outcomeFor, type Side } from '../lib/board';
  import { emitCountdownEnded, shouldCountDown } from '../lib/countdown';
  import { gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import { doesSentence } from '../lib/matchup-fx';
  import { opponentSeat, teamOf } from '../lib/seats';
  import AnnouncePanel from './AnnouncePanel.svelte';
  import CameraToggle from './CameraToggle.svelte';
  import Countdown from './Countdown.svelte';
  import GesturePad from './GesturePad.svelte';
  import RevealPanel from './RevealPanel.svelte';
  import RuleLines from './RuleLines.svelte';
  import RulesPanel from './RulesPanel.svelte';
  import Scoreboard from './Scoreboard.svelte';
  import SpectatorBadge from './SpectatorBadge.svelte';
  import ThinkBubble from './ThinkBubble.svelte';
  import TimerBar from './TimerBar.svelte';
  import TournamentHeader from './TournamentHeader.svelte';

  interface Props {
    room: PlayerView;
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

  /*
   * The countdown runs between the switch to reveal and the duels. The previous room is plain (not
   * $state): it only remembers what the last run saw. The pre-effect runs before the DOM updates, so
   * the duels never flash up before the countdown.
   */
  let countingDown = $state(false);
  // The score from before the reveal: the scoreboard must not give the result away during the countdown.
  let heldScore = $state<PublicMatch['score'] | null>(null);
  let prevRoom: PlayerView | null = null;
  $effect.pre(() => {
    const current = room;
    if (shouldCountDown(prevRoom, current)) {
      countingDown = true;
      heldScore = prevRoom?.match?.score ?? null;
    } else if (current.match?.phase !== 'reveal') {
      countingDown = false;
      heldScore = null;
    }
    prevRoom = current;
  });
  // May run while the Countdown is still mounting (beat 0 calls it at once); flips state and
  // releases the reveal sounds that wait for the countdown (lib/sfx-bridge.ts).
  const endCountdown = () => {
    countingDown = false;
    heldScore = null;
    emitCountdownEnded();
  };
  const shownScore = $derived(countingDown && heldScore ? heldScore : match.score);
  const revealing = $derived(match.phase === 'reveal' && !countingDown);

  const picked = $derived(match.yourPick ?? localPick);
  // Feedback after the pick: what the chosen gesture does to the others.
  const pickEffect = $derived.by(() => {
    if (picked === null) return null;
    const { gestures } = gestureSetFor(room.config.mode);
    if (!gestures.includes(picked)) return null;
    return t('board.picked_effect', { sentence: doesSentence(picked, gestureBeats({ gestures }, picked)) });
  });
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

  // Leaving a running match forfeits it, so it takes a second tap.
  let confirmingLeave = $state(false);

  function leave() {
    // Without the stored credentials the reload cannot silently rejoin this room.
    leaveRoom();
    location.assign('/');
  }

  const nick = (seat: SeatId) => room.players[seat]?.nickname ?? '';
  const avatar = (seat: SeatId) => room.players[seat]?.avatar ?? '';
  const label = (seat: SeatId) => (isTeamMode ? nick(seat) : seat === you ? t('board.you') : t('board.opponent'));

  function side(team: 'a' | 'b', seat: SeatId): Side {
    return isTeamMode
      ? { name: t(`lobby.team_${team}`), avatar: null, team, score: shownScore[team] }
      : { name: nick(seat), avatar: avatar(seat), team, score: shownScore[team] };
  }
  const left = $derived(side(myTeam, you));
  const right = $derived(side(teamOf(opponent), opponent));

  const duels = $derived(match.phase === 'reveal' && match.lastRound ? duelViews(match.lastRound, you) : []);
  const pickOf = (seat: SeatId): string | undefined => match.lastRound?.picks[seat];


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
    if (revealing) return t(`result.round_${roundOutcome}`);
    // During the countdown the status keeps the words from before the reveal; screen readers get the result once.
    if (match.phase === 'reveal') return t(picked || pickOf(you) ? 'board.picked' : 'board.pick');
    if (match.phase === 'announce') return t(announced ? 'board.announced' : 'board.announce');
    return t(picked ? 'board.picked' : 'board.pick');
  });
</script>

<!-- Tournament rooms only: the slim tournament bar sits above the screen, outside its main. -->
{#if room.tournament}<TournamentHeader tournament={room.tournament} />{/if}
<main class="board" class:picking={match.phase !== 'reveal'} class:revealed={revealing}>
  <Scoreboard {left} {right} round={match.round} bestOf={match.config.bestOf} {modeName} />
  <TimerBar deadline={room.deadline} phase={match.phase} />
  <!-- One persistent live region at one fixed position; where it shows is decided by CSS only. -->
  <p class="status bubble-status" class:is-revealed={revealing} role="status" tabindex="-1" bind:this={statusEl}>{prompt}</p>

  {#if match.phase === 'reveal'}
    {#if countingDown}
      <Countdown onDone={endCountdown} />
    {:else}
      <RevealPanel {duels} picks={match.lastRound?.picks ?? {}} {label} team={isTeamMode} />
      <button type="button" class="btn btn-primary next" onclick={() => next()}>{t('board.next')}</button>
      <RuleLines {duels} picks={match.lastRound?.picks ?? {}} />
    {/if}
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
      {#if pickEffect}<p class="pick-effect">{pickEffect}</p>{/if}
    {/if}
    <RulesPanel mode={room.config.mode} />
  {/if}
  {#if ['classic', 'team2v2'].includes(room.config.mode) && gestureSetFor(room.config.mode).id === 'classic'}<CameraToggle gestures={gestureSetFor(room.config.mode).gestures} {onpick} disabled={picked !== null || match.phase !== 'pick'} />{/if}
  <SpectatorBadge spectators={room.spectators} />
  <div class="exit">
    {#if confirmingLeave}
      <p role="alert">{t('board.leave_confirm')}</p>
      <button type="button" class="btn btn-small" onclick={leave}>{t('board.leave_yes')}</button>
      <button type="button" class="btn btn-small btn-primary" onclick={() => (confirmingLeave = false)}>
        {t('board.leave_stay')}
      </button>
    {:else}
      <button type="button" class="btn btn-small" onclick={() => (confirmingLeave = true)}>{t('board.leave')}</button>
    {/if}
  </div>
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

  .pick-effect {
    justify-self: center;
    max-width: 100%;
    margin: 0;
    overflow-wrap: anywhere;
    text-align: center;
    font-weight: 700;
  }

  .exit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
  }

  .exit > p {
    flex-basis: 100%;
    text-align: center;
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

  .board > .btn {
    justify-self: center;
  }

  /* Last in every phase: the pick-phase rows and the reveal order above stay as they are. */
  .board > :global(.spectator-badge) {
    order: 9;
    justify-self: end;
  }

  /*
   * Reveal phase, placed by CSS only (grid order): the panel(s) or the countdown first, then the
   * status bubble with "Weiter" beside it, then the rule line, the camera row last.
   */
  /* The button keeps its width; the bubble takes the rest of the row. */
  .board.revealed {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .board.revealed > .status {
    order: 2;
    grid-column: 1;
    align-self: center;
    justify-self: start;
    padding-inline: var(--space-4);
    font-size: clamp(1.25rem, 6vw, 1.625rem);
  }

  .board.revealed > .next {
    order: 2;
    grid-column: 2;
    align-self: center;
    padding-inline: var(--space-4);
  }

  /* The rule lines (RuleLines) carry their own look; the board only places them. */
  .board.revealed > :global(.rule) {
    order: 3;
  }

  .board.revealed > :global(.camera) {
    order: 4;
  }
</style>
