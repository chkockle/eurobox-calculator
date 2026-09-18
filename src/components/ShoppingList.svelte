<script lang="ts" module>
  import type { BoxCount } from '../lib/solver/plans';

  /** Totals for one shelf or for all shelves together. */
  export interface ShoppingTotals {
    boxes: BoxCount[];
    count: number;
    volume: number;
    cost: number | null;
    costComplete: boolean;
    loadKg: number | null;
  }

  export interface ShelfTotalsRow extends ShoppingTotals {
    name: string;
  }
</script>

<script lang="ts">
  import { fmt, money, t } from '../lib/i18n/index.svelte';
  import type { BoxType, Settings } from '../lib/model/types';
  import { boxColor, boxName } from '../lib/display';

  interface Props {
    totals: ShoppingTotals;
    byId: Map<string, BoxType>;
    codes: Map<string, string>;
    settings: Settings;
    /** Shown in the "all shelves" scope. */
    perShelf?: ShelfTotalsRow[];
    /** Messages about exceeded shelf load limits. */
    warnings?: string[];
  }
  let { totals, byId, codes, settings, perShelf = [], warnings = [] }: Props = $props();

  function costText(x: ShoppingTotals): string {
    if (x.cost == null) return '–';
    const c = money(x.cost, settings.currency);
    return x.costComplete ? c : t('plan.costPartial', { c });
  }

  const lidCount = $derived(
    settings.lids ? totals.boxes.reduce((s, b) => s + (byId.get(b.boxId)?.lidded ? 0 : b.count), 0) : 0,
  );

  let copied = $state(false);
  async function copyList() {
    const lines = totals.boxes.map((b) => {
      const price = b.price != null ? ` × ${money(b.price, settings.currency)} = ${money(b.price * b.count, settings.currency)}` : '';
      return `${codes.get(b.boxId)}  ${b.count} × ${boxName(byId.get(b.boxId))}${price}`;
    });
    if (lidCount) lines.push(t('shop.lids', { n: lidCount }));
    lines.push(`${t('shop.volume')}: ${fmt(totals.volume)} L`);
    if (totals.cost != null) lines.push(`${t('shop.total')}: ${costText(totals)}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // clipboard blocked — nothing else to do
    }
  }
</script>

<div class="row between">
  <h2 id="shop-h">{t('shop.title')}</h2>
  <button class="no-print" onclick={copyList}>{copied ? t('shop.copied') : t('shop.copy')}</button>
</div>
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th></th>
        <th>{t('shop.box')}</th>
        <th class="r">{t('shop.count')}</th>
        <th class="r">{t('shop.unit')}</th>
        <th class="r">{t('shop.sum')}</th>
      </tr>
    </thead>
    <tbody>
      {#each totals.boxes as b (b.boxId)}
        <tr>
          <td><span class="swatch" style:background={boxColor(byId.get(b.boxId))}></span> <strong>{codes.get(b.boxId)}</strong></td>
          <td>{boxName(byId.get(b.boxId))}</td>
          <td class="r num">{b.count}</td>
          <td class="r num">{b.price != null ? money(b.price, settings.currency) : '–'}</td>
          <td class="r num">{b.price != null ? money(b.price * b.count, settings.currency) : '–'}</td>
        </tr>
      {/each}
    </tbody>
    <tfoot>
      <tr>
        <td></td>
        <td>{t('shop.total')}{#if lidCount} <small class="muted">({t('shop.lids', { n: lidCount })})</small>{/if}</td>
        <td class="r num">{totals.count}</td>
        <td></td>
        <td class="r num">{costText(totals)}</td>
      </tr>
    </tfoot>
  </table>
</div>

<p class="row">
  <span>{t('shop.volume')}: <strong class="num">{fmt(totals.volume)} L</strong></span>
  {#if totals.loadKg != null}
    <span>· {t('shop.load')}: <strong class="num">≈ {fmt(totals.loadKg)} kg</strong></span>
  {/if}
</p>

{#if perShelf.length > 1}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>{t('shop.shelf')}</th>
          <th class="r">{t('shop.count')}</th>
          <th class="r">L</th>
          <th class="r">{t('shop.sum')}</th>
        </tr>
      </thead>
      <tbody>
        {#each perShelf as row, i (i)}
          <tr>
            <td>{row.name}</td>
            <td class="r num">{row.count}</td>
            <td class="r num">{fmt(row.volume)}</td>
            <td class="r num">{costText(row)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

{#each warnings as w, i (i)}<p class="badge danger">{w}</p>{/each}
<small>{t('note.sizes')}</small>

<style>
  .between { justify-content: space-between; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
  th { font-weight: 600; font-size: 0.8rem; color: var(--muted); }
  tfoot td { font-weight: 600; border-bottom: none; }
  .r { text-align: right; }
</style>
