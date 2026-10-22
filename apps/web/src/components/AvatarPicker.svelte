<script lang="ts">
  import { AVATARS } from '@rps/shared';
  import { avatarEmoji } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';

  interface Props {
    value: string;
  }

  let { value = $bindable() }: Props = $props();
</script>

<fieldset class="group">
  <legend>{t('home.avatar')}</legend>
  <div class="avatars">
    {#each AVATARS as avatar (avatar)}
      <label class="chip">
        <input type="radio" name="avatar" value={avatar} bind:group={value} aria-label={t(`avatar.${avatar}`)} />
        <span class="emoji" aria-hidden="true">{avatarEmoji(avatar)}</span>
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

  .emoji {
    font-size: var(--text-xl);
    line-height: 1;
  }
</style>
