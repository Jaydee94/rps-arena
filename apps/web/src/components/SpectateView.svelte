<script lang="ts">
  import { activeSeats, type PublicMatch, type SeatId, type SpectatorView, type Team } from '@rps/shared';
  import { leaveRoom } from '../lib/connection';
  import { duelViews, type Side } from '../lib/board';
  import { emitCountdownEnded, shouldCountDown } from '../lib/countdown';
  import { gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import { teamOf } from '../lib/seats';
  import Avatar from './Avatar.svelte';
  import Countdown from './Countdown.svelte';
  import RevealPanel from './RevealPanel.svelte';
  import RuleLines from './RuleLines.svelte';
  import Scoreboard from './Scoreboard.svelte';
  import SpectateBanner from './SpectateBanner.svelte';
  import ThinkBubble from './ThinkBubble.svelte';
  import TimerBar from './TimerBar.svelte';
  import TournamentHeader from './TournamentHeader.svelte';

  interface Props {
    room: SpectatorView;
    match: PublicMatch;
  }

  let { room, match }: Props = $props();

  const TEAMS: Team[] = ['a', 'b'];
  const isTeamMode = $derived(room.config.mode === 'team2v2');

  /*
   * Same countdown rules as BoardView (the sound bridge delays the reveal sound by the countdown for
   * spectators too): the countdown runs between the switch to reveal and the duels, and the scoreboard
   * keeps the score from before the reveal meanwhile. Deliberately a small copy, not a shared helper:
   * BoardView stays untouched here. `endCountdown` is the single hook that ends the countdown.
   */
  let countingDown = $state(false);
  let heldScore = $state<PublicMatch['score'] | null>(null);
  let prevRoom: SpectatorView | null = null;
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
  // releases the reveal sounds that wait for the countdown (lib/sfx-bridge.ts), as in BoardView.
  const endCountdown = () => {
    countingDown = false;
    heldScore = null;
    emitCountdownEnded();
  };
  const shownScore = $derived(countingDown && heldScore ? heldScore : match.score);
  const revealing = $derived(match.phase === 'reveal' && !countingDown);

  const nick = (seat: SeatId) => room.players[seat]?.nickname ?? '';
  const seatsOf = (team: Team): SeatId[] => activeSeats(room.config.mode).filter((seat) => teamOf(seat) === team);
  /** Name of a side: the team in 2v2, the player in a duel. */
  const sideName = (team: Team) => (isTeamMode ? t(`lobby.team_${team}`) : nick(`${team}0`));

  function side(team: Team): Side {
    const avatar = isTeamMode ? null : (room.players[`${team}0`]?.avatar ?? '');
    return { name: sideName(team), avatar, team, score: shownScore[team] };
  }
  const left = $derived(side('a'));
  const right = $derived(side('b'));
  const modeName = $derived(t(`mode.${room.config.mode}.name`));

  // Team a on top, as on the scoreboard; there is no "you" to put first.
  const duels = $derived(revealing && match.lastRound ? duelViews(match.lastRound, 'a0') : []);

  /**
   * Notes of a side: who is still thinking, who has locked in, and what a bluffer announced (public by
   * design). Never a pick.
   */
  function notesOf(team: Team): string[] {
    const notes: string[] = [];
    for (const seat of seatsOf(team)) {
      const name = nick(seat);
      const said = match.announces[seat];
      if (match.phase !== 'announce') {
        notes.push(t(match.lockedSeats.includes(seat) ? 'spectate.locked' : 'spectate.waiting_pick', { name }));
      }
      if (said) notes.push(t('spectate.announced', { name, gesture: t(gestureKey(said)) }));
      else if (said === null) notes.push(t('spectate.silent', { name }));
      else if (match.phase === 'announce') notes.push(t('spectate.waiting_pick', { name }));
    }
    return notes;
  }
  const lockedOf = (team: Team) => {
    const seats = seatsOf(team);
    return match.phase !== 'announce' && seats.length > 0 && seats.every((seat) => match.lockedSeats.includes(seat));
  };

  const prompt = $derived.by(() => {
    if (match.phase === 'finished') return t('spectate.over');
    if (revealing) {
      const winner = match.lastRound?.winner;
      return winner && winner !== 'draw' ? t('spectate.round_won', { name: sideName(winner) }) : t('result.round_draw');
    }
    // During the countdown the status keeps the words from before the reveal.
    return t('spectate.pick');
  });

  const winner = $derived(match.winner);

  function leave() {
    // Without the stored credentials the reload cannot silently rejoin this room.
    leaveRoom();
    location.assign('/');
  }
</script>

<!-- Tournament rooms only: the slim tournament bar sits above the screen, outside its main. -->
{#if room.tournament}<TournamentHeader tournament={room.tournament} />{/if}
<main class="spectate" data-testid="spectate">
  <SpectateBanner />
  <Scoreboard {left} {right} round={match.round} bestOf={match.config.bestOf} {modeName} />
  <TimerBar deadline={room.deadline} phase={match.phase} />
  <!-- One persistent live region at one fixed position, whatever the phase. -->
  <p class="status bubble-status" class:is-revealed={revealing} role="status">{prompt}</p>

  {#if match.phase === 'finished'}
    <section class="panel over">
      {#if winner === null}
        <h2 class="headline">{t('result.abandoned.title')}</h2>
      {:else}
        {#if !isTeamMode}<span class="avatar-hero"><Avatar id={room.players[`${winner}0`]?.avatar ?? ''} size={96} /></span>{/if}
        <h2 class="headline">{t('spectate.finished', { name: sideName(winner) })}</h2>
      {/if}
      <button type="button" class="btn btn-primary" onclick={leave}>{t('result.leave')}</button>
    </section>
  {:else if match.phase === 'reveal'}
    {#if countingDown}
      <Countdown onDone={endCountdown} />
    {:else}
      <RevealPanel {duels} picks={match.lastRound?.picks ?? {}} label={nick} team={isTeamMode} />
      <RuleLines {duels} picks={match.lastRound?.picks ?? {}} />
    {/if}
  {:else}
    {#each TEAMS as team (team)}
      <section class="who who-{team}" aria-label={sideName(team)}>
        <ThinkBubble notes={notesOf(team)} locked={lockedOf(team)} />
        <span class="nametag">{sideName(team)}</span>
      </section>
    {/each}
  {/if}
</main>

<style>
  .spectate {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-4);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  /* :global, so the root elements of the child components span the screen too. */
  .spectate > :global(*) {
    grid-column: 1 / -1;
  }

  /* The sentence about the round is a speech bubble, as on the board. */
  .status {
    justify-self: center;
    max-width: 100%;
    margin: 0;
    padding: var(--space-2) var(--space-5);
    border: var(--border);
    border-radius: var(--radius-lg);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    text-align: center;
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 6vw, 1.625rem);
    letter-spacing: 0.04em;
    line-height: 1.15;
    text-shadow: 2px 2px 0 var(--yellow);
  }

  /* Pick phase: one column per side, each with its thought bubble above the nametag. */
  .spectate > .who {
    grid-column: auto;
    display: grid;
    align-content: start;
    gap: var(--space-2);
    min-width: 0;
  }

  .who-b {
    justify-items: end;
  }

  .nametag {
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

  .who-b .nametag {
    background: var(--sky);
    rotate: var(--tilt-2);
  }

  /* The closing box. */
  .over {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-4);
    background: var(--sticker);
    color: var(--on-bright);
    text-align: center;
  }

  .avatar-hero {
    display: block;
    padding: var(--space-1);
    border: var(--border);
    border-radius: 50%;
    background: var(--sticker);
    box-shadow: var(--shadow);
  }

  .headline {
    max-width: 100%;
    overflow-wrap: anywhere;
    font-size: var(--text-xl);
    text-wrap: balance;
  }
</style>
