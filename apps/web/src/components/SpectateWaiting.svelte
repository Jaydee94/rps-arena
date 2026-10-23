<script lang="ts">
  import type { SpectatorView } from '@rps/shared';
  import { forgetSession } from '../lib/connection';
  import { t } from '../lib/i18n';
  import SpectateBanner from './SpectateBanner.svelte';
  import SpectatorBadge from './SpectatorBadge.svelte';

  interface Props {
    room: SpectatorView;
  }

  let { room }: Props = $props();

  function leave() {
    // Without the stored credentials the reload cannot silently rejoin this room.
    forgetSession();
    location.assign('/');
  }
</script>

<!-- No match (the room is back in the lobby, e.g. after a rematch): nothing to watch yet. -->
<main class="waiting" data-testid="spectate">
  <SpectateBanner />
  <p class="status" role="status">{t('spectate.waiting')}</p>
  <SpectatorBadge spectators={room.spectators} />
  <button type="button" class="btn btn-primary" onclick={leave}>{t('result.leave')}</button>
</main>

<style>
  .waiting {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  .waiting > :global(.spectator-badge) {
    justify-self: center;
  }

  .status {
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
</style>
