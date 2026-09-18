<script lang="ts">
  import { fmt, money, t } from '../lib/i18n/index.svelte';
  import { app } from '../lib/state/app.svelte';
  import { allBoxes } from '../lib/model/catalog';
  import type { Objective, Project, Shelf, ShelfSelection } from '../lib/model/types';
  import { effectivePlan, rankPlans, solveShelf, TIGHT_MM, type Plan } from '../lib/solver/plans';
  import type { LevelCandidate } from '../lib/solver/level';
  import { placeBoxes, shelfOuterWidth } from '../lib/solver/geometry';
  import { boxColor, boxName, candidateSummary, planLabel } from '../lib/display';
  import type { SceneShelf } from './ShelfScene.svelte';
  import ShoppingList, { type ShoppingTotals } from './ShoppingList.svelte';
  // three.js is most of the bundle — load the 3D view separately so the form appears first.
  const scene3d = import('./Scene3D.svelte');

  const objectives: Objective[] = ['volume', 'count', 'fewestTypes', 'value'];

  const catalog = $derived(allBoxes(app.project));
  const byId = $derived(new Map(catalog.map((b) => [b.id, b])));
  const settings = $derived($state.snapshot(app.project.settings) as Project['settings']);
  const prices = $derived($state.snapshot(app.project.prices) as Record<string, number>);

  // Solve every shelf (≈10 ms each). Ranking and manual level choices are applied on top,
  // so switching the objective or a level choice does not re-solve.
  const solved = $derived.by(() => {
    const enabled = new Set(app.project.enabledBoxIds);
    const boxes = $state.snapshot(catalog.filter((b) => enabled.has(b.id)));
    const solveSettings = { ...settings, shelfGap: 0 }; // the gap only affects the view
    return app.project.shelves.map((s) => {
      const shelf = $state.snapshot(s) as Shelf;
      return { shelf, solution: solveShelf(shelf, boxes, { prices, settings: solveSettings }) };
    });
  });

  const computed = $derived(
    solved.map(({ shelf, solution }) => {
      const ranked = rankPlans(solution.plans, app.project.objective);
      const selection = $state.snapshot(app.project.selection[shelf.id]) as ShelfSelection | undefined;
      const basePlan = ranked.find((p) => p.key === selection?.plan) ?? ranked[0];
      const plan = effectivePlan(shelf, solution, ranked, selection, prices, settings);
      return { shelf, solution, ranked, selection, basePlan, plan };
    }),
  );

  const current = $derived(computed[app.activeShelf]);
  const shelf = $derived(current?.shelf);
  const solution = $derived(current?.solution);
  const ranked = $derived(current?.ranked ?? []);
  const selection = $derived(current?.selection);
  const basePlan = $derived(current?.basePlan);
  const plan = $derived(current?.plan ?? null);
  const customised = $derived(!!selection && Object.keys(selection.overrides).length > 0);
  const multi = $derived(computed.length > 1);

  let scopeChoice = $state<'shelf' | 'all'>('shelf');
  const scope = $derived(multi ? scopeChoice : 'shelf');

  const shown = $derived.by(() => {
    const top = ranked.slice(0, 6);
    if (basePlan && !top.includes(basePlan)) top.push(basePlan);
    return top;
  });

  const hasPrices = $derived(Object.keys(prices).length > 0);

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
    let x = 0;
    return list.map((c) => {
      const item = { id: c.shelf.id, shelf: c.shelf, placed: c.plan ? placeBoxes(c.shelf, c.plan, settings) : [], x0: x };
      x += shelfOuterWidth(c.shelf) + Math.max(0, settings.shelfGap);
      return item;
    });
  });

  let hoveredLevel = $state<number | null>(null);
  const highlight = $derived(shelf && hoveredLevel != null ? { shelfId: shelf.id, level: hoveredLevel } : null);

  function selectPlan(key: string) {
    if (!shelf) return;
    app.project.selection[shelf.id] = { plan: key, overrides: {} };
  }

  function setLevel(levelId: string, index: number, sig: string) {
    if (!shelf || !basePlan) return;
    const sel = app.project.selection[shelf.id] ?? { plan: basePlan.key, overrides: {} };
    const baseSig = basePlan.levels[index]?.candidate?.sig ?? '';
    if (sig === baseSig) delete sel.overrides[levelId];
    else sel.overrides[levelId] = sig;
    app.project.selection[shelf.id] = sel;
  }

  function resetLevel(levelId: string) {
    if (shelf && app.project.selection[shelf.id]) delete app.project.selection[shelf.id].overrides[levelId];
  }

  function costLine(p: Plan): string {
    if (p.cost == null) return '';
    const c = money(p.cost, settings.currency);
    return p.costComplete ? c : t('plan.costPartial', { c });
  }

  function isTight(c: LevelCandidate | null): boolean {
    return !!c && (c.spareWidth < TIGHT_MM || c.spareHeight < TIGHT_MM);
  }
  function planTight(p: Plan): boolean {
    return p.levels.some((l) => isTight(l.candidate));
  }
  function notFrontAccessible(c: LevelCandidate | null): boolean {
    return !!c && c.columns.some((col) => col.rows > 1 || col.stack > 1);
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

{#if !shelf}
  <section class="card"><p>{t('results.noShelf')}</p></section>
{:else}
  <section class="card stack no-print" aria-labelledby="obj-h">
    <div class="row between">
      <h2 id="obj-h">
        {t('results.objective')}
        {#if multi}<span class="muted plan-name">— {t('results.suggestionsFor', { name: shelfName(shelf, app.activeShelf) })}</span>{/if}
      </h2>
      <div class="seg" role="radiogroup" aria-label={t('results.objective')}>
        {#each objectives as o (o)}
          <button
            role="radio"
            aria-checked={app.project.objective === o}
            class:on={app.project.objective === o}
            disabled={o === 'value' && !hasPrices}
            title={o === 'value' && !hasPrices ? t('results.noPrices') : undefined}
            onclick={() => (app.project.objective = o)}
          >{t(`objective.${o}` as const)}</button>
        {/each}
      </div>
    </div>

    {#if !ranked.length}
      <p class="badge warn">{t('results.none')}</p>
    {:else}
      <div class="plans" role="group" aria-label={t('results.options')}>
        {#each shown as p (p.key)}
          {@const active = basePlan?.key === p.key}
          <button class="plan" class:active onclick={() => selectPlan(p.key)} aria-current={active}>
            <span class="plan-title">{planLabel(p.key, byId)}</span>
            <span class="plan-main num">{t('plan.volume', { v: fmt(p.volume) })}</span>
            <span class="plan-meta muted">
              {t('plan.boxes', { n: p.count })} · {p.types === 1 ? t('plan.type') : t('plan.types', { n: p.types })}
            </span>
            {#if p.cost != null}
              <span class="plan-meta num">
                {costLine(p)}{#if p.costPerLitre != null} · {t('plan.perLitre', { c: money(p.costPerLitre, settings.currency) })}{/if}
              </span>
            {/if}
            <span class="row badges">
              {#if planTight(p)}<span class="badge warn">{t('badge.tight')}</span>{/if}
              {#if p.overhang}<span class="badge warn">{t('badge.overhang')}</span>{/if}
              {#if p.overloadTotal || p.levels.some((l) => l.overload)}<span class="badge danger">{t('badge.overload')}</span>{/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  {#if plan}
    <section class="card stack" aria-labelledby="view-h">
      <div class="row between">
        <h2 id="view-h">
          {#if scope === 'all'}
            {t('view.title')}: {t('scope.all', { n: computed.length })}
          {:else}
            {t('view.title')}: {shelf.name}
            <span class="muted plan-name">— {planLabel(plan.key, byId)}{customised ? ` (${t('plan.custom')})` : ''}</span>
          {/if}
        </h2>
        <span class="num"><strong>{fmt(totals.volume)} L</strong> · {t('plan.boxes', { n: totals.count })}</span>
      </div>

      {#if multi}
        <div class="row no-print">
          <div class="seg" role="group" aria-label={t('view.title')}>
            <button class:on={scope === 'shelf'} aria-pressed={scope === 'shelf'} onclick={() => (scopeChoice = 'shelf')}>{t('scope.shelf')}</button>
            <button class:on={scope === 'all'} aria-pressed={scope === 'all'} onclick={() => (scopeChoice = 'all')}>{t('scope.all', { n: computed.length })}</button>
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
          {@const lp = plan.levels[i]}
          {@const result = solution?.levels[i] ?? null}
          {@const c = lp?.candidate ?? null}
          {@const bestVolume = result?.candidates[0]?.volume ?? 0}
          <li
            class="level"
            onmouseenter={() => (hoveredLevel = i)}
            onmouseleave={() => (hoveredLevel = null)}
            onfocusin={() => (hoveredLevel = i)}
            onfocusout={() => (hoveredLevel = null)}
          >
            <div class="row between">
              <h3>
                {level.openTop ? t('level.topTitle') : t('level.title', { n: i + 1 })}
                <span class="muted">· {level.clearHeight == null ? t('level.clearNoLimit') : t('level.clear', { h: fmt(level.clearHeight) })}</span>
              </h3>
              {#if c}<span class="num">{fmt(c.volume * shelf.bays)} L</span>{/if}
            </div>

            {#if !level.enabled}
              <p class="muted">{t('level.disabled')}</p>
            {:else if !result?.candidates.length}
              <p class="muted">{t('level.nothingFits')}</p>
            {:else}
              <div class="level-body">
                <div class="stack tight">
                  <label class="field no-print">
                    <span class="label">{t('level.choose')}</span>
                    <select value={c?.sig ?? ''} onchange={(e) => setLevel(level.id, i, e.currentTarget.value)}>
                      {#each result.candidates as cand (cand.sig)}
                        <option value={cand.sig}>{candidateSummary(cand, byId)} — {fmt(cand.volume)} L</option>
                      {/each}
                      <option value="">{t('level.empty')}</option>
                    </select>
                  </label>
                  {#if c}<p class="print-only">{candidateSummary(c, byId)}</p>{/if}
                  {#if selection?.overrides[level.id] !== undefined}
                    <button class="link no-print" onclick={() => resetLevel(level.id)}>{t('level.reset')}</button>
                  {/if}
                  {#if c}
                    <div class="row badges">
                      <span class="badge" class:warn={c.spareWidth < TIGHT_MM}>{t('level.spareWidth', { mm: fmt(c.spareWidth) })}</span>
                      {#if Number.isFinite(c.spareHeight)}
                        <span class="badge" class:warn={c.spareHeight < TIGHT_MM}>{t('level.spareHeight', { mm: fmt(c.spareHeight + (level.openTop ? 0 : settings.topClearance)) })}</span>
                      {/if}
                      {#if c.overhang > 0}<span class="badge warn">{t('level.overhang', { mm: fmt(c.overhang) })}</span>{/if}
                      {#if notFrontAccessible(c)}<span class="badge">{t('badge.hidden')}</span>{/if}
                      {#if c.columns.some((col) => col.stackLimited)}
                        <span class="badge warn" title={t('level.stackLimitedHint')}>{t('level.stackLimited', { n: level.maxStack })}</span>
                      {/if}
                      {#if lp.loadKg != null}
                        <span class="badge" class:danger={lp.overload}>
                          {level.maxLoadKg != null
                            ? t('level.loadOf', { kg: fmt(lp.loadKg), max: fmt(level.maxLoadKg) })
                            : t('level.load', { kg: fmt(lp.loadKg) })}
                        </span>
                      {/if}
                    </div>
                    {#if isTight(c)}<small class="warn-text">{t('badge.tightHint', { mm: TIGHT_MM })}</small>{/if}
                  {/if}
                  {#if result.nominalBest && result.nominalBest.volume > bestVolume + 0.5}
                    <small class="hint">
                      {t('level.nearMiss', {
                        what: candidateSummary(result.nominalBest, byId),
                        l: fmt(result.nominalBest.volume - bestVolume, 1),
                      })}
                    </small>
                  {/if}
                </div>
                {#if c}{@render topView(c)}{/if}
              </div>
            {/if}
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
  .plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr)); gap: 0.6rem; }
  .plan {
    display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem; text-align: left;
    padding: 0.65rem 0.75rem; border-radius: 9px; background: var(--surface);
  }
  .plan.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); background: var(--accent-soft); }
  .plan-title { font-weight: 600; font-size: 0.88rem; }
  .plan-main { font-size: 1.3rem; font-weight: 700; }
  .plan-meta { font-size: 0.82rem; }
  .plan-name { font-weight: 400; font-size: 0.9rem; }
  .badges { gap: 0.3rem; }
  .legend { gap: 0.4rem 1rem; font-size: 0.85rem; }
  .legend-item { gap: 0.35rem; }
  .gap-field { font-size: 0.85rem; gap: 0.35rem; }
  .gap-field input { width: 5rem; }
  .level-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; }
  .level { border: 1px solid var(--border); border-radius: 8px; padding: 0.65rem 0.8rem; display: grid; gap: 0.45rem; }
  .level:hover { border-color: var(--accent); }
  .level-body { display: grid; grid-template-columns: 1fr minmax(8rem, 13rem); gap: 0.8rem; align-items: start; }
  @media (max-width: 560px) { .level-body { grid-template-columns: 1fr; } }
  .stack.tight { gap: 0.4rem; }
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
</style>
