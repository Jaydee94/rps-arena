<script lang="ts">
  import { gestureSetFor, type PublicMatch, type RoomView, type SeatId } from '@rps/shared';
  import { announce, next, pick } from '../lib/connection';
  import { duelViews, outcomeFor, type Side } from '../lib/board';
  import { avatarEmoji, gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import { opponentSeat, teamOf } from '../lib/seats';
  import AnnouncePanel from './AnnouncePanel.svelte';
  import GesturePad from './GesturePad.svelte';
  import PlayerCard from './PlayerCard.svelte';
  import Scoreboard from './Scoreboard.svelte';
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
  const avatar = (seat: SeatId) => avatarEmoji(room.players[seat]?.avatar ?? '');
  const label = (seat: SeatId) => (isTeamMode ? nick(seat) : seat === you ? t('board.you') : t('board.opponent'));

  function side(team: 'a' | 'b', seat: SeatId): Side {
    return isTeamMode
      ? { name: t(`lobby.team_${team}`), avatar: team === 'a' ? '🟥' : '🟦', score: match.score[team] }
      : { name: nick(seat), avatar: avatar(seat), score: match.score[team] };
  }
  const left = $derived(side(myTeam, you));
  const right = $derived(side(teamOf(opponent), opponent));

  const duels = $derived(match.phase === 'reveal' && match.lastRound ? duelViews(match.lastRound, you) : []);
  const roundOutcome = $derived(match.lastRound ? outcomeFor(match.lastRound.winner, myTeam) : 'draw');

  function opponentNotes(): string[] {
    const notes: string[] = [];
    if (match.phase !== 'announce') {
      notes.push(t(match.lockedSeats.includes(opponent) ? 'board.opponent_locked' : 'board.opponent_thinking'));
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

<main class="board">
  <Scoreboard {left} {right} round={match.round} bestOf={match.config.bestOf} />
  <TimerBar deadline={room.deadline} phase={match.phase} />
  <p class="status" role="status" tabindex="-1" bind:this={statusEl}>{prompt}</p>

  {#if match.phase === 'reveal'}
    {#each duels as duel (duel.mine)}
      {@const mineMissing = match.lastRound?.picks[duel.mine] === undefined}
      {@const theirsMissing = match.lastRound?.picks[duel.theirs] === undefined}
      <div class="duel" data-testid="duel">
        <PlayerCard label={label(duel.mine)} nickname={nick(duel.mine)} avatar={avatar(duel.mine)}
          gesture={match.lastRound?.picks[duel.mine]} missing={mineMissing} />
        <PlayerCard label={label(duel.theirs)} nickname={nick(duel.theirs)} avatar={avatar(duel.theirs)}
          gesture={match.lastRound?.picks[duel.theirs]} missing={theirsMissing} />
        {#if isTeamMode}<p class="duel-result">{t(`board.duel_${duel.outcome}`)}</p>{/if}
      </div>
    {/each}
    <button type="button" class="btn btn-primary" onclick={() => next()}>{t('board.next')}</button>
  {:else}
    <div class="duel">
      <PlayerCard label={label(you)} nickname={nick(you)} avatar={avatar(you)} gesture={picked} />
      <PlayerCard label={label(opponent)} nickname={nick(opponent)} avatar={avatar(opponent)}
        notes={opponentNotes()} />
    </div>
    {#if match.phase === 'announce'}
      <AnnouncePanel done={announced} {onannounce} />
    {:else}
      <GesturePad gestures={gestureSetFor(room.config.mode).gestures} {picked} {onpick} />
    {/if}
  {/if}
</main>

<style>
  .board {
    display: grid;
    gap: var(--space-4);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  .status {
    text-align: center;
    font-family: var(--font-display);
    font-size: var(--text-xl);
  }

  .duel {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
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
