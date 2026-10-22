<script lang="ts">
  import { room } from '../lib/connection';
  import BoardView from './BoardView.svelte';
</script>

{#if $room?.match}
  <BoardView room={$room} match={$room.match} />
{/if}
