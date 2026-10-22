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
        <!-- Not only color: the chosen tile gets a check badge hanging over its corner. -->
        {#if value === avatar}<span class="check-badge" aria-hidden="true">✓</span>{/if}
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .avatars {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .avatar-chip {
    justify-content: center;
    min-width: 0;
    min-height: 72px;
    padding: var(--space-1);
    border-radius: 14px;
  }

  /* The shared chip check mark is replaced by the badge element. */
  .avatar-chip:has(input:checked)::after {
    content: none;
  }

  .check-badge {
    position: absolute;
    top: -0.55rem;
    right: -0.55rem;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 3px solid var(--line);
    border-radius: 50%;
    background: var(--red);
    color: var(--on-bright);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1;
    rotate: -6deg;
  }
</style>
