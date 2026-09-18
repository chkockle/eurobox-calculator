import { levelBaseHeights, levelWidth, shelfOuterWidth, topSpan } from '../model/shelfGen';
import type { Settings, Shelf } from '../model/types';
import type { Plan } from './plans';

/** A box positioned in shelf coordinates (mm). x: from the shelf's left edge, y: up from the floor, z: 0 = front edge of the boards, negative = towards the back. */
export interface PlacedBox {
  boxId: string;
  levelIndex: number;
  bay: number;
  x: number;
  y: number;
  /** Front face of the box. */
  zFront: number;
  w: number;
  d: number;
  h: number;
  lid: number;
  /** Sticks out beyond the front edge. */
  overhang: boolean;
  /** Not reachable from the front without moving other boxes (behind or below another box). */
  hidden: boolean;
  /** 0 = front row. */
  row: number;
  /** 0 = bottom of the stack. */
  tier: number;
}

export function bayLeft(shelf: Shelf, bay: number): number {
  return shelf.uprightSize + bay * (shelf.clearWidth + shelf.uprightSize);
}

export { shelfOuterWidth };

/**
 * Left edge (mm) of each shelf when shown side by side: attached shelves share the upright
 * with their left neighbour, others keep `gap` between them.
 */
export function shelfOffsets(shelves: Shelf[], gap: number): number[] {
  const out: number[] = [];
  let x = 0;
  shelves.forEach((s, i) => {
    if (i > 0) {
      const prev = shelves[i - 1];
      x += shelfOuterWidth(prev) + (s.joined ? -Math.min(prev.uprightSize, s.uprightSize) : Math.max(0, gap));
    }
    out.push(x);
  });
  return out;
}

export function placeBoxes(shelf: Shelf, plan: Plan, settings: Settings): PlacedBox[] {
  const out: PlacedBox[] = [];
  const bases = levelBaseHeights(shelf);
  const gap = Math.max(0, settings.gap);
  const tol = Math.max(0, settings.tolerance);
  const W = shelf.clearWidth;
  const D = shelf.clearDepth;

  plan.levels.forEach((lp, li) => {
    const c = lp.candidate;
    if (!c || !c.columns.length) return;
    const level = shelf.levels[li];
    const top = level?.openTop ?? false;
    const width = top ? levelWidth(shelf, level) : W;
    const n = c.columns.length;
    const used = c.columns.reduce((s, col) => s + col.w, 0) + (n - 1) * gap;
    // Spread the spare width evenly: to the left, between columns and to the right.
    const spread = Math.max(0, (width - used) / (n + 1));
    // The top is one surface centred on the shelf; boxes may stick out equally on both sides.
    const starts = top
      ? [(topSpan(shelf) - width) / 2 - Math.max(0, used - width) / 2]
      : Array.from({ length: Math.max(1, shelf.bays) }, (_, bay) => bayLeft(shelf, bay));

    starts.forEach((start, bay) => {
      let x = start + spread;
      c.columns.forEach((col, ci) => {
        const sideOut = c.sideOverhang > 0 && (ci === 0 || ci === n - 1);
        const depthUsed = col.rows * col.d + (col.rows - 1) * col.rowGap;
        const shift = Math.max(0, depthUsed - D);
        for (let r = 0; r < col.rows; r++) {
          const slotFront = shift - r * (col.d + col.rowGap);
          let y = bases[li];
          col.items.forEach((it, s) => {
            out.push({
              boxId: it.boxId,
              levelIndex: li,
              bay,
              x: x + tol / 2,
              y,
              zFront: slotFront,
              w: col.nomW,
              d: col.nomD,
              h: it.nomH,
              lid: it.lid,
              overhang: (r === 0 && shift > 0) || sideOut,
              hidden: r > 0 || s < col.stack - 1,
              row: r,
              tier: s,
            });
            y += it.h;
          });
        }
        x += col.w + gap + spread;
      });
    });
  });
  return out;
}
