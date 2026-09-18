<script lang="ts">
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
  }: Props = $props();

  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    const raw = e.currentTarget.value.replace(',', '.');
    if (raw === '') {
      if (nullable) value = null;
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) value = n;
  }
</script>

<label class="field" class:compact>
  <span class="label" class:sr-only={compact}>{label}</span>
  <span class="control">
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
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
