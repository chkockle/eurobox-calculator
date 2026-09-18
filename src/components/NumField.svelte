<script lang="ts">
  import { i18n } from '../lib/i18n/index.svelte';
  import { parseDecimal } from '../lib/format';

  interface Props {
    label: string;
    value: number | null;
    unit?: string;
    hint?: string;
    min?: number;
    max?: number;
    step?: number | 'any';
    nullable?: boolean;
    placeholder?: string;
    compact?: boolean;
    /**
     * Show the value with exactly this many decimals in the user's locale (e.g. prices: 2).
     * Uses a text field, so the browser can't reformat it; comma and dot are both accepted.
     */
    decimals?: number;
  }

  let {
    label,
    value = $bindable(),
    unit = '',
    hint = '',
    min = 0,
    max,
    step = 1,
    nullable = false,
    placeholder = '',
    compact = false,
    decimals,
  }: Props = $props();

  let editing = $state(false);
  let draft = $state('');

  const formatted = $derived(
    value == null || decimals == null
      ? ''
      : new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false }).format(value),
  );

  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    const raw = e.currentTarget.value;
    if (decimals != null) {
      // Keep showing exactly what is typed until the field is left.
      editing = true;
      draft = raw;
    }
    const n = parseDecimal(raw);
    if (n === null) {
      if (nullable) value = null;
      return;
    }
    if (!Number.isNaN(n)) value = n;
  }

  function onFocus() {
    if (decimals == null) return;
    editing = true;
    draft = formatted;
  }
</script>

<label class="field" class:compact>
  <span class="label" class:sr-only={compact}>{label}</span>
  <span class="control">
    {#if decimals != null}
      <input
        type="text"
        inputmode="decimal"
        autocomplete="off"
        value={editing ? draft : formatted}
        {placeholder}
        aria-label={compact ? label : undefined}
        oninput={onInput}
        onfocus={onFocus}
        onblur={() => (editing = false)}
      />
    {:else}
      <input
        type="number"
        inputmode="decimal"
        value={value ?? ''}
        {min}
        {max}
        {step}
        {placeholder}
        aria-label={compact ? label : undefined}
        oninput={onInput}
      />
    {/if}
    {#if unit}<span class="unit">{unit}</span>{/if}
  </span>
  {#if hint}<small>{hint}</small>{/if}
</label>

<style>
  .field { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
  .label { font-size: 0.85rem; font-weight: 500; }
  .control { display: flex; align-items: center; gap: 0.35rem; }
  .unit { color: var(--muted); font-size: 0.85rem; }
  small { font-size: 0.78rem; line-height: 1.3; }
  .compact input { width: 5rem; }
  input[type='text'][inputmode='decimal'] { text-align: right; font-variant-numeric: tabular-nums; width: 6.5rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
