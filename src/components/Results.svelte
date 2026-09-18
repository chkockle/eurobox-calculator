<script lang="ts">
  import { fmt, money, t } from '../lib/i18n/index.svelte';
  import { app } from '../lib/state/app.svelte';
  import { allBoxes } from '../lib/model/catalog';
  import type { Objective, Project, Shelf } from '../lib/model/types';
  import { effectivePlan, rankPlans, solveShelf, TIGHT_MM, type Plan } from '../lib/solver/plans';
  import type { LevelCandidate } from '../lib/solver/level';
  import { placeBoxes } from '../lib/solver/geometry';
  import { boxColor, boxName, candidateSummary, planLabel } from '../lib/display';
  // three.js is most of the bundle — load the 3D view separately so the form appears first.
  const scene3d = import('./Scene3D.svelte');

  const objectives: Objective[] = ['volume', 'count', 'fewestTypes', 'value'];

  const shelf = $derived(app.project.shelves[app.activeShelf] as Shelf | undefined);
  const catalog = $derived(allBoxes(app.project));
  const byId = $derived(new Map(catalog.map((b) => [b.id, b])));
  const settings = $derived($state.snapshot(app.project.settings) as Project['settings']);
  const prices = $derived($state.snapshot(app.project.prices) as Record<string, number>);

  const solution = $derived.by(() => {
    if (!shelf) return null;
    const enabled = new Set(app.project.enabledBoxIds);
    const boxes = $state.snapshot(catalog.filter((b) => enabled.has(b.id)));
    return solveShelf($state.snapshot(shelf) as Shelf, boxes, { prices, settings });
  });

  const ranked = $derived(solution ? rankPlans(solution.plans, app.project.objective) : []);
  const selection = $derived(shelf ? app.project.selection[shelf.id] : undefined);
  const basePlan = $derived(ranked.find((p) => p.key === selection?.plan) ?? ranked[0]);
  const plan = $derived(shelf && solution ? effectivePlan(shelf, solution, ranked, selection, prices, settings) : null);
  const customised = $derived(!!selection && Object.keys(selection.overrides).length > 0);

  const shown = $derived.by(() => {
    const top = ranked.slice(0, 6);
    if (basePlan && !top.includes(basePlan)) top.push(basePlan);
    return top;
  });

  const hasPrices = $derived(Object.keys(prices).length > 0);
  const codes = $derived(new Map((plan?.boxes ?? []).map((b, i) => [b.boxId, String.fromCharCode(65 + (i % 26))])));
  const placed = $derived(shelf && plan ? placeBoxes($state.snapshot(shelf) as Shelf, plan, settings) : []);
  let highlight = $state<number | null>(null);

  function selectPlan(key: string) {
    if (!shelf) return;
    app.project.selection[shelf.id] = { plan: key, overrides: {} };
  }

  function setLevel(levelId: string, index: number, sig: string) {
    if (!shelf || !basePlan) return;
    const current = app.project.selection[shelf.id] ?? { plan: basePlan.key, overrides: {} };
    const baseSig = basePlan.levels[index]?.candidate?.sig ?? '';
    if (sig === baseSig) delete current.overrides[levelId];
    else current.overrides[levelId] = sig;
    app.project.selection[shelf.id] = current;
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

  const lidCount = $derived(
    settings.lids && plan ? plan.boxes.reduce((s, b) => s + (byId.get(b.boxId)?.lidded ? 0 : b.count), 0) : 0,
  );

  let copied = $state(false);
  async function copyList() {
    if (!plan) return;
    const lines = plan.boxes.map((b) => {
      const price = b.price != null ? ` × ${money(b.price, settings.currency)} = ${money(b.price * b.count, settings.currency)}` : '';
      return `${codes.get(b.boxId)}  ${b.count} × ${boxName(byId.get(b.boxId))}${price}`;
    });
    if (lidCount) lines.push(t('shop.lids', { n: lidCount }));
    lines.push(`${t('shop.volume')}: ${fmt(plan.volume)} L`);
    if (plan.cost != null) lines.push(`${t('shop.total')}: ${costLine(plan)}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // clipboard blocked — nothing else to do
    }
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
      <h2 id="obj-h">{t('results.objective')}</h2>
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
          {t('view.title')}: {shelf.name}
          <span class="muted plan-name">— {planLabel(plan.key, byId)}{customised ? ` (${t('plan.custom')})` : ''}</span>
        </h2>
        <span class="num"><strong>{fmt(plan.volume)} L</strong> · {t('plan.boxes', { n: plan.count })}</span>
      </div>

      {#await scene3d}
        <div class="scene-loading"></div>
      {:then { default: Scene3D }}
        <Scene3D shelf={$state.snapshot(shelf) as Shelf} {placed} {byId} {codes} {highlight} />
      {/await}

      <div class="legend row">
        {#each plan.boxes as b (b.boxId)}
          <span class="row legend-item">
            <span class="swatch" style:background={boxColor(byId.get(b.boxId))}></span>
            <strong>{codes.get(b.boxId)}</strong>
            {boxName(byId.get(b.boxId))}
          </span>
        {/each}
      </div>
    </section>

    <section class="card stack" aria-labelledby="levels-h">
      <h2 id="levels-h">{t('levels.title')}</h2>
      <ol class="level-list">
        {#each levelOrder as i (shelf.levels[i].id)}
          {@const level = shelf.levels[i]}
          {@const lp = plan.levels[i]}
          {@const result = solution?.levels[i] ?? null}
          {@const c = lp?.candidate ?? null}
          {@const bestVolume = result?.candidates[0]?.volume ?? 0}
          <li
            class="level"
            onmouseenter={() => (highlight = i)}
            onmouseleave={() => (highlight = null)}
            onfocusin={() => (highlight = i)}
            onfocusout={() => (highlight = null)}
          >
            <div class="row between">
              <h3>
                {level.openTop ? t('level.topTitle') : t('level.title', { n: i + 1 })}
                <span class="muted">· {t('level.clear', { h: fmt(level.clearHeight) })}</span>
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
                      <span class="badge" class:warn={c.spareHeight < TIGHT_MM}>{t('level.spareHeight', { mm: fmt(c.spareHeight + (level.openTop ? 0 : settings.topClearance)) })}</span>
                      {#if c.overhang > 0}<span class="badge warn">{t('level.overhang', { mm: fmt(c.overhang) })}</span>{/if}
                      {#if notFrontAccessible(c)}<span class="badge">{t('badge.hidden')}</span>{/if}
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
            {#each plan.boxes as b (b.boxId)}
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
              <td class="r num">{plan.count}</td>
              <td></td>
              <td class="r num">{plan.cost != null ? costLine(plan) : '–'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="row">
        <span>{t('shop.volume')}: <strong class="num">{fmt(plan.volume)} L</strong></span>
        {#if plan.totalLoadKg != null}
          <span>· {t('shop.load')}: <strong class="num">≈ {fmt(plan.totalLoadKg)} kg</strong></span>
        {/if}
      </p>
      {#if plan.overloadTotal && shelf.maxTotalLoadKg != null}
        <p class="badge danger">{t('shop.overloadTotal', { max: fmt(shelf.maxTotalLoadKg) })}</p>
      {/if}
      <small>{t('note.sizes')}</small>
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
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
  th { font-weight: 600; font-size: 0.8rem; color: var(--muted); }
  tfoot td { font-weight: 600; border-bottom: none; }
  .r { text-align: right; }
  .scene-loading { height: min(62vh, 560px); min-height: 320px; background: var(--scene-bg); border-radius: 8px; }
</style>
