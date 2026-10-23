<script lang="ts">
  import { playerRoom } from '../lib/connection';
  import BoardView from './BoardView.svelte';
</script>

{#if $playerRoom?.match}
  <BoardView room={$playerRoom} match={$playerRoom.match} />
{/if}
