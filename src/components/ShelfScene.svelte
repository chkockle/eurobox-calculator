<script lang="ts" module>
  import type { Shelf } from '../lib/model/types';
  import type { PlacedBox } from '../lib/solver/geometry';

  /** One shelf in the scene, offset along the wall by x0 (mm). */
  export interface SceneShelf {
    id: string;
    shelf: Shelf;
    placed: PlacedBox[];
    x0: number;
  }
</script>

<script lang="ts">
  import { T, useThrelte } from '@threlte/core';
  import { Edges, HTML, OrbitControls } from '@threlte/extras';
  import type { BoxType } from '../lib/model/types';
  import { shelfOuterWidth } from '../lib/solver/geometry';
  import { levelBaseHeights, shelfTotalHeight } from '../lib/model/shelfGen';
  import { boxColor } from '../lib/display';

  interface Props {
    items: SceneShelf[];
    byId: Map<string, BoxType>;
    codes: Map<string, string>;
    mode: 'front' | '3d';
    /** Highlight one level of one shelf; everything else is faded. */
    highlight: { shelfId: string; level: number } | null;
    /** Wheel zoom only while the user works in the view, so page scrolling is not hijacked. */
    zoomEnabled: boolean;
  }

  let { items, byId, codes, mode, highlight, zoomEnabled }: Props = $props();

  const { size } = useThrelte();
  const M = 0.001; // mm → m

  interface Frame {
    width: number;
    height: number;
    depth: number;
    u: number;
    tb: number;
    posts: number[];
    boards: number[];
  }

  function frame(shelf: Shelf): Frame {
    const posts: number[] = [];
    for (let i = 0; i <= Math.max(1, shelf.bays); i++) posts.push(i * (shelf.clearWidth + shelf.uprightSize) * M);
    const bases = levelBaseHeights(shelf);
    const boards = bases.map((y) => y * M);
    const last = shelf.levels.at(-1);
    if (last && !last.openTop) boards.push((bases.at(-1)! + (last.clearHeight ?? 0) + shelf.boardThickness) * M);
    return {
      width: shelfOuterWidth(shelf) * M,
      height: Math.max(shelfTotalHeight(shelf), 300) * M,
      depth: shelf.clearDepth * M,
      u: Math.max(10, shelf.uprightSize) * M,
      tb: Math.max(5, shelf.boardThickness) * M,
      posts,
      boards,
    };
  }

  const frames = $derived(items.map((it) => frame(it.shelf)));

  // Overall extent: all shelves plus anything standing on top of them.
  const W = $derived(Math.max(0.3, ...items.map((it, i) => it.x0 * M + frames[i].width)));
  const H = $derived(
    Math.max(0.3, ...frames.map((f) => f.height), ...items.flatMap((it) => it.placed.map((p) => (p.y + p.h + p.lid) * M))),
  );
  const D = $derived(Math.max(0.2, ...frames.map((f) => f.depth)));
  const target = $derived<[number, number, number]>([W / 2, H / 2, -D / 2]);

  const zoom = $derived(Math.min($size.width / (W * 1.12), $size.height / (H * 1.1)));
  const fov = 35;
  const dist = $derived.by(() => {
    const aspect = Math.max(0.3, $size.width / Math.max(1, $size.height));
    const fit = Math.max(H, W / aspect) * 1.15;
    return fit / (2 * Math.tan((fov * Math.PI) / 360)) + D;
  });

  const dim = (id: string, p: PlacedBox) => highlight != null && (highlight.shelfId !== id || p.levelIndex !== highlight.level);
</script>

{#if mode === 'front'}
  <T.OrthographicCamera makeDefault position={[W / 2, H / 2, 10]} {zoom} near={0.01} far={100}>
    <OrbitControls {target} enableDamping enableZoom={zoomEnabled} />
  </T.OrthographicCamera>
{:else}
  <T.PerspectiveCamera makeDefault {fov} position={[W / 2 + dist * 0.45, H / 2 + dist * 0.25, dist * 0.85]} near={0.01} far={200}>
    <OrbitControls {target} enableDamping enableZoom={zoomEnabled} />
  </T.PerspectiveCamera>
{/if}

<T.AmbientLight intensity={1.4} />
<T.DirectionalLight position={[W * 0.3, H * 1.5, 4]} intensity={1.6} />
<T.DirectionalLight position={[-2, H, -3]} intensity={0.4} />

{#each items as it, si (it.id)}
  {@const f = frames[si]}
  <T.Group position={[it.x0 * M, 0, 0]}>
    <!-- uprights -->
    {#each f.posts as x, i (i)}
      {#each [-f.u / 2, -f.depth + f.u / 2] as z, j (j)}
        <T.Mesh position={[x + f.u / 2, f.height / 2, z]}>
          <T.BoxGeometry args={[f.u, f.height, f.u]} />
          <T.MeshStandardMaterial color="#9aa3a0" metalness={0.5} roughness={0.5} />
        </T.Mesh>
      {/each}
    {/each}

    <!-- boards -->
    {#each f.boards as y, i (i)}
      <T.Mesh position={[f.width / 2, y - f.tb / 2, -f.depth / 2]}>
        <T.BoxGeometry args={[f.width, f.tb, f.depth]} />
        <T.MeshStandardMaterial color="#b9c0bc" metalness={0.4} roughness={0.6} transparent opacity={0.92} />
      </T.Mesh>
    {/each}

    <!-- boxes -->
    {#each it.placed as p, i (i)}
      {@const faded = dim(it.id, p)}
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
  </T.Group>
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
