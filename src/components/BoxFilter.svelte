<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { footprintKey } from '../lib/model/catalog';
  import type { BoxType } from '../lib/model/types';
  import { boxName } from '../lib/display';

  interface Props {
    /** Allowed box ids; null = every selected box. */
    value: string[] | null;
    /** The boxes selected in the catalogue. */
    boxes: BoxType[];
    label: string;
    hint: string;
  }
  let { value = $bindable(), boxes, label, hint }: Props = $props();

  const footprints = $derived.by(() => {
    const map = new Map<string, string[]>();
    for (const b of boxes) {
      const k = footprintKey(b);
      map.set(k, [...(map.get(k) ?? []), b.id]);
    }
    return [...map];
  });
  const fpLabel = (k: string) => k.split('×').map((mm) => Number(mm) / 10).join('×');
  const chosen = $derived(value ? value.filter((id) => boxes.some((b) => b.id === id)).length : 0);

  function toggle(id: string, on: boolean) {
    const current = value ?? boxes.map((b) => b.id);
    value = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
  }
</script>

<details class="picker">
  <summary>
    {label}:
    <span class:chosen={value}>{value ? t('levels.boxesSome', { n: chosen }) : t('levels.boxesAll')}</span>
  </summary>
  <small>{hint}</small>
  <div class="row quick">
    {#each footprints as [fp, ids] (fp)}
      <button class="chip" onclick={() => (value = [...ids])}>{t('levels.onlyFp', { fp: fpLabel(fp) })}</button>
    {/each}
    <button class="chip" onclick={() => (value = [])}>{t('boxes.none')}</button>
  </div>
  <div class="picker-list">
    {#each boxes as b (b.id)}
      <label class="row">
        <input type="checkbox" checked={!value || value.includes(b.id)} onchange={(e) => toggle(b.id, e.currentTarget.checked)} />
        {boxName(b)}
      </label>
    {/each}
  </div>
  {#if value}<button class="link" onclick={() => (value = null)}>{t('levels.boxesReset')}</button>{/if}
</details>

<style>
  .picker summary { font-weight: 500; font-size: 0.85rem; }
  .chosen { color: var(--accent); font-weight: 600; }
  .picker-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.2rem 0.75rem; margin: 0.4rem 0; font-size: 0.85rem; }
  .quick { gap: 0.3rem; margin-top: 0.4rem; }
  .chip { font-size: 0.78rem; padding: 0.15rem 0.55rem; border-radius: 999px; }
</style>
