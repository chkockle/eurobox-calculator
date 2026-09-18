<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { app } from '../lib/state/app.svelte';
  import { PRESETS, makeLevel, shelfFromQuick, uid, type QuickShelfInput } from '../lib/model/shelfGen';
  import { allBoxes } from '../lib/model/catalog';
  import type { Level } from '../lib/model/types';
  import NumField from './NumField.svelte';
  import MeasureGuide from './MeasureGuide.svelte';
  import BoxFilter from './BoxFilter.svelte';

  const shelves = $derived(app.project.shelves);
  const shelf = $derived(shelves[app.activeShelf]);
  const enabledBoxes = $derived(allBoxes(app.project).filter((b) => app.project.enabledBoxIds.includes(b.id)));

  let presetId = $state(PRESETS[0].id);
  let quick = $state<QuickShelfInput>({ ...PRESETS[0].input });
  const preset = $derived(PRESETS.find((p) => p.id === presetId));

  function choosePreset(id: string) {
    presetId = id;
    const p = PRESETS.find((x) => x.id === id);
    if (p) quick = { ...p.input };
  }

  function apply() {
    const generated = shelfFromQuick($state.snapshot(quick));
    const idx = app.activeShelf;
    const current = shelves[idx];
    if (current) {
      shelves[idx] = { ...generated, id: current.id, name: current.name || generated.name };
      delete app.project.selection[current.id];
    } else {
      shelves.push(generated);
    }
  }

  function addShelf() {
    const s = shelfFromQuick({ ...PRESETS[0].input, name: t('shelf.defaultName', { n: shelves.length + 1 }) });
    shelves.push(s);
    app.activeShelf = shelves.length - 1;
  }

  function duplicateShelf() {
    if (!shelf) return;
    const copy = $state.snapshot(shelf);
    shelves.push({ ...copy, id: uid(), name: `${copy.name} (2)`, levels: copy.levels.map((l) => ({ ...l, id: uid() })) });
    app.activeShelf = shelves.length - 1;
  }

  function removeShelf() {
    if (!shelf || !confirm(t('shelf.removeConfirm'))) return;
    delete app.project.selection[shelf.id];
    shelves.splice(app.activeShelf, 1);
    app.activeShelf = Math.max(0, app.activeShelf - 1);
  }

  const hasOpenTop = $derived(!!shelf?.levels.at(-1)?.openTop);

  function addLevel() {
    if (!shelf) return;
    // A new board level goes below the open top (if any), which always stays the highest level.
    const boards = shelf.levels.filter((l) => !l.openTop);
    const level = makeLevel(boards.at(-1)?.clearHeight ?? 350);
    if (hasOpenTop) shelf.levels.splice(shelf.levels.length - 1, 0, level);
    else shelf.levels.push(level);
  }

  function addTop() {
    if (shelf && !hasOpenTop) shelf.levels.push(makeLevel(null, true));
  }

  /** Turn identical bays into separate, attached shelves so each can be set up on its own. */
  function splitBays() {
    if (!shelf || shelf.bays < 2) return;
    const s = $state.snapshot(shelf);
    const base = s.name || t('shelf.defaultName', { n: app.activeShelf + 1 });
    const parts = Array.from({ length: s.bays }, (_, b) => ({
      ...s,
      id: b === 0 ? s.id : uid(),
      name: `${base} · ${t('shelf.bayN', { n: b + 1 })}`,
      bays: 1,
      joined: b === 0 ? s.joined : true,
      levels: s.levels.map((l) => ({ ...l, id: b === 0 ? l.id : uid() })),
    }));
    shelves.splice(app.activeShelf, 1, ...parts);
    app.scope = 'all';
  }

  function moveShelf(dir: -1 | 1) {
    const i = app.activeShelf;
    const j = i + dir;
    if (j < 0 || j >= shelves.length) return;
    const [s] = shelves.splice(i, 1);
    shelves.splice(j, 0, s);
    app.activeShelf = j;
  }

  function removeLevel(i: number) {
    if (!shelf) return;
    shelf.levels.splice(i, 1);
  }

  const shelfAllowed = $derived(shelf?.boxIds ? enabledBoxes.filter((b) => shelf.boxIds!.includes(b.id)) : enabledBoxes);

  /** Short list of non-default level settings, shown on the collapsed "More" line. */
  function levelExtras(l: Level): string[] {
    const out: string[] = [];
    if (l.maxStack != null) out.push(l.maxStack === 1 ? t('levels.xNoStack') : t('levels.xStack', { n: l.maxStack }));
    if (l.allowBehind) out.push(t('levels.xBehind'));
    if (l.maxLoadKg != null) out.push(t('levels.xLoad', { kg: l.maxLoadKg }));
    if (l.boxIds) out.push(t('levels.xBoxes', { n: l.boxIds.length }));
    return out;
  }

  const levelOrder = $derived(shelf ? shelf.levels.map((_, i) => i).reverse() : []);
