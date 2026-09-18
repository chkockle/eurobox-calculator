<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
</script>

<details class="box">
  <summary>{t('guide.title')}</summary>
  <div class="guide">
    <svg viewBox="0 0 260 190" role="img" aria-label={t('guide.title')}>
      <!-- uprights -->
      <rect x="20" y="10" width="12" height="170" class="post" />
      <rect x="228" y="10" width="12" height="170" class="post" />
      <!-- boards -->
      <rect x="20" y="40" width="220" height="8" class="board" />
      <rect x="20" y="130" width="220" height="8" class="board" />
      <!-- a box -->
      <rect x="60" y="78" width="90" height="52" rx="3" class="crate" />
      <!-- width -->
      <line x1="32" y1="160" x2="228" y2="160" class="dim" marker-start="url(#a)" marker-end="url(#a)" />
      <text x="130" y="175" text-anchor="middle">A</text>
      <!-- height -->
      <line x1="200" y1="48" x2="200" y2="130" class="dim" marker-start="url(#a)" marker-end="url(#a)" />
      <text x="208" y="93">B</text>
      <defs>
        <marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" class="arrow" />
        </marker>
      </defs>
    </svg>
    <ul>
      <li><strong>A</strong> — {t('guide.width')}</li>
      <li><strong>B</strong> — {t('guide.height')}</li>
      <li>{t('guide.depth')}</li>
      <li>{t('guide.center')}</li>
    </ul>
  </div>
</details>

<style>
  .guide { display: grid; grid-template-columns: minmax(0, 11rem) 1fr; gap: 0.75rem; align-items: start; }
  @media (max-width: 520px) { .guide { grid-template-columns: 1fr; } svg { max-width: 14rem; } }
  svg { width: 100%; height: auto; }
  .post { fill: var(--muted); opacity: 0.6; }
  .board { fill: var(--muted); }
  .crate { fill: var(--accent-soft); stroke: var(--accent); }
  .dim { stroke: var(--danger); stroke-width: 1.5; }
  .arrow { fill: var(--danger); }
  text { fill: var(--danger); font-size: 12px; font-weight: 700; }
  ul { margin: 0; padding-left: 1.1rem; font-size: 0.88rem; display: grid; gap: 0.3rem; }
</style>
