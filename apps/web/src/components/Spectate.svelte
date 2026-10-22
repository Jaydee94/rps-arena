<script lang="ts">
  import { spectatorRoom } from '../lib/connection';
  import SpectateView from './SpectateView.svelte';
</script>

<!-- The spectator's screen for every phase of a running or finished match; the lobby has no spectators. -->
{#if $spectatorRoom?.match}
  <SpectateView room={$spectatorRoom} match={$spectatorRoom.match} />
{:else}
  <main data-testid="spectate"></main>
{/if}
