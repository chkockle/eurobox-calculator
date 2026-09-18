<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { app } from '../lib/state/app.svelte';
  import NumField from './NumField.svelte';

  const s = $derived(app.project.settings);
</script>

<section class="card stack" aria-labelledby="settings-h">
  <h2 id="settings-h">{t('settings.section')}</h2>
  <div class="grid-fields">
    <NumField label={t('settings.tolerance')} unit="mm" bind:value={s.tolerance} hint={t('settings.toleranceHint')} />
    <NumField label={t('settings.gap')} unit="mm" bind:value={s.gap} hint={t('settings.gapHint')} />
    <NumField label={t('settings.topClearance')} unit="mm" bind:value={s.topClearance} hint={t('settings.topClearanceHint')} />
    <NumField
      label={t('settings.minSupport')}
      unit="%"
      min={50}
      max={100}
      hint={t('settings.minSupportHint')}
      bind:value={() => Math.round(s.minSupport * 100), (v) => (s.minSupport = Math.min(1, Math.max(0.5, (v ?? 67) / 100)))}
    />
  </div>
  <div class="row">
    <label class="row"><input type="checkbox" bind:checked={s.lids} /> {t('settings.lids')}</label>
    {#if s.lids}<NumField compact label={t('settings.lidHeight')} unit="mm" bind:value={s.lidHeight} />{/if}
  </div>
  <div class="grid-fields">
    <NumField label={t('settings.kgPerLitre')} unit="kg/L" nullable step="any" bind:value={s.kgPerLitre} hint={t('settings.kgPerLitreHint')} />
    <label class="field">
      <span class="label">{t('settings.currency')}</span>
      <input type="text" maxlength="5" size="5" bind:value={s.currency} />
    </label>
  </div>
</section>

<style>
  .field { display: flex; flex-direction: column; gap: 0.2rem; }
  .label { font-size: 0.85rem; font-weight: 500; }
  input[type='text'] { width: 5rem; }
</style>
