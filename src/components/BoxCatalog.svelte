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
  const countIn = (list: BoxType[]) => list.filter((b) => enabled.has(b.id)).length;

  function toggle(id: string) {
    if (enabled.has(id)) app.project.enabledBoxIds = app.project.enabledBoxIds.filter((x) => x !== id);
    else app.project.enabledBoxIds.push(id);
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

  const fpLabel = (k: string) => k.split('×').map((mm) => Number(mm) / 10).join(' × ');
  const cm = (mm: number) => fmt(mm / 10, 1);

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

{#snippet tile(b: BoxType)}
  {@const on = enabled.has(b.id)}
  {@const bh = 6 + Math.min(1, b.height / 470) * 20}
  <div class="tile" class:on>
    <button class="pick" aria-pressed={on} title={boxName(b)} onclick={() => toggle(b.id)}>
      <svg viewBox="0 0 44 34" aria-hidden="true">
        <path d={`M4 ${31 - bh} l8 -5 h28 l-8 5 z`} fill={boxColor(b)} opacity="0.7" />
        <path d={`M32 ${31 - bh} l8 -5 v${bh} l-8 5 z`} fill={boxColor(b)} opacity="0.85" />
        <rect x="4" y={31 - bh} width="28" height={bh} fill={boxColor(b)} />
      </svg>
      <span class="h">↕ {b.family === 'custom' && b.name ? b.name : `${cm(b.height)} cm`}</span>
      <span class="cap muted">{b.capacityL != null ? `${fmt(b.capacityL, 1)} L` : '–'}</span>
    </button>
    {#if app.showPrices && on}
      <NumField
        compact
        nullable
        label={`${t('boxes.price')} ${boxName(b)}`}
        unit={app.project.settings.currency}
        step="any"
        placeholder={t('boxes.price')}
        bind:value={() => app.project.prices[b.id] ?? null, (v) => setPrice(b.id, v)}
      />
    {/if}
  </div>
{/snippet}

{#snippet footprintGroup(fp: string, list: BoxType[], open: boolean)}
  <details class="fp" {open}>
    <summary>
      <strong>{fpLabel(fp)} cm</strong>
      <span class="muted count" class:some={countIn(list) > 0}>{t('boxes.selected', { n: countIn(list), total: list.length })}</span>
    </summary>
    <div class="row group-actions">
      <button class="link" onclick={() => setAll(list.map((b) => b.id), true)}>{t('boxes.all')}</button>
      <button class="link" onclick={() => setAll(list.map((b) => b.id), false)}>{t('boxes.none')}</button>
    </div>
    <div class="tiles">
      {#each list as b (b.id)}{@render tile(b)}{/each}
    </div>
  </details>
{/snippet}

<section class="card stack" aria-labelledby="boxes-h" id="boxes">
  <div class="row between">
    <div>
      <h2 id="boxes-h">{t('boxes.section')}</h2>
      <small>{t('boxes.hint')}</small>
    </div>
    <label class="row prices-toggle"><input type="checkbox" bind:checked={app.showPrices} /> {t('boxes.showPrices')}</label>
  </div>

  {#each families as family (family)}
    {@const fams = groups(family)}
    {#if family === 'euro'}
      <div class="stack">
        <h3>{t('boxes.family.euro')}</h3>
        {#each fams as [fp, list] (fp)}
          {@render footprintGroup(fp, list, countIn(list) > 0 || fp === '600×400' || fp === '400×300')}
        {/each}
      </div>
    {:else}
      <details class="box">
        <summary>
          {t(`boxes.family.${family}` as const)}
          <span class="muted count">{t('boxes.selected', { n: countIn(fams.flatMap(([, l]) => l)), total: fams.flatMap(([, l]) => l).length })}</span>
        </summary>
        <div class="stack">
          {#each fams as [fp, list] (fp)}{@render footprintGroup(fp, list, true)}{/each}
        </div>
      </details>
    {/if}
  {/each}

  <details class="box" open={app.project.customBoxes.length > 0 || undefined}>
    <summary>{t('boxes.family.custom')}</summary>
    <div class="stack">
      {#if app.project.customBoxes.length}
        <div class="tiles">
          {#each app.project.customBoxes as b (b.id)}
            <div class="custom">
              {@render tile(b)}
              <button class="link" onclick={() => removeCustom(b.id)}>{t('boxes.customRemove')}</button>
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
  .between { justify-content: space-between; align-items: flex-start; }
  .prices-toggle { font-size: 0.85rem; white-space: nowrap; }
  .fp { border-top: 1px solid var(--border); padding-top: 0.5rem; }
  .fp > summary { display: flex; gap: 0.6rem; align-items: baseline; font-weight: 500; }
  .count { font-size: 0.8rem; font-weight: 400; }
  .count.some { color: var(--accent); font-weight: 600; }
  .group-actions { gap: 0.75rem; font-size: 0.8rem; margin: 0.3rem 0 0.4rem; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.2rem, 1fr)); gap: 0.4rem; }
  .tile { display: grid; gap: 0.25rem; align-content: start; }
  .pick {
    display: grid; justify-items: center; gap: 0.05rem; padding: 0.35rem 0.25rem 0.4rem;
    border-radius: 8px; background: var(--surface); opacity: 0.55; filter: grayscale(0.7);
  }
  .tile.on .pick { opacity: 1; filter: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); background: var(--accent-soft); }
  .pick:hover { opacity: 1; }
  svg { width: 2.6rem; height: 2rem; }
  .h { font-size: 0.8rem; font-weight: 600; }
  .cap { font-size: 0.72rem; }
  .tile :global(input[type='number']) { width: 100%; }
  .tile :global(.control) { gap: 0.2rem; }
  .custom { display: grid; gap: 0.2rem; justify-items: center; }
  .field { display: flex; flex-direction: column; gap: 0.2rem; }
  .label { font-size: 0.85rem; font-weight: 500; }
  details.box > summary .count { margin-left: 0.4rem; }
</style>