</script>

<section class="card stack" aria-labelledby="shelf-h">
  <div class="row between">
    <h2 id="shelf-h">{t('shelf.section')}</h2>
    <div class="row">
      <button onclick={addShelf}>+ {t('shelf.add')}</button>
    </div>
  </div>

  {#if shelves.length > 1}
    <div class="tabs" role="tablist">
      {#each shelves as s, i (s.id)}
        <button role="tab" aria-selected={i === app.activeShelf} class:active={i === app.activeShelf} onclick={() => (app.activeShelf = i)}>
          {s.name || t('shelf.defaultName', { n: i + 1 })}
        </button>
      {/each}
    </div>
  {/if}

  <details class="box" open={!shelf || shelf.levels.length === 0 || undefined}>
    <summary>{t('shelf.quick')}</summary>
    <div class="stack">
      <small>{t('shelf.quickHint')}</small>
      <label class="field">
        <span class="label">{t('shelf.preset')}</span>
        <select value={presetId} onchange={(e) => choosePreset(e.currentTarget.value)}>
          {#each PRESETS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        </select>
        {#if preset?.source}<small><a href={preset.source} target="_blank" rel="noopener noreferrer">{t('shelf.presetSource')} ↗</a></small>{/if}
      </label>
      <div class="grid-fields">
        <NumField label={t('shelf.outerHeight')} unit="mm" bind:value={quick.outerHeight} />
        <NumField label={t('shelf.outerWidth')} unit="mm" bind:value={quick.outerWidth} />
        <NumField label={t('shelf.outerDepth')} unit="mm" bind:value={quick.outerDepth} />
        <NumField label={t('shelf.boards')} bind:value={quick.boards} min={1} hint={t('shelf.boardsHint')} />
        <NumField label={t('shelf.bays')} bind:value={quick.bays} min={1} />
        <NumField label={t('shelf.boardThickness')} unit="mm" bind:value={quick.boardThickness} />
        <NumField label={t('shelf.uprightSize')} unit="mm" bind:value={quick.uprightSize} />
        <NumField label={t('shelf.bottomOffset')} unit="mm" bind:value={quick.bottomOffset} hint={t('shelf.bottomOffsetHint')} />
      </div>
      <label class="row"><input type="checkbox" bind:checked={quick.useTop} /> {t('shelf.useTop')}</label>
      {#if quick.useTop}
        <NumField label={t('shelf.topSpace')} unit="mm" nullable placeholder={t('levels.noLimit')} hint={t('shelf.topSpaceHint')} bind:value={quick.topSpace} />
      {/if}
      <div><button class="primary" onclick={apply}>{t('shelf.apply')}</button></div>
    </div>
  </details>

  {#if shelf}
    <MeasureGuide />

    <div class="stack">
      <h3>{t('shelf.clear')}</h3>
      <div class="grid-fields">
        <label class="field">
          <span class="label">{t('shelf.name')}</span>
          <input type="text" bind:value={shelf.name} />
        </label>
        <NumField label={t('shelf.clearWidth')} unit="mm" bind:value={shelf.clearWidth} hint={t('shelf.clearWidthHint')} />
        <NumField label={t('shelf.clearDepth')} unit="mm" bind:value={shelf.clearDepth} />
        <NumField label={t('shelf.bays')} bind:value={shelf.bays} min={1} hint={shelf.bays > 1 ? t('shelf.baysSame') : ''} />
        <NumField label={t('shelf.frontOverhang')} unit="mm" bind:value={shelf.frontOverhang} hint={t('shelf.frontOverhangHint')} />
        <NumField label={t('shelf.maxTotalLoad')} unit="kg" nullable bind:value={shelf.maxTotalLoadKg} hint={t('shelf.loadHint')} />
      </div>
      <BoxFilter bind:value={shelf.boxIds} boxes={enabledBoxes} label={t('shelf.boxes')} hint={t('shelf.boxesHint')} />
      {#if shelf.bays > 1}
        <div class="split">
          <button onclick={splitBays}>{t('shelf.split')}</button>
          <small>{t('shelf.splitHint', { n: shelf.bays })}</small>
        </div>
      {/if}
      {#if app.activeShelf > 0}
        <label class="row"><input type="checkbox" bind:checked={shelf.joined} /> {t('shelf.joined')}</label>
      {/if}
    </div>

    <div class="stack">
      <div>
        <h3>{t('levels.title')}</h3>
        <small>{t('levels.hint')}</small>
      </div>

      {#if !shelf.levels.length}
        <p class="muted">{t('levels.none')}</p>
      {/if}

      <div class="row">
        <button onclick={addLevel}>+ {t('levels.add')}</button>
        {#if !hasOpenTop}<button onclick={addTop}>+ {t('levels.addTop')}</button>{/if}
      </div>

      <ol class="levels">
        {#each levelOrder as i (shelf.levels[i].id)}
          {@const level = shelf.levels[i]}
          {@const extras = levelExtras(level)}
          <li class="level" class:off={!level.enabled}>
            <div class="level-row">
              <input type="checkbox" bind:checked={level.enabled} aria-label={`${t('levels.use')}: ${t('levels.level')} ${i + 1}`} />
              <strong class="name">
                {level.openTop ? t('levels.topShort') : `${t('levels.level')} ${i + 1}`}
              </strong>
              {#if level.openTop}
                <NumField compact label={t('levels.clearHeight')} unit="mm" nullable placeholder={t('levels.noLimit')} bind:value={level.clearHeight} />
              {:else}
                <NumField compact label={t('levels.clearHeight')} unit="mm" bind:value={() => level.clearHeight ?? 0, (v) => (level.clearHeight = v ?? 0)} />
              {/if}
              <button class="icon remove" title={t('levels.remove')} aria-label={t('levels.remove')} onclick={() => removeLevel(i)}>✕</button>
            </div>
            <details class="more">
              <summary>
                {t('levels.more')}{#if extras.length}: <span class="extras">{extras.join(' · ')}</span>{/if}
              </summary>
              <div class="level-fields">
                <NumField label={t('levels.stack')} nullable placeholder={t('levels.noLimit')} bind:value={level.maxStack} min={1} max={20} hint={level.openTop && level.clearHeight == null ? t('levels.stackHintTop') : t('levels.stackHint')} />
                <NumField label={t('levels.maxLoad')} unit="kg" nullable bind:value={level.maxLoadKg} />
                <label class="row behind" title={t('levels.behindHint')}>
                  <input type="checkbox" bind:checked={level.allowBehind} />
                  <span>{t('levels.behind')}<br /><small>{t('levels.behindHint')}</small></span>
                </label>
              </div>
              <BoxFilter bind:value={level.boxIds} boxes={shelfAllowed} label={t('levels.boxes')} hint={t('levels.boxesHint')} />
            </details>
          </li>
        {/each}
      </ol>
    </div>

    <div class="row">
      <button onclick={duplicateShelf}>{t('shelf.duplicate')}</button>
      {#if shelves.length > 1}
        <button onclick={() => moveShelf(-1)} disabled={app.activeShelf === 0}>← {t('shelf.moveLeft')}</button>
        <button onclick={() => moveShelf(1)} disabled={app.activeShelf === shelves.length - 1}>{t('shelf.moveRight')} →</button>
        <button onclick={removeShelf}>{t('shelf.remove')}</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .between { justify-content: space-between; }
  .field { display: flex; flex-direction: column; gap: 0.2rem; }
  .label { font-size: 0.85rem; font-weight: 500; }
  select { max-width: 100%; }
  .tabs { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .tabs button.active { background: var(--accent-soft); border-color: var(--accent); font-weight: 600; }
  .levels { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
  .level { border: 1px solid var(--border); border-radius: 8px; padding: 0.45rem 0.65rem; display: grid; gap: 0.3rem; background: var(--surface); }
  .level.off { opacity: 0.6; }
  .level-row { display: flex; align-items: center; gap: 0.6rem; }
  .level-row .name { flex: 1; font-size: 0.9rem; }
  .more > summary { font-size: 0.8rem; font-weight: 500; color: var(--muted); }
  .more[open] > summary { margin-bottom: 0.5rem; }
  .extras { color: var(--accent); font-weight: 600; }
  .more .level-fields { margin-bottom: 0.5rem; }
  .level-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 0.5rem 0.75rem; align-items: start; }
  .behind { align-items: flex-start; font-size: 0.85rem; font-weight: 500; }
  .behind small { font-weight: 400; font-size: 0.75rem; }
  .split { display: grid; gap: 0.25rem; justify-items: start; }
</style>
