import { levelBaseHeights } from '../model/shelfGen';
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

export function shelfOuterWidth(shelf: Shelf): number {
  return bayLeft(shelf, shelf.bays);
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
    const n = c.columns.length;
    const used = c.columns.reduce((s, col) => s + col.w, 0) + (n - 1) * gap;
    // Spread the spare width evenly: to the left, between columns and to the right.
    const spread = Math.max(0, (W - used) / (n + 1));

    for (let bay = 0; bay < Math.max(1, shelf.bays); bay++) {
      let x = bayLeft(shelf, bay) + spread;
      for (const col of c.columns) {
        const depthUsed = col.rows * col.d + (col.rows - 1) * col.rowGap;
        const shift = Math.max(0, depthUsed - D);
        for (let r = 0; r < col.rows; r++) {
          const slotFront = shift - r * (col.d + col.rowGap);
          for (let s = 0; s < col.stack; s++) {
            out.push({
              boxId: col.boxId,
              levelIndex: li,
              bay,
              x: x + tol / 2,
              y: bases[li] + s * col.h,
              zFront: slotFront,
              w: col.nomW,
              d: col.nomD,
              h: col.nomH,
              lid: col.lid,
              overhang: r === 0 && shift > 0,
              hidden: r > 0 || s < col.stack - 1,
              row: r,
              tier: s,
            });
          }
        }
        x += col.w + gap + spread;
      }
    }
  });
  return out;
}
