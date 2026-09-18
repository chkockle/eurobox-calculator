<script lang="ts">
  import { fmt, t } from '../lib/i18n/index.svelte';
  import { app } from '../lib/state/app.svelte';
  import { DATASET_BOXES, estimateCapacityL, footprintKey } from '../lib/model/catalog';
  import { uid } from '../lib/model/shelfGen';
  import type { BoxType, Family } from '../lib/model/types';
  import { boxColor, boxName } from '../lib/display';
  import NumField from './NumField.svelte';

  const families: Family[] = ['euro', 'alc', 'klt'];

  function groups(family: Family): [string, BoxType[]][] {
    const map = new Map<string, BoxType[]>();
    for (const b of DATASET_BOXES.filter((x) => x.family === family)) {
      const k = footprintKey(b);
      map.set(k, [...(map.get(k) ?? []), b]);
    }
    return [...map];
  }

  const enabled = $derived(new Set(app.project.enabledBoxIds));

  function toggle(id: string, on: boolean) {
    const list = app.project.enabledBoxIds;
    if (on && !list.includes(id)) list.push(id);
    if (!on) app.project.enabledBoxIds = list.filter((x) => x !== id);
  }

  function setAll(ids: string[], on: boolean) {
    const set = new Set(app.project.enabledBoxIds);
    for (const id of ids) on ? set.add(id) : set.delete(id);
    app.project.enabledBoxIds = [...set];
  }

  function setPrice(id: string, v: number | null) {
    if (v == null || v < 0) delete app.project.prices[id];
    else app.project.prices[id] = v;
  }

  const fpLabel = (k: string) => k.split('×').map((mm) => Number(mm) / 10).join('×');

  // custom box form
  let draft = $state({ name: '', length: 600, width: 400, height: 220, capacity: null as number | null, lidded: false });
  const estimate = $derived(estimateCapacityL(draft));

  function addCustom() {
    if (draft.length <= 0 || draft.width <= 0 || draft.height <= 0) return;
    const box: BoxType = {
      id: `custom-${uid()}`,
      family: 'custom',
      length: Math.max(draft.length, draft.width),
      width: Math.min(draft.length, draft.width),
      height: draft.height,
      capacityL: draft.capacity ?? estimate,
      lidded: draft.lidded,
      name: draft.name.trim(),
    };
    app.project.customBoxes.push(box);
    app.project.enabledBoxIds.push(box.id);
    draft.name = '';
    draft.capacity = null;
  }

  function removeCustom(id: string) {
    app.project.customBoxes = app.project.customBoxes.filter((b) => b.id !== id);
    app.project.enabledBoxIds = app.project.enabledBoxIds.filter((x) => x !== id);
    delete app.project.prices[id];
  }
</script>

{#snippet boxRow(b: BoxType)}
  <div class="box-row" role="listitem">
    <label class="row name">
      <input type="checkbox" checked={enabled.has(b.id)} onchange={(e) => toggle(b.id, e.currentTarget.checked)} />
      <span class="swatch" style:background={boxColor(b)}></span>
      <span>{boxName(b)}</span>
    </label>
    <span class="muted num cap">{b.capacityL != null ? t('boxes.capacity', { l: fmt(b.capacityL, 1) }) : '–'}</span>
    <span class="price">
      <NumField
        compact
        nullable
        label={`${t('boxes.price')} ${boxName(b)}`}
        unit={app.project.settings.currency}
        step="any"
        placeholder={t('boxes.price')}
        bind:value={() => app.project.prices[b.id] ?? null, (v) => setPrice(b.id, v)}
      />
    </span>
  </div>
{/snippet}

<section class="card stack" aria-labelledby="boxes-h">
  <div>
    <h2 id="boxes-h">{t('boxes.section')}</h2>
    <small>{t('boxes.hint')}</small>
  </div>

  {#each families as family (family)}
    <details class="box" open={family === 'euro' || undefined}>
      <summary>{t(`boxes.family.${family}` as const)}</summary>
      <div class="stack">
        {#each groups(family) as [fp, list] (fp)}
          <div>
            <div class="row group-head">
              <strong>{t('boxes.footprint', { fp: fpLabel(fp) })}</strong>
              <button class="link" onclick={() => setAll(list.map((b) => b.id), true)}>{t('boxes.all')}</button>
              <button class="link" onclick={() => setAll(list.map((b) => b.id), false)}>{t('boxes.none')}</button>
            </div>
            <div class="list" role="list">
              {#each list as b (b.id)}{@render boxRow(b)}{/each}
            </div>
          </div>
        {/each}
      </div>
    </details>
  {/each}

  <details class="box" open={app.project.customBoxes.length > 0 || undefined}>
    <summary>{t('boxes.family.custom')}</summary>
    <div class="stack">
      {#if app.project.customBoxes.length}
        <div class="list" role="list">
          {#each app.project.customBoxes as b (b.id)}
            <div class="custom-row">
              {@render boxRow(b)}
              <button class="icon" aria-label={t('boxes.customRemove')} title={t('boxes.customRemove')} onclick={() => removeCustom(b.id)}>✕</button>
            </div>
          {/each}
        </div>
      {/if}
      <h3>{t('boxes.customAdd')}</h3>
      <small>{t('boxes.customHint')}</small>
      <div class="grid-fields">
        <label class="field">
          <span class="label">{t('boxes.customName')}</span>
          <input type="text" bind:value={draft.name} />
        </label>
        <NumField label={t('boxes.customLength')} unit="mm" bind:value={draft.length} />
        <NumField label={t('boxes.customWidth')} unit="mm" bind:value={draft.width} />
        <NumField label={t('boxes.customHeight')} unit="mm" bind:value={draft.height} />
        <NumField label={t('boxes.customCapacity')} nullable step="any" placeholder={fmt(estimate, 1)} bind:value={draft.capacity} />
      </div>
      <label class="row"><input type="checkbox" bind:checked={draft.lidded} /> {t('boxes.customLidded')}</label>
      <div><button class="primary" onclick={addCustom}>{t('boxes.customSave')}</button></div>
    </div>
  </details>
</section>

<style>
  .list { margin: 0.3rem 0 0; display: grid; gap: 0.15rem; }
  .box-row { display: grid; grid-template-columns: 1fr auto auto; gap: 0.5rem; align-items: center; font-size: 0.9rem; }
  .custom-row { display: grid; grid-template-columns: 1fr auto; gap: 0.5rem; align-items: center; }
  .name { flex-wrap: nowrap; gap: 0.45rem; }
  .cap { min-width: 3.5rem; text-align: right; font-size: 0.85rem; }
  .group-head { font-size: 0.85rem; gap: 0.6rem; }
  .field { display: flex; flex-direction: column; gap: 0.2rem; }
  .label { font-size: 0.85rem; font-weight: 500; }
  @media (max-width: 420px) { .box-row { grid-template-columns: 1fr auto; } .price { grid-column: 1 / -1; justify-self: end; } }
</style>
