import { levelBaseHeights, shelfOuterWidth, shelfTotalHeight } from './shelfGen';
import type { Shelf } from './types';

/** Tops within this many mm count as the same height. */
const SAME_HEIGHT_MM = 5;

/**
 * Bays of one shelf (shelves marked as a bay of the shelf on their left) whose tops are at the same
 * height form one continuous top surface. It is solved on the leftmost bay, spanning the whole
 * frame; the other bays' tops are switched off and point to it. If the heights differ, each bay
 * keeps its own top. Returns copies — the saved project is not changed. Separate shelves never
 * share a top.
 */
export function mergeRackTops(shelves: Shelf[], nameOf: (s: Shelf, i: number) => string): Shelf[] {
  const out = shelves.map((s) => ({ ...s, levels: [...s.levels] }));
  for (const [start, end] of rackGroups(out)) {
    const group = out.slice(start, end + 1);
    const top = group[0].levels.at(-1);
    if (group.length < 2 || !top?.openTop || !top.enabled) continue;
    const heights = group.map(frameHeight);
    if (Math.max(...heights) - Math.min(...heights) > SAME_HEIGHT_MM) continue;
    // Bays share one upright, so each bay after the first adds its width minus that upright.
    let span = shelfOuterWidth(group[0]);
    for (let i = 1; i < group.length; i++) span += shelfOuterWidth(group[i]) - Math.min(group[i - 1].uprightSize, group[i].uprightSize);
    group[0].topSpanWidth = span;
    const leader = nameOf(shelves[start], start);
    for (let i = 1; i < group.length; i++) {
      const last = group[i].levels.length - 1;
      if (group[i].levels[last]?.openTop) {
        group[i].levels[last] = { ...group[i].levels[last], enabled: false, mergedInto: leader };
      }
    }
  }
  return out;
}

/** [first, last] index of each run of shelves that are bays of the same frame. */
export function rackGroups(shelves: Shelf[]): [number, number][] {
  const groups: [number, number][] = [];
  let start = 0;
  while (start < shelves.length) {
    let end = start;
    while (end + 1 < shelves.length && shelves[end + 1].joined) end++;
    groups.push([start, end]);
    start = end + 1;
  }
  return groups;
}

/** Height of the frame as described by a shelf's levels (top board surface). */
function frameHeight(shelf: Shelf): number {
  const last = shelf.levels.at(-1);
  return last?.openTop ? (levelBaseHeights(shelf).at(-1) ?? 0) : shelfTotalHeight(shelf);
}

/**
 * For a bay, how far its levels add up differently from the leftmost bay of the same frame (mm).
 * Beyond a few mm the tops are not joined into one surface.
 */
export function bayHeightDifference(shelves: Shelf[], index: number): number {
  const group = rackGroups(shelves).find(([a, b]) => index >= a && index <= b);
  if (!group || group[0] === index) return 0;
  return frameHeight(shelves[index]) - frameHeight(shelves[group[0]]);
}
