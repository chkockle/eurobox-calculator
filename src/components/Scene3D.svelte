<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { WebGLRenderer } from 'three';
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n/index.svelte';
  import type { BoxType, Shelf } from '../lib/model/types';
  import type { PlacedBox } from '../lib/solver/geometry';
  import ShelfScene from './ShelfScene.svelte';

  interface Props {
    shelf: Shelf;
    placed: PlacedBox[];
    byId: Map<string, BoxType>;
    codes: Map<string, string>;
    highlight: number | null;
  }
  let { shelf, placed, byId, codes, highlight }: Props = $props();

  let mode = $state<'front' | '3d'>('front');
  let resetKey = $state(0);
  let wrap: HTMLDivElement;
  let snapshot = $state('');
  let zoomEnabled = $state(false);

  const createRenderer = (canvas: HTMLCanvasElement) =>
    new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });

  // WebGL canvases do not always print; swap in a still image while printing.
  onMount(() => {
    const before = () => {
      const canvas = wrap?.querySelector('canvas');
      snapshot = canvas ? canvas.toDataURL('image/png') : '';
    };
    const after = () => (snapshot = '');
    addEventListener('beforeprint', before);
    addEventListener('afterprint', after);
    return () => {
      removeEventListener('beforeprint', before);
      removeEventListener('afterprint', after);
    };
  });
</script>

<div class="scene-head row no-print">
  <div class="seg" role="group" aria-label={t('view.title')}>
    <button class:on={mode === 'front'} aria-pressed={mode === 'front'} onclick={() => (mode = 'front')}>{t('view.front')}</button>
    <button class:on={mode === '3d'} aria-pressed={mode === '3d'} onclick={() => (mode = '3d')}>{t('view.3d')}</button>
  </div>
  <button onclick={() => resetKey++}>{t('view.reset')}</button>
  <small class="muted">{t('view.hint')}</small>
</div>

<div
  class="scene"
  class:active={zoomEnabled}
  bind:this={wrap}
  class:printing={!!snapshot}
  role="presentation"
  onpointerdown={() => (zoomEnabled = true)}
  onpointerleave={() => (zoomEnabled = false)}
>
  {#key `${mode}-${resetKey}`}
    <Canvas {createRenderer}>
      <ShelfScene {shelf} {placed} {byId} {codes} {mode} {highlight} {zoomEnabled} />
    </Canvas>
  {/key}
</div>
{#if snapshot}<img class="print-only snapshot" src={snapshot} alt={t('view.title')} />{/if}

<style>
  .scene-head { margin-bottom: 0.5rem; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; }
  .seg button { border: none; border-radius: 0; padding: 0.35rem 0.8rem; background: var(--surface); }
  .seg button.on { background: var(--accent); color: var(--accent-text); }
  .scene {
    position: relative;
    height: min(62vh, 560px);
    min-height: 320px;
    background: var(--scene-bg);
    border-radius: 8px;
    overflow: hidden;
    outline: 2px solid transparent;
  }
  .scene.active { outline-color: var(--accent); }
  .snapshot { width: 100%; }
  @media print {
    .scene.printing { display: none; }
  }
</style>
