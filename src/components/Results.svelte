<script lang="ts">
  import { fmt, money, t } from '../lib/i18n/index.svelte';
  import { app } from '../lib/state/app.svelte';
  import { allBoxes, DATASET_BOXES, footprintKey } from '../lib/model/catalog';
  import type { BoxType, Project, Shelf, ShelfSelection } from '../lib/model/types';
  import { basePlan as findBase, effectivePlan, solveShelf, suggestions, TIGHT_MM, type Plan } from '../lib/solver/plans';
  import type { LevelCandidate } from '../lib/solver/level';
  import { placeBoxes, shelfOffsets } from '../lib/solver/geometry';
  import { boxColor, boxName, candidateSummary } from '../lib/display';
  import type { SceneShelf } from './ShelfScene.svelte';
  import ShoppingList, { type ShoppingTotals } from './ShoppingList.svelte';
  // three.js is most of the bundle — load the 3D view separately so the form appears first.
  const scene3d = import('./Scene3D.svelte');

  const catalog = $derived(allBoxes(app.project));
  const byId = $derived(new Map(catalog.map((b) => [b.id, b])));
  const settings = $derived($state.snapshot(app.project.settings) as Project['settings']);
  const prices = $derived($state.snapshot(app.project.prices) as Record<string, number>);

  // Solve every shelf (≈10 ms each). Manual choices are applied on top, so they don't re-solve.
  const solved = $derived.by(() => {
    const enabled = new Set(app.project.enabledBoxIds);
    const boxes = $state.snapshot(catalog.filter((b) => enabled.has(b.id)));
    return app.project.shelves.map((s) => {
      const shelf = $state.snapshot(s) as Shelf;
      return { shelf, solution: solveShelf(shelf, boxes, { prices, settings }) };
    });
  });

  const computed = $derived(
    solved.map(({ shelf, solution }) => {
      const selection = $state.snapshot(app.project.selection[shelf.id]) as ShelfSelection | undefined;
      const base = findBase(solution, selection?.plan ?? null);
      const plan = effectivePlan(shelf, solution, selection, prices, settings);
      return { shelf, solution, selection, base, plan, sugg: suggestions(solution) };
    }),
  );

  const current = $derived(computed[app.activeShelf]);
  const shelf = $derived(current?.shelf);
  const solution = $derived(current?.solution);
  const selection = $derived(current?.selection);
  const base = $derived(current?.base ?? null);
  const plan = $derived(current?.plan ?? null);
  const sugg = $derived(current?.sugg);
  const overrideCount = $derived(selection ? Object.keys(selection.overrides).length : 0);
  const multi = $derived(computed.length > 1);
  const scope = $derived(multi ? app.scope : 'shelf');

  // Which card is active: single-size plans all belong to the "one box size" card.
  const activeCard = $derived(
    !base ? null : base.key.startsWith('box:') ? 'single' : base.key === 'value' ? 'value' : base.key,
  );
  const singlePick = $derived(base?.key.startsWith('box:') ? base : sugg?.singleSize[0] ?? null);

  // One-line comparison between the shown plan and the other main suggestions.
  const comparison = $derived.by(() => {
    if (!plan || !sugg) return '';
    const mv = sugg.maxVolume;
    const mc = sugg.maxCount;
    if (mv && mc && mv.count >= mc.count && plan.volume >= mv.volume - 0.05) return t('sugg.cmpBest');
    if (mv && mv.volume > plan.volume + 0.5) return t('sugg.cmpMoreVolume', { l: fmt(mv.volume - plan.volume), n: mv.count });
    if (mc && mc.count > plan.count) return t('sugg.cmpMoreBoxes', { n: mc.count, l: fmt(plan.volume - mc.volume) });
    return '';
  });

  // Euro footprints the user has not picked at all — offered as one-click additions.
  const untried = $derived.by(() => {
    const enabled = new Set(app.project.enabledBoxIds);
    const map = new Map<string, BoxType[]>();
    for (const b of DATASET_BOXES.filter((x) => x.family === 'euro')) map.set(footprintKey(b), [...(map.get(footprintKey(b)) ?? []), b]);
    return [...map].filter(([, list]) => list.every((b) => !enabled.has(b.id)));
  });
  const fpLabel = (k: string) => k.split('×').map((mm) => Number(mm) / 10).join('×');
  const sizeLabel = (key: string) => boxName(byId.get(key.slice(4)));

  function addFootprint(list: BoxType[]) {
    const set = new Set(app.project.enabledBoxIds);
    for (const b of list) set.add(b.id);
    app.project.enabledBoxIds = [...set];
  }

  function showPrices() {
    app.showPrices = true;
    document.getElementById('boxes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function totalsOf(plans: (Plan | null)[]): ShoppingTotals {
    const counts = new Map<string, number>();
    let volume = 0;
    let loadKg: number | null = settings.kgPerLitre != null ? 0 : null;
    for (const p of plans) {
      if (!p) continue;
      volume += p.volume;
      if (loadKg != null && p.totalLoadKg != null) loadKg += p.totalLoadKg;
      for (const b of p.boxes) counts.set(b.boxId, (counts.get(b.boxId) ?? 0) + b.count);
    }
    const boxes = [...counts]
      .map(([boxId, count]) => ({ boxId, count, price: prices[boxId] ?? null }))
      .sort((a, b) => b.count - a.count || a.boxId.localeCompare(b.boxId));
    const priced = boxes.filter((b) => b.price != null);
    return {
      boxes,
      count: boxes.reduce((s, b) => s + b.count, 0),
      volume,
      cost: priced.length ? priced.reduce((s, b) => s + b.count * b.price!, 0) : null,
      costComplete: boxes.length > 0 && priced.length === boxes.length,
      loadKg,
    };
  }

  const shelfName = (s: Shelf, i: number) => s.name || t('shelf.defaultName', { n: i + 1 });

  const allTotals = $derived(totalsOf(computed.map((c) => c.plan)));
  const totals = $derived(scope === 'all' ? allTotals : totalsOf([plan]));
  const perShelf = $derived(
    scope === 'all' ? computed.map((c, i) => ({ ...totalsOf([c.plan]), name: shelfName(c.shelf, i) })) : [],
  );
  const loadWarnings = $derived(
    computed
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => (scope === 'all' || i === app.activeShelf) && c.plan?.overloadTotal && c.shelf.maxTotalLoadKg != null)
      .map(({ c, i }) => `${shelfName(c.shelf, i)}: ${t('shop.overloadTotal', { max: fmt(c.shelf.maxTotalLoadKg!) })}`),
  );

  // Letter codes are shared by all shelves, so a box type has the same letter everywhere.
  const codes = $derived(new Map(allTotals.boxes.map((b, i) => [b.boxId, String.fromCharCode(65 + (i % 26))])));

  const sceneItems = $derived.by((): SceneShelf[] => {
    const list = scope === 'all' ? computed : current ? [current] : [];
    const x0 = shelfOffsets(list.map((c) => c.shelf), settings.shelfGap);
    return list.map((c, i) => ({ id: c.shelf.id, shelf: c.shelf, placed: c.plan ? placeBoxes(c.shelf, c.plan, settings) : [], x0: x0[i] }));
  });

  let hoveredLevel = $state<number | null>(null);
  const highlight = $derived(shelf && hoveredLevel != null ? { shelfId: shelf.id, level: hoveredLevel } : null);

  function selectPlan(key: string) {
    if (!shelf) return;
    app.project.selection[shelf.id] = { plan: key, overrides: {} };
  }

  function setLevel(levelId: string, index: number, sig: string) {
    if (!shelf || !base) return;
    const sel = app.project.selection[shelf.id] ?? { plan: base.key, overrides: {} };
    const baseSig = base.levels[index]?.candidate?.sig ?? '';
    if (sig === baseSig) delete sel.overrides[levelId];
    else sel.overrides[levelId] = sig;
    app.project.selection[shelf.id] = sel;
  }

  function resetLevel(levelId: string) {
    if (shelf && app.project.selection[shelf.id]) delete app.project.selection[shelf.id].overrides[levelId];
  }

  function resetAll() {
    if (shelf && app.project.selection[shelf.id]) app.project.selection[shelf.id].overrides = {};
  }

  function costLine(p: Plan): string {
    if (p.cost == null) return '';
    const c = money(p.cost, settings.currency);
    return p.costComplete ? c : t('plan.costPartial', { c });
  }

  function isTight(c: LevelCandidate | null): boolean {
    return !!c && (c.spareWidth < TIGHT_MM || c.spareHeight < TIGHT_MM);
  }
  function planWarnings(p: Plan): string[] {
    const w: string[] = [];
    if (p.levels.some((l) => isTight(l.candidate))) w.push(t('badge.tight'));
    if (p.overhang) w.push(t('badge.overhang'));
    if (p.overloadTotal || p.levels.some((l) => l.overload)) w.push(t('badge.overload'));
    return w;
  }

  type Tone = '' | 'warn' | 'danger';
  /** Plain-language facts for one level, each with a tone for highlighting. */
  function levelFacts(c: LevelCandidate, i: number): [string, Tone][] {
    const level = shelf!.levels[i];
    const lp = plan!.levels[i];
    const out: [string, Tone][] = [];
    out.push([t('level.spareWidth', { mm: fmt(c.spareWidth) }), c.spareWidth < TIGHT_MM ? 'warn' : '']);
    if (Number.isFinite(c.spareHeight)) {
      out.push([t('level.spareHeight', { mm: fmt(c.spareHeight + (level.openTop ? 0 : settings.topClearance)) }), c.spareHeight < TIGHT_MM ? 'warn' : '']);
    }
    if (c.overhang > 0) out.push([t('level.overhang', { mm: fmt(c.overhang) }), 'warn']);
    if (c.columns.some((col) => col.rows > 1 || col.stack > 1)) out.push([t('badge.hidden'), '']);
    if (c.columns.some((col) => col.stackLimited)) out.push([t('level.stackLimited', { n: level.maxStack ?? 1 }), 'warn']);
    if (lp?.loadKg != null) {
      out.push([
        level.maxLoadKg != null ? t('level.loadOf', { kg: fmt(lp.loadKg), max: fmt(level.maxLoadKg) }) : t('level.load', { kg: fmt(lp.loadKg) }),
        lp.overload ? 'danger' : '',
      ]);
    }
    return out;
  }

  const levelOrder = $derived(shelf ? shelf.levels.map((_, i) => i).reverse() : []);
