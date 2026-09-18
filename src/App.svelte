<script lang="ts">
  import { i18n, t, type MessageKey } from './lib/i18n/index.svelte';
  import { app, replaceProject, save } from './lib/state/app.svelte';
  import { exportJson, parseProject, shareHash } from './lib/state/persist';
  import { defaultProject } from './lib/model/defaults';
  import type { Project } from './lib/model/types';
  import ShelfEditor from './components/ShelfEditor.svelte';
  import BoxCatalog from './components/BoxCatalog.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import Results from './components/Results.svelte';
  import Legal from './components/Legal.svelte';
  import { HAS_IMPRINT, REPO_URL } from './lib/legal';

  // Tiny hash router for the legal pages; share links (#p=…) are consumed on load.
  let hash = $state(location.hash);
  const legalPage = $derived(
    hash === '#impressum' && HAS_IMPRINT ? 'impressum' : hash === '#datenschutz' || hash === '#impressum' ? 'privacy' : null,
  );
  $effect(() => {
    const onHash = () => {
      hash = location.hash;
      scrollTo(0, 0);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  });

  let fileInput: HTMLInputElement;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  // Autosave, debounced.
  $effect(() => {
    JSON.stringify(app.project); // track deeply
    const id = setTimeout(save, 300);
    return () => clearTimeout(id);
  });

  $effect(() => {
    document.documentElement.lang = i18n.locale;
    document.title = t('app.title');
  });

  function toast(key: MessageKey) {
    app.toast = key;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (app.toast = ''), 3500);
  }
  if (app.toast) toast(app.toast as MessageKey);

  function snapshot(): Project {
    return $state.snapshot(app.project) as Project;
  }

  function exportFile() {
    const blob = new Blob([exportJson(snapshot())], { type: 'application/json' });
    const a = document.createElement('a');
    const name = (app.project.shelves[0]?.name || 'eurobox').replace(/[^\w\-]+/g, '_');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importFile(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      replaceProject(parseProject(JSON.parse(await file.text())));
      toast('action.imported');
    } catch (err) {
      toast(err instanceof Error && err.message === 'newer-version' ? 'action.importNewer' : 'action.importFailed');
    }
  }

  async function share() {
    const url = `${location.origin}${location.pathname}${shareHash(snapshot())}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('action.shareCopied');
    } catch {
      history.replaceState(null, '', url);
      toast('action.shareFailed');
    }
  }

  function reset() {
    if (confirm(t('action.resetConfirm'))) replaceProject(defaultProject());
  }
</script>

<header class="top">
  <div class="brand">
    <svg viewBox="0 0 32 32" aria-hidden="true" class="logo">
      <rect x="3" y="9" width="26" height="18" rx="2.5" />
      <rect x="3" y="5" width="26" height="6" rx="2" class="rim" />
      <rect x="11" y="14" width="10" height="3" rx="1.5" class="grip" />
    </svg>
    <div>
      <h1>{t('app.title')}</h1>
      <p class="muted tagline">{t('app.tagline')}</p>
    </div>
  </div>
  <nav class="row actions no-print">
    <button onclick={exportFile}>{t('action.export')}</button>
    <button onclick={() => fileInput.click()}>{t('action.import')}</button>
    <button onclick={share}>{t('action.share')}</button>
    <button onclick={() => print()}>{t('action.print')}</button>
    <button onclick={reset}>{t('action.reset')}</button>
    <div class="lang" role="group" aria-label="Language / Sprache">
      <button class:on={i18n.locale === 'de'} aria-pressed={i18n.locale === 'de'} onclick={() => (i18n.locale = 'de')}>DE</button>
      <button class:on={i18n.locale === 'en'} aria-pressed={i18n.locale === 'en'} onclick={() => (i18n.locale = 'en')}>EN</button>
    </div>
    <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={importFile} />
  </nav>
</header>

{#if legalPage}
  <main class="page">
    <Legal page={legalPage} />
  </main>
{:else}
  <main class="layout">
    <div class="inputs stack no-print">
      <ShelfEditor />
      <BoxCatalog />
      <SettingsPanel />
    </div>
    <div class="results stack">
      <Results />
    </div>
  </main>
{/if}

<footer class="muted">
  <p>
    <a href="https://huggingface.co/datasets/danielrosehill/storage-container-dimensions" target="_blank" rel="noopener noreferrer">{t('footer.data')}</a>
  </p>
  <p class="no-print">{t('footer.local')}</p>
  <nav class="row legal-links no-print">
    {#if HAS_IMPRINT}<a href="#impressum">{t('footer.imprint')}</a>{/if}
    <a href="#datenschutz">{t('footer.privacy')}</a>
    <a href={REPO_URL} target="_blank" rel="noopener noreferrer">{t('footer.code')}</a>
  </nav>
</footer>

{#if app.toast}
  <div class="toast" role="status">{t(app.toast as MessageKey)}</div>
{/if}

<style>
  .top {
    display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;
    padding: 1rem clamp(1rem, 3vw, 2rem); border-bottom: 1px solid var(--border); background: var(--surface);
  }
  .brand { display: flex; gap: 0.75rem; align-items: center; }
  .logo { width: 2.4rem; height: 2.4rem; flex: none; }
  .logo rect { fill: var(--accent); }
  .logo .rim { fill: var(--accent); opacity: 0.7; }
  .logo .grip { fill: var(--surface); }
  h1 { font-size: 1.35rem; }
  .tagline { font-size: 0.88rem; }
  .actions { gap: 0.4rem; }
  .actions button { font-size: 0.85rem; }
  .lang { display: inline-flex; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; }
  .lang button { border: none; border-radius: 0; padding: 0.3rem 0.55rem; }
  .lang button.on { background: var(--accent); color: var(--accent-text); }
  .layout {
    display: grid; grid-template-columns: minmax(320px, 440px) minmax(0, 1fr); gap: 1rem;
    padding: 1rem clamp(1rem, 3vw, 2rem); align-items: start; max-width: 1600px; margin: 0 auto;
  }
  .inputs, .results { min-width: 0; }
  @media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); } }
  /* Wide screens: keep the result in view while editing the inputs on the left. */
  @media (min-width: 1100px) {
    .results { position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow-y: auto; overscroll-behavior: contain; padding-right: 0.25rem; }
  }
  .page { padding: 1rem clamp(1rem, 3vw, 2rem); }
  .legal-links { gap: 1rem; }
  footer { padding: 1rem clamp(1rem, 3vw, 2rem) 2rem; font-size: 0.8rem; display: grid; gap: 0.25rem; max-width: 1600px; margin: 0 auto; }
  .toast {
    position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%);
    background: var(--text); color: var(--bg); padding: 0.55rem 1rem; border-radius: 8px; box-shadow: var(--shadow); z-index: 10;
  }
  @media print {
    .layout { display: block; padding: 0; }
    .top { border: none; padding: 0 0 1rem; }
  }
</style>
