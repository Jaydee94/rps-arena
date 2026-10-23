<script lang="ts">
  import { gestureSetFor, type PublicMatch, type RoomView, type SeatId } from '@rps/shared';
  import { announce, next, pick } from '../lib/connection';
  import { duelViews, outcomeFor, type DuelView, type Side } from '../lib/board';
  import { emitCountdownEnded, shouldCountDown } from '../lib/countdown';
  import { gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import { opponentSeat, teamOf } from '../lib/seats';
  import AnnouncePanel from './AnnouncePanel.svelte';
  import CameraToggle from './CameraToggle.svelte';
  import ComicBurst from './ComicBurst.svelte';
  import Countdown from './Countdown.svelte';
  import GesturePad from './GesturePad.svelte';
  import PlayerCard from './PlayerCard.svelte';
  import RulesPanel from './RulesPanel.svelte';
  import Scoreboard from './Scoreboard.svelte';
  import SpeedLines from './SpeedLines.svelte';
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

  /*
   * The countdown runs between the switch to reveal and the duels. The previous room is plain (not
   * $state): it only remembers what the last run saw. The pre-effect runs before the DOM updates, so
   * the duels never flash up before the countdown.
   */
  let countingDown = $state(false);
  // The score from before the reveal: the scoreboard must not give the result away during the countdown.
  let heldScore = $state<PublicMatch['score'] | null>(null);
  let prevRoom: RoomView | null = null;
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
      ? { name: t(`lobby.team_${team}`), avatar: null, team, score: shownScore[team] }
      : { name: nick(seat), avatar: avatar(seat), team, score: shownScore[team] };
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

  const pickOf = (seat: SeatId): string | undefined => match.lastRound?.picks[seat];

  /** "Stein schlägt Schere" for a duel that someone won with a real gesture; null for draws and timeouts. */
  function ruleFor(duel: DuelView): string | null {
    const mine = pickOf(duel.mine);
    const theirs = pickOf(duel.theirs);
    if (duel.outcome === 'draw' || !mine || !theirs) return null;
    const [winner, loser] = duel.outcome === 'win' ? [mine, theirs] : [theirs, mine];
    return t('board.rule', { winner: t(gestureKey(winner)), loser: t(gestureKey(loser)) });
  }
  const rules = $derived(duels.map(ruleFor).filter((rule): rule is string => rule !== null));

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

<main class="board" class:picking={match.phase !== 'reveal'} class:revealed={revealing}>
  <Scoreboard {left} {right} round={match.round} bestOf={match.config.bestOf} {modeName} />
  <TimerBar deadline={room.deadline} phase={match.phase} />
  <!-- One persistent live region at one fixed position; where it shows is decided by CSS only. -->
  <p class="status bubble-status" class:is-revealed={revealing} role="status" tabindex="-1" bind:this={statusEl}>{prompt}</p>

  {#if match.phase === 'reveal'}
    {#if countingDown}
      <Countdown onDone={endCountdown} />
    {:else}
      <!-- One diagonally split comic panel per duel: own side on top in yellow, the opponent below in blue. -->
      {#each duels as duel (duel.mine)}
        <div class="duel clash" class:team={isTeamMode} data-testid="duel">
          <span class="half half-mine" aria-hidden="true"></span>
          <span class="half half-theirs" aria-hidden="true"></span>
          <SpeedLines />
          <span class="impact-flash" aria-hidden="true"></span>
          <PlayerCard label={label(duel.mine)} gesture={pickOf(duel.mine)} side="mine"
            loser={duel.outcome === 'lose'} compact={isTeamMode} />
          <PlayerCard label={label(duel.theirs)} gesture={pickOf(duel.theirs)} side="theirs"
            loser={duel.outcome === 'win'} compact={isTeamMode} />
          <div class="impact"><ComicBurst text={t(`burst.${BURST[duel.outcome].text}`)} variant={BURST[duel.outcome].variant} /></div>
          {#if isTeamMode}<p class="duel-result">{t(`board.duel_${duel.outcome}`)}</p>{/if}
        </div>
      {/each}
      <button type="button" class="btn btn-primary next" onclick={() => next()}>{t('board.next')}</button>
      {#each rules as rule, i (i)}
        <p class="rule">{rule}</p>
      {/each}
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
    {/if}
    <RulesPanel mode={room.config.mode} />
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

  .board > .btn {
    justify-self: center;
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

  .board.revealed > .rule {
    order: 3;
  }

  .board.revealed > :global(.camera) {
    order: 4;
  }

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
    /* Width the result chip may take; PlayerCard keeps the own name tag clear of it. */
    --chip-w: 7.5rem;
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
    max-width: var(--chip-w);
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

  .rule {
    justify-self: center;
    max-width: 100%;
    overflow-wrap: anywhere;
    text-align: center;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.04em;
  }
</style>