</script>

{#snippet topView(c: LevelCandidate)}
  {@const W = shelf!.clearWidth}
  {@const D = shelf!.clearDepth}
  {@const over = c.overhang}
  {@const n = c.columns.length}
  {@const used = c.columns.reduce((s, col) => s + col.w, 0) + Math.max(0, n - 1) * settings.gap}
  {@const spread = Math.max(0, (W - used) / (n + 1))}
  <svg class="top-view" viewBox={`-10 -10 ${W + 20} ${D + over + 20}`} role="img" aria-label={candidateSummary(c, byId)}>
    <rect x="0" y="0" width={W} height={D} class="board" />
    {#each c.columns as col, ci (ci)}
      {@const x = spread + c.columns.slice(0, ci).reduce((s, cc) => s + cc.w + settings.gap + spread, 0) + settings.tolerance / 2}
      {@const depthUsed = col.rows * col.d + (col.rows - 1) * col.rowGap}
      {@const shift = Math.max(0, depthUsed - D)}
      {#each { length: col.rows } as _, r (r)}
        {@const front = D + shift - r * (col.d + col.rowGap)}
        <rect x={x} y={front - col.d} width={col.nomW} height={col.nomD} rx="8" fill={boxColor(byId.get(col.boxId))} class="crate" />
        {#if r === 0}
          <text x={x + col.nomW / 2} y={front - col.d / 2} class="code">{codes.get(col.boxId) ?? ''}{col.stack > 1 ? ` ×${col.stack}` : ''}</text>
        {/if}
      {/each}
    {/each}
    <line x1="0" x2={W} y1={D} y2={D} class="edge" />
  </svg>
{/snippet}

{#snippet card(key: string, title: string, p: Plan | null)}
  {#if p}
    {@const warnings = planWarnings(p)}
    <button class="plan" class:active={activeCard === key} aria-pressed={activeCard === key} onclick={() => selectPlan(p.key)}>
      <span class="plan-title">{title}</span>
      <span class="plan-main num">{fmt(p.volume)} L</span>
      <span class="plan-meta muted">{t('plan.boxes', { n: p.count })} · {p.types === 1 ? t('plan.type') : t('plan.types', { n: p.types })}</span>
      {#if p.cost != null}
        <span class="plan-meta num">{costLine(p)}{#if p.costPerLitre != null}<span class="sep" aria-hidden="true">·</span>{t('plan.perLitre', { c: money(p.costPerLitre, settings.currency) })}{/if}</span>
      {/if}
      {#if warnings.length}<span class="plan-warn">{warnings.join(' · ')}</span>{/if}
    </button>
  {/if}
{/snippet}

{#if !shelf}
  <section class="card"><p>{t('results.noShelf')}</p></section>
{:else}
  <section class="card stack no-print" aria-labelledby="sugg-h">
    <h2 id="sugg-h">
      {t('results.options')}
      {#if multi}<span class="muted plan-name">— {shelfName(shelf, app.activeShelf)}</span>{/if}
    </h2>

    {#if !sugg?.maxVolume}
      <p class="badge warn">{t('results.none')}</p>
    {:else}
      <div class="plans">
        {@render card('maxVolume', t('plan.maxVolume'), sugg.maxVolume)}
        {@render card('maxCount', t('plan.maxCount'), sugg.maxCount)}
        {#if singlePick}
          <div class="plan-wrap">
            {@render card('single', t('sugg.single'), singlePick)}
            {#if sugg.singleSize.length > 1}
              <label>
                <span class="sr-only">{t('sugg.singleChoose')}</span>
                <select class="single-choose" value={singlePick.key} onchange={(e) => selectPlan(e.currentTarget.value)}>
                  {#each sugg.singleSize as p (p.key)}
                    <option value={p.key}>{sizeLabel(p.key)} — {fmt(p.volume)} L · {p.count}×</option>
                  {/each}
                </select>
              </label>
            {:else}
              <small class="muted single-name">{sizeLabel(singlePick.key)}</small>
            {/if}
          </div>
        {/if}
        {@render card('value', t('plan.value'), sugg.value)}
      </div>

      <p class="summary">
        {#if plan}<strong>{t('sugg.summary', { v: fmt(plan.volume), n: plan.count })}.</strong>{/if}
        {comparison}
        {#if overrideCount}
          <span class="custom">{t('sugg.custom', { n: overrideCount })} <button class="link" onclick={resetAll}>{t('sugg.reset')}</button></span>
        {/if}
      </p>

      {#if untried.length || !sugg.value}
        <div class="row try">
          {#if untried.length}
            <span class="muted">{t('sugg.tryMore')}</span>
            {#each untried as [fp, list] (fp)}
              <button class="chip" onclick={() => addFootprint(list)}>{t('sugg.addFp', { fp: fpLabel(fp), n: list.length })}</button>
            {/each}
          {/if}
          {#if !sugg.value}<button class="link" onclick={showPrices}>{t('sugg.addPrices')}</button>{/if}
        </div>
      {/if}
    {/if}
  </section>

  {#if plan}
    <section class="card stack" aria-labelledby="view-h">
      <div class="row between">
        <h2 id="view-h">{t('view.title')}: {scope === 'all' ? t('scope.all', { n: computed.length }) : shelf.name}</h2>
        <span class="num"><strong>{fmt(totals.volume)} L</strong> · {t('plan.boxes', { n: totals.count })}</span>
      </div>

      {#if multi}
        <div class="row no-print">
          <div class="seg" role="group" aria-label={t('view.title')}>
            <button class:on={scope === 'shelf'} aria-pressed={scope === 'shelf'} onclick={() => (app.scope = 'shelf')}>{t('scope.shelf')}</button>
            <button class:on={scope === 'all'} aria-pressed={scope === 'all'} onclick={() => (app.scope = 'all')}>{t('scope.all', { n: computed.length })}</button>
          </div>
          {#if scope === 'all'}
            <label class="row gap-field">
              <span>{t('view.shelfGap')}</span>
              <input type="number" min="0" step="10" bind:value={app.project.settings.shelfGap} />
              <span class="muted">mm</span>
            </label>
          {/if}
        </div>
      {/if}

      {#await scene3d}
        <div class="scene-loading"></div>
      {:then { default: Scene3D }}
        <Scene3D items={sceneItems} {byId} {codes} {highlight} />
      {/await}

      <div class="legend row">
        {#each totals.boxes as b (b.boxId)}
          <span class="row legend-item">
            <span class="swatch" style:background={boxColor(byId.get(b.boxId))}></span>
            <strong>{codes.get(b.boxId)}</strong>
            {boxName(byId.get(b.boxId))}
          </span>
        {/each}
      </div>
    </section>

    <section class="card stack" aria-labelledby="levels-h">
      <h2 id="levels-h">{t('levels.title')}{#if multi} <span class="muted plan-name">— {shelfName(shelf, app.activeShelf)}</span>{/if}</h2>
      <ol class="level-list">
        {#each levelOrder as i (shelf.levels[i].id)}
          {@const level = shelf.levels[i]}
          {@const result = solution?.levels[i] ?? null}
          {@const c = plan.levels[i]?.candidate ?? null}
          {@const bestVolume = result?.candidates[0]?.volume ?? 0}
          {@const facts = c ? levelFacts(c, i) : []}
          {@const hasWarn = facts.some(([, tone]) => tone)}
          <li
            onmouseenter={() => (hoveredLevel = i)}
            onmouseleave={() => (hoveredLevel = null)}
            onfocusin={() => (hoveredLevel = i)}
            onfocusout={() => (hoveredLevel = null)}
          >
            <details class="level">
              <summary>
                <span class="level-title">
                  <strong>{level.openTop ? t('level.topTitle') : t('level.title', { n: i + 1 })}</strong>
                  <span class="muted">· {level.clearHeight == null ? t('level.clearNoLimit') : t('level.clear', { h: fmt(level.clearHeight) })}</span>
                  {#if hasWarn}<span class="dot" title={facts.filter(([, tone]) => tone).map(([x]) => x).join(', ')}></span>{/if}
                  {#if selection?.overrides[level.id] !== undefined}<span class="badge">{t('plan.custom')}</span>{/if}
                </span>
                <span class="num">{c ? `${fmt(c.volume * shelf.bays)} L` : ''}</span>
                <span class="level-line">
                  {#if !level.enabled}
                    {t('level.disabled')}
                  {:else if !result?.candidates.length}
                    {t('level.nothingFits')}
                  {:else if c}
                    {candidateSummary(c, byId)}
                  {:else}
                    {t('level.empty')}
                  {/if}
                </span>
              </summary>

              {#if level.enabled && result?.candidates.length}
                <div class="level-body">
                  <div class="stack tight">
                    {#if c}
                      <p class="facts">
                        {#each facts as [text, tone], fi (fi)}{#if fi > 0}<span class="sep" aria-hidden="true">·</span>{/if}<span class={tone}>{text}</span>{/each}
                      </p>
                      {#if isTight(c)}<small class="warn-text">{t('badge.tightHint', { mm: TIGHT_MM })}</small>{/if}
                    {/if}
                    <label class="field no-print">
                      <span class="label">{t('level.choose')}</span>
                      <select value={c?.sig ?? ''} onchange={(e) => setLevel(level.id, i, e.currentTarget.value)}>
                        {#each result.candidates as cand (cand.sig)}
                          <option value={cand.sig}>{candidateSummary(cand, byId)} — {fmt(cand.volume)} L</option>
                        {/each}
                        <option value="">{t('level.empty')}</option>
                      </select>
                    </label>
                    {#if selection?.overrides[level.id] !== undefined}
                      <button class="link no-print" onclick={() => resetLevel(level.id)}>{t('level.reset')}</button>
                    {/if}
                    {#if result.nominalBest && result.nominalBest.volume > bestVolume + 0.5}
                      <small class="hint">
                        {t('level.nearMiss', { what: candidateSummary(result.nominalBest, byId), l: fmt(result.nominalBest.volume - bestVolume, 1) })}
                      </small>
                    {/if}
                  </div>
                  {#if c}{@render topView(c)}{/if}
                </div>
              {/if}
            </details>
          </li>
        {/each}
      </ol>
    </section>

    <section class="card stack" aria-labelledby="shop-h">
      <ShoppingList {totals} {byId} {codes} {settings} {perShelf} warnings={loadWarnings} />
    </section>
  {/if}
{/if}

<style>
  .between { justify-content: space-between; }
  .seg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; }
  .seg button { border: none; border-radius: 0; padding: 0.35rem 0.7rem; background: var(--surface); font-size: 0.88rem; }
  .seg button.on { background: var(--accent); color: var(--accent-text); }
  .plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr)); gap: 0.6rem; align-items: stretch; }
  .plan-wrap { display: grid; gap: 0.3rem; grid-template-rows: 1fr auto; }
  .plan {
    display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem; text-align: left;
    padding: 0.65rem 0.75rem; border-radius: 9px; background: var(--surface); height: 100%;
  }
  .plan.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); background: var(--accent-soft); }
  .plan-title { font-weight: 600; font-size: 0.88rem; }
  .plan-main { font-size: 1.3rem; font-weight: 700; }
  .plan-meta { font-size: 0.82rem; }
  .plan-warn { font-size: 0.78rem; color: var(--warn); font-weight: 600; }
  .single-choose { width: 100%; font-size: 0.82rem; }
  .single-name { padding-left: 0.25rem; }
  .plan-name { font-weight: 400; font-size: 0.9rem; }
  .summary { font-size: 0.9rem; display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: baseline; }
  .summary .custom { color: var(--warn); }
  .try { gap: 0.4rem; font-size: 0.85rem; }
  .chip { font-size: 0.8rem; padding: 0.15rem 0.6rem; border-radius: 999px; }
  .legend { gap: 0.4rem 1rem; font-size: 0.85rem; }
  .legend-item { gap: 0.35rem; }
  .gap-field { font-size: 0.85rem; gap: 0.35rem; }
  .gap-field input { width: 5rem; }
  .level-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
  .level { border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.75rem; }
  .level:hover, .level[open] { border-color: var(--accent); }
  .level > summary { display: grid; grid-template-columns: 1fr auto; gap: 0.1rem 0.75rem; cursor: pointer; list-style: none; }
  .level > summary::-webkit-details-marker { display: none; }
  .level-title { display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; }
  .level-title::before { content: '▸'; color: var(--muted); font-size: 0.8rem; transition: transform 0.15s; }
  .level[open] .level-title::before { transform: rotate(90deg); }
  .level-line { grid-column: 1 / -1; font-size: 0.85rem; color: var(--muted); padding-left: 1rem; }
  .dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--warn); display: inline-block; }
  .level-body { display: grid; grid-template-columns: 1fr minmax(8rem, 13rem); gap: 0.8rem; align-items: start; margin-top: 0.6rem; }
  @media (max-width: 560px) { .level-body { grid-template-columns: 1fr; } }
  .facts { font-size: 0.85rem; }
  .facts .warn { color: var(--warn); font-weight: 600; }
  .facts .danger { color: var(--danger); font-weight: 600; }
  .sep { color: var(--muted); padding: 0 0.4rem; }
  .stack.tight { gap: 0.45rem; }
  .field { display: flex; flex-direction: column; gap: 0.2rem; }
  .label { font-size: 0.85rem; font-weight: 500; }
  select { width: 100%; }
  .hint { color: var(--muted); border-left: 3px solid var(--warn); padding-left: 0.5rem; }
  .warn-text { color: var(--warn); }
  .top-view { width: 100%; height: auto; }
  .top-view .board { fill: var(--surface-2); stroke: var(--border); stroke-width: 4; }
  .top-view .crate { stroke: rgb(0 0 0 / 0.45); stroke-width: 4; }
  .top-view .edge { stroke: var(--muted); stroke-width: 6; stroke-dasharray: 20 12; }
  .top-view .code { font: 700 70px system-ui, sans-serif; text-anchor: middle; dominant-baseline: middle; fill: #111; }
  .scene-loading { height: min(62vh, 560px); min-height: 320px; background: var(--scene-bg); border-radius: 8px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
