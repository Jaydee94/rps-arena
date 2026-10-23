<script lang="ts">
  import { spectatorRoom } from '../lib/connection';
  import SpectateView from './SpectateView.svelte';
  import SpectateWaiting from './SpectateWaiting.svelte';
</script>

<!-- The spectator's screen: a running or finished match, or the waiting screen when the room has no match. -->
{#if $spectatorRoom?.match}
  <SpectateView room={$spectatorRoom} match={$spectatorRoom.match} />
{:else if $spectatorRoom}
  <SpectateWaiting room={$spectatorRoom} />
{/if}
