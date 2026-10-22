<script lang="ts">
  import { AVATARS } from '@rps/shared';
  import { t } from '../lib/i18n';
  import Avatar from './Avatar.svelte';

  interface Props {
    value: string;
  }

  let { value = $bindable() }: Props = $props();
</script>

<fieldset class="group">
  <legend>{t('home.avatar')}</legend>
  <div class="avatars">
    {#each AVATARS as avatar (avatar)}
      <label class="chip avatar-chip">
        <input type="radio" name="avatar" value={avatar} bind:group={value} aria-label={t(`avatar.${avatar}`)} />
        <Avatar id={avatar} size={48} />
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .avatars {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .avatar-chip {
    padding: var(--space-1);
    border-radius: 50%;
  }

  /* The check mark becomes a small badge in the corner. */
  .avatar-chip:has(input:checked)::after {
    position: absolute;
    right: -0.45rem;
    bottom: -0.45rem;
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 3px solid var(--line);
    border-radius: 50%;
    background: var(--teal);
    color: var(--on-bright);
    font-size: 0.8rem;
    line-height: 1;
  }

  .avatar-chip:has(input:checked) {
    background: var(--yellow);
    scale: 1.08;
  }
</style>
