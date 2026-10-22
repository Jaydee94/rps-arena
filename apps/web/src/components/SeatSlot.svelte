<script lang="ts">
  import type { PublicPlayer, SeatId } from '@rps/shared';
  import { avatarEmoji } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';

  interface Props {
    seat: SeatId;
    player: PublicPlayer | undefined;
    isYou: boolean;
    isHostSeat: boolean;
    /** Team mode: the host moves anyone, a guest only themselves; free seats are drop targets. */
    canMove: boolean;
    /** The seat of the player currently picked up for moving. */
    selected: SeatId | null;
    onselect: (seat: SeatId) => void;
    onmoveHere: (seat: SeatId) => void;
  }

  let { seat, player, isYou, isHostSeat, canMove, selected, onselect, onmoveHere }: Props = $props();
</script>

<div class="slot card" class:free={!player} data-testid="seat-{seat}">
  {#if player}
    <span class="avatar" aria-hidden="true">{avatarEmoji(player.avatar)}</span>
    <span class="who">
      <span class="nick">{player.nickname}</span>
      <span class="tags">
        {#if isYou}<span>{t('lobby.you')}</span>{/if}
        {#if isHostSeat}<span>{t('lobby.host')}</span>{/if}
        {#if player.isBot}<span>{t('lobby.bot')}</span>{/if}
        {#if !player.connected}<span>{t('lobby.disconnected')}</span>{/if}
      </span>
    </span>
    {#if canMove}
      <button type="button" class="btn btn-small" aria-pressed={selected === seat} onclick={() => onselect(seat)}>
        {t('lobby.move')}
      </button>
    {/if}
  {:else}
    <span class="who empty">{t('lobby.empty_seat')}</span>
    {#if canMove && selected !== null}
      <button type="button" class="btn btn-small" onclick={() => onmoveHere(seat)}>{t('lobby.move_here')}</button>
    {/if}
  {/if}
</div>

<style>
  .slot {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 4.5rem;
    box-shadow: var(--shadow-sm);
  }

  .free {
    border-style: dashed;
    box-shadow: none;
  }

  .avatar {
    font-size: var(--text-2xl);
    line-height: 1;
  }

  .who {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .nick {
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }

  .empty {
    font-style: italic;
  }

  .btn[aria-pressed='true'] {
    background: var(--yellow);
    color: var(--on-bright);
  }
</style>
