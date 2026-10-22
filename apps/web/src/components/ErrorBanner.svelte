<script lang="ts">
  import { clearError, lastError } from '../lib/connection';
  import { t } from '../lib/i18n';
</script>

{#if $lastError}
  <div class="banner" role="alert">
    <span>{t(`errors.${$lastError.code}`)}</span>
    <button type="button" class="btn btn-small" onclick={() => clearError()}>
      {t('errors.dismiss')}
    </button>
  </div>
{/if}

<style>
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: var(--border);
    border-radius: var(--radius);
    background: var(--danger);
    color: var(--on-bright);
    box-shadow: var(--shadow);
    font-weight: 700;
  }

  .banner .btn {
    color: var(--text);
  }
</style>
