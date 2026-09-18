<script lang="ts">
  import { T, useThrelte } from '@threlte/core';
  import { Edges, HTML, OrbitControls } from '@threlte/extras';
  import type { BoxType, Shelf } from '../lib/model/types';
  import type { PlacedBox } from '../lib/solver/geometry';
  import { shelfOuterWidth } from '../lib/solver/geometry';
  import { levelBaseHeights, shelfTotalHeight } from '../lib/model/shelfGen';
  import { boxColor } from '../lib/display';

  interface Props {
    shelf: Shelf;
    placed: PlacedBox[];
    byId: Map<string, BoxType>;
    codes: Map<string, string>;
    mode: 'front' | '3d';
    highlight: number | null;
    /** Wheel zoom only while the user works in the view, so page scrolling is not hijacked. */
    zoomEnabled: boolean;
  }

  let { shelf, placed, byId, codes, mode, highlight, zoomEnabled }: Props = $props();

  const { size } = useThrelte();
  const M = 0.001; // mm → m

  const W = $derived(shelfOuterWidth(shelf) * M);
  const H = $derived(Math.max(shelfTotalHeight(shelf), 300) * M);
  const D = $derived(shelf.clearDepth * M);
  const u = $derived(Math.max(10, shelf.uprightSize) * M);
  const tb = $derived(Math.max(5, shelf.boardThickness) * M);
  const target = $derived<[number, number, number]>([W / 2, H / 2, -D / 2]);

  const posts = $derived.by(() => {
    const out: number[] = [];
    for (let i = 0; i <= Math.max(1, shelf.bays); i++) out.push((i * (shelf.clearWidth + shelf.uprightSize)) * M);
    return out;
  });

  const boards = $derived.by(() => {
    const bases = levelBaseHeights(shelf);
    const ys = bases.map((y) => y * M);
    const last = shelf.levels.at(-1);
    if (last && !last.openTop) ys.push((bases.at(-1)! + last.clearHeight + shelf.boardThickness) * M);
    return ys;
  });

  const zoom = $derived(Math.min($size.width / (W * 1.15), $size.height / (H * 1.1)));
  const fov = 35;
  const dist = $derived.by(() => {
    const aspect = Math.max(0.3, $size.width / Math.max(1, $size.height));
    const fit = Math.max(H, W / aspect) * 1.15;
    return fit / (2 * Math.tan((fov * Math.PI) / 360)) + D;
  });

  const dim = (p: PlacedBox) => highlight != null && p.levelIndex !== highlight;
</script>

{#if mode === 'front'}
  <T.OrthographicCamera makeDefault position={[W / 2, H / 2, 10]} {zoom} near={0.01} far={100}>
    <OrbitControls target={target} enableDamping enableZoom={zoomEnabled} />
  </T.OrthographicCamera>
{:else}
  <T.PerspectiveCamera makeDefault {fov} position={[W / 2 + dist * 0.45, H / 2 + dist * 0.25, dist * 0.85]} near={0.01} far={100}>
    <OrbitControls target={target} enableDamping enableZoom={zoomEnabled} />
  </T.PerspectiveCamera>
{/if}

<T.AmbientLight intensity={1.4} />
<T.DirectionalLight position={[W * 0.3, H * 1.5, 4]} intensity={1.6} />
<T.DirectionalLight position={[-2, H, -3]} intensity={0.4} />

<!-- uprights -->
{#each posts as x, i (i)}
  {#each [-u / 2, -D + u / 2] as z, j (j)}
    <T.Mesh position={[x + u / 2, H / 2, z]}>
      <T.BoxGeometry args={[u, H, u]} />
      <T.MeshStandardMaterial color="#9aa3a0" metalness={0.5} roughness={0.5} />
    </T.Mesh>
  {/each}
{/each}

<!-- boards -->
{#each boards as y, i (i)}
  <T.Mesh position={[W / 2, y - tb / 2, -D / 2]}>
    <T.BoxGeometry args={[W, tb, D]} />
    <T.MeshStandardMaterial color="#b9c0bc" metalness={0.4} roughness={0.6} transparent opacity={0.92} />
  </T.Mesh>
{/each}

<!-- boxes -->
{#each placed as p, i (i)}
  {@const faded = dim(p)}
  {@const color = boxColor(byId.get(p.boxId))}
  <T.Mesh position={[(p.x + p.w / 2) * M, (p.y + p.h / 2) * M, (p.zFront - p.d / 2) * M]}>
    <T.BoxGeometry args={[p.w * M, p.h * M, p.d * M]} />
    <T.MeshStandardMaterial {color} roughness={0.85} transparent={faded} opacity={faded ? 0.18 : 1} />
    <Edges color={p.overhang ? '#d23a2e' : '#26302b'} />
  </T.Mesh>
  {#if p.lid > 0}
    <T.Mesh position={[(p.x + p.w / 2) * M, (p.y + p.h + p.lid / 2) * M, (p.zFront - p.d / 2) * M]}>
      <T.BoxGeometry args={[(p.w + 6) * M, p.lid * M, (p.d + 6) * M]} />
      <T.MeshStandardMaterial {color} roughness={0.6} transparent={faded} opacity={faded ? 0.18 : 1} />
    </T.Mesh>
  {/if}
  {#if p.row === 0 && !faded}
    <HTML position={[(p.x + p.w / 2) * M, (p.y + p.h / 2) * M, p.zFront * M + 0.001]} center pointerEvents="none">
      <span class="code">{codes.get(p.boxId) ?? ''}</span>
    </HTML>
  {/if}
{/each}

<style>
  .code {
    font: 700 12px/1 system-ui, sans-serif;
    color: #111;
    background: rgb(255 255 255 / 0.85);
    border-radius: 4px;
    padding: 2px 5px;
    user-select: none;
  }
</style>
