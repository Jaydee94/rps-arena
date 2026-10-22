<script lang="ts">
  import { t } from '../lib/i18n';
</script>

<!-- The header band of the spectator screens: who you are in this room. -->
<p class="banner">{t('spectate.banner')}</p>

<style>
  .banner {
    justify-self: center;
    max-width: 100%;
    margin: 0;
    padding: 0 var(--space-5);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--blue);
    color: var(--on-blue);
    box-shadow: var(--shadow-sm);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.04em;
    line-height: 1.4;
    overflow-wrap: anywhere;
    text-align: center;
    rotate: var(--tilt-1);
  }
</style>
