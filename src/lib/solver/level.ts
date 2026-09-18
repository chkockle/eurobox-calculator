import { footprintKey } from '../model/catalog';
import type { BoxType, Level, Settings, Shelf } from '../model/types';
import { levelWidth } from '../model/shelfGen';

/** One box in a stack. */
export interface StackItem {
  boxId: string;
  /** Height the solver reserves: box + lid + tolerance. */
  h: number;
  /** Nominal box height (without lid), for rendering. */
  nomH: number;
  lid: number;
  capacityL: number;
}

/**
 * One "column" of a level: a strip across the shelf width in one orientation — `rows` deep
 * (front to back), each row the same stack of boxes. Usually one box type repeated; a mixed
 * column stacks different heights of the same footprint (e.g. 22 cm on 17 cm).
 */
export interface ColumnOption {
  key: string;
  /** The bottom box (for single-type columns: the only box type). */
  boxId: string;
  /** The stack from bottom to top. */
  items: StackItem[];
  /** Different box heights in one stack. */
  mixed: boolean;
  /** false: the box's length runs along the shelf width; true: rotated 90°. */
  rotated: boolean;
  /** Slot size including tolerance (and lid); h = total stack height. */
  w: number;
  d: number;
  h: number;
  /** Space between rows front to back (gap + tolerance). */
  rowGap: number;
  /** Nominal size along width/depth, for rendering. */
  nomW: number;
  nomD: number;
  stack: number;
  rows: number;
  count: number;
  volume: number;
  /** How far the front row sticks out beyond the board edge (0 if none). */
  overhang: number;
  /** Free depth left in this column's slot. */
  spareDepth: number;
  /** Free height above the stack (before top clearance). */
  spareHeight: number;
  /** The level's stack limit, not its height, stops another box on top. */
  stackLimited: boolean;
}

export interface LevelCandidate {
  /** Stable signature: sorted column keys. */
  sig: string;
  /** Columns in left-to-right order. */
  columns: ColumnOption[];
  count: number;
  volume: number;
  /** Width left after boxes and gaps. */
  spareWidth: number;
  /** Smallest free height/depth among the columns. */
  spareHeight: number;
  spareDepth: number;
  overhang: number;
  /** How far the outer boxes stick out on the left and right (top of shelf). */
  sideOverhang: number;
  boxIds: string[];
}

export interface LevelResult {
  candidates: LevelCandidate[];
  /** Strategy tag (maxVolume, maxCount, fp:…, box:…) → candidate signature. */
  tags: Record<string, string>;
  /** Best layout if boxes were exactly nominal and placed without gaps — for the "measure your boxes" hint. */
  nominalBest: LevelCandidate | null;
}

export interface LevelSpace {
  width: number;
  depth: number;
  /** Clear height available for boxes (Infinity on an open top without limit). */
  height: number;
  frontOverhang: number;
  /** Allowed overhang on the left and right (top of shelf only), mm per side. */
  sideOverhang: number;
  maxStack: number;
  allowBehind: boolean;
  /** Whether top clearance applies (false for an open top). */
  needsClearance: boolean;
}

export function levelSpace(shelf: Shelf, level: Level): LevelSpace {
  return {
    width: levelWidth(shelf, level),
    depth: shelf.clearDepth,
    height: level.clearHeight ?? Infinity,
    frontOverhang: shelf.frontOverhang,
    sideOverhang: level.openTop ? Math.max(0, level.sideOverhang) : 0,
    // No stack limit means "as many as fit" — except on a top without height limit, where
    // nothing would stop the stack; there it only stacks when a number is given.
    maxStack: level.maxStack == null ? (level.clearHeight == null ? 1 : Infinity) : Math.max(1, Math.floor(level.maxStack)),
    allowBehind: level.allowBehind,
    needsClearance: !level.openTop,
  };
}

const EPS = 1e-6;

function stackItem(b: BoxType, s: Settings): StackItem {
  const lid = s.lids && !b.lidded ? Math.max(0, s.lidHeight) : 0;
  return { boxId: b.id, h: b.height + lid + Math.max(0, s.tolerance), nomH: b.height, lid, capacityL: b.capacityL ?? 0 };
}

interface Slot {
  rotated: boolean;
  nomW: number;
  nomD: number;
  w: number;
  d: number;
  rowGap: number;
  rows: number;
  used: number;
  maxDepth: number;
}

/** Where a footprint fits across the width and how many rows fit front to back, per orientation. */
function footprintSlots(length: number, width: number, space: LevelSpace, s: Settings): Slot[] {
  const tol = Math.max(0, s.tolerance);
  const support = Math.min(1, Math.max(0, s.minSupport));
  const orientations: [number, number, boolean][] = [[length, width, false]];
  if (length !== width) orientations.push([width, length, true]);
  const out: Slot[] = [];
  for (const [nomW, nomD, rotated] of orientations) {
    const w = Math.ceil(nomW + tol);
    if (w > space.width + EPS) continue;
    // In depth the tolerance only matters between rows: a slightly deeper box just sits a few mm further forward.
    const d = nomD;
    const rowGap = Math.max(0, s.gap) + tol;
    // The front box may stick out as far as allowed, while keeping minSupport of its depth on the board.
    const reach = Math.min(Math.max(0, space.frontOverhang), nomD * (1 - support));
    const maxDepth = space.depth + reach;
    let rows = Math.floor((maxDepth + rowGap + EPS) / (d + rowGap));
    if (!space.allowBehind) rows = Math.min(rows, 1);
    if (rows < 1) continue;
    out.push({ rotated, nomW, nomD, w, d, rowGap, rows, used: rows * d + (rows - 1) * rowGap, maxDepth });
  }
  return out;
}

function makeColumn(key: string, items: StackItem[], slot: Slot, space: LevelSpace, usableH: number, stackLimited: boolean): ColumnOption {
  const stackH = items.reduce((sum, it) => sum + it.h, 0);
  const cap = items.reduce((sum, it) => sum + it.capacityL, 0);
  return {
    key: `${key}|${slot.rotated ? 'r' : 'n'}`,
    boxId: items[0].boxId,
    items,
    mixed: new Set(items.map((it) => it.boxId)).size > 1,
    rotated: slot.rotated,
    w: slot.w,
    d: slot.d,
    h: stackH,
    rowGap: slot.rowGap,
    nomW: slot.nomW,
    nomD: slot.nomD,
    stack: items.length,
    rows: slot.rows,
    count: slot.rows * items.length,
    volume: slot.rows * cap,
    overhang: Math.max(0, slot.used - space.depth),
    spareDepth: slot.maxDepth - slot.used,
    spareHeight: usableH - stackH,
    stackLimited,
  };
}

/**
 * Best stack of boxes with the same footprint but different heights: most capacity within the
 * height, at most `maxStack` boxes. Taller boxes end up at the bottom. Null if no mix beats
 * the best single-height stack.
 */
export function bestMixedStack(items: StackItem[], height: number, maxStack: number): StackItem[] | null {
  if (items.length < 2 || !Number.isFinite(height)) return null;
  const H = Math.floor(height + EPS);
  const hs = items.map((it) => Math.ceil(it.h - EPS));
  const minH = Math.min(...hs);
  if (minH <= 0 || minH > H) return null;
  const K = Math.min(Number.isFinite(maxStack) ? maxStack : Infinity, Math.floor(H / minH));
  const vals = items.map((it) => Math.round(it.capacityL * 10));
  // best[c] after k layers: most capacity with at most k boxes and total height ≤ c.
  let best = new Float64Array(H + 1);
  const choice: Int16Array[] = [];
  for (let k = 1; k <= K; k++) {
    const next = Float64Array.from(best);
    const pick = new Int16Array(H + 1).fill(-1);
    for (let c = 0; c <= H; c++) {
      for (let i = 0; i < items.length; i++) {
        if (hs[i] <= c && best[c - hs[i]] + vals[i] > next[c]) {
          next[c] = best[c - hs[i]] + vals[i];
          pick[c] = i;
        }
      }
    }
    choice.push(pick);
    best = next;
  }
  // Reconstruct from the top layer down.
  const stack: StackItem[] = [];
  let c = H;
  for (let k = K - 1; k >= 0; k--) {
    const i = choice[k][c];
    if (i < 0) continue;
    stack.push(items[i]);
    c -= hs[i];
  }
  if (new Set(stack.map((it) => it.boxId)).size < 2) return null;
  const total = stack.reduce((sum, it) => sum + it.capacityL, 0);
  const bestUniform = Math.max(...items.map((it, i) => Math.min(maxStack, Math.floor(H / hs[i])) * it.capacityL));
  if (total <= bestUniform + 0.05) return null;
  return stack.sort((a, b) => b.nomH - a.nomH);
}

/** Build every feasible column (box type × orientation, plus mixed stacks) for a level. */
export function columnOptions(space: LevelSpace, boxes: BoxType[], s: Settings): ColumnOption[] {
  const out: ColumnOption[] = [];
  const usableH = space.height - (space.needsClearance ? Math.max(0, s.topClearance) : 0);

  for (const b of boxes) {
    const item = stackItem(b, s);
    const heightFits = Math.floor((usableH + EPS) / item.h);
    const stack = Math.min(space.maxStack, heightFits);
    if (stack < 1) continue;
    const items = Array.from({ length: stack }, () => item);
    for (const slot of footprintSlots(b.length, b.width, space, s)) {
      out.push(makeColumn(b.id, items, slot, space, usableH, Number.isFinite(heightFits) && heightFits > stack));
    }
  }

  // Mixed stacks: same family and footprint, different heights.
  const groups = new Map<string, BoxType[]>();
  for (const b of boxes) {
    const k = `${b.family}:${b.length}x${b.width}`;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  for (const group of groups.values()) {
    const mix = bestMixedStack(group.map((b) => stackItem(b, s)), usableH, space.maxStack);
    if (!mix) continue;
    const key = `mix:${mix.map((it) => it.boxId).join('+')}`;
    for (const slot of footprintSlots(group[0].length, group[0].width, space, s)) {
      out.push(makeColumn(key, mix, slot, space, usableH, false));
    }
  }
  return out;
}

type Metric = 'volume' | 'count';

function score(c: ColumnOption, metric: Metric): number {
  const vol = Math.round(c.volume * 10);
  return metric === 'volume' ? vol * 1000 + c.count : c.count * 1e7 + vol;
}

/**
 * Unbounded knapsack across the shelf width: pick columns (with repetition) whose
 * widths plus gaps fit, maximising the metric. Each column costs w + gap and the
 * capacity is width + gap, so n columns use exactly n·w + (n−1)·gap.
 */
export function fillWidth(options: ColumnOption[], width: number, gap: number, metric: Metric): ColumnOption[] {
  const cap = Math.floor(width + gap + EPS);
  if (cap <= 0 || !options.length) return [];
  const weights = options.map((o) => Math.ceil(o.w + gap));
  const values = options.map((o) => score(o, metric));
  const best = new Float64Array(cap + 1);
  const pick = new Int32Array(cap + 1).fill(-1);
  for (let c = 1; c <= cap; c++) {
    best[c] = best[c - 1];
    pick[c] = -1;
    for (let i = 0; i < options.length; i++) {
      const wi = weights[i];
      if (wi <= c && best[c - wi] + values[i] > best[c]) {
        best[c] = best[c - wi] + values[i];
        pick[c] = i;
      }
    }
  }
  const chosen: ColumnOption[] = [];
  let c = cap;
  while (c > 0) {
    const i = pick[c];
    if (i < 0) { c--; continue; }
    chosen.push(options[i]);
    c -= weights[i];
  }
  return chosen;
}

/** Fill the width with as many copies of one column as fit. */
function uniform(o: ColumnOption, width: number, gap: number): ColumnOption[] {
  const n = Math.floor((width + gap + EPS) / (o.w + gap));
  return Array.from({ length: Math.max(0, n) }, () => o);
}

export function makeCandidate(columns: ColumnOption[], width: number, gap: number): LevelCandidate {
  // Group identical columns, widest first, so the layout looks tidy.
  const sorted = [...columns].sort((a, b) => b.w - a.w || b.h - a.h || a.key.localeCompare(b.key));
  const used = sorted.reduce((s, c) => s + c.w, 0) + Math.max(0, sorted.length - 1) * gap;
  return {
    sig: sorted.map((c) => c.key).sort().join(','),
    columns: sorted,
    count: sorted.reduce((s, c) => s + c.count, 0),
    volume: sorted.reduce((s, c) => s + c.volume, 0),
    spareWidth: width - used,
    spareHeight: sorted.length ? Math.min(...sorted.map((c) => c.spareHeight)) : 0,
    spareDepth: sorted.length ? Math.min(...sorted.map((c) => c.spareDepth)) : 0,
    overhang: sorted.length ? Math.max(...sorted.map((c) => c.overhang)) : 0,
    sideOverhang: 0,
    boxIds: [...new Set(sorted.flatMap((c) => c.items.map((it) => it.boxId)))],
  };
}

export function solveLevel(space: LevelSpace, boxes: BoxType[], s: Settings): LevelResult {
  const gap = Math.max(0, s.gap);
  // Side overhang (top of shelf): the outer boxes may stick out, keeping minSupport of their width
  // on the shelf — checked against the narrowest column, so every layout is safe.
  const wide = columnOptions({ ...space, width: space.width + 2 * space.sideOverhang }, boxes, s);
  const support = Math.min(1, Math.max(0, s.minSupport));
  const reach = space.sideOverhang > 0 && wide.length
    ? Math.min(space.sideOverhang, Math.min(...wide.map((o) => o.nomW)) * (1 - support))
    : 0;
  const W = space.width + 2 * reach;
  const options = wide.filter((o) => o.w <= W + EPS);
  const bySig = new Map<string, LevelCandidate>();
  const tags: Record<string, string> = {};

  const add = (cols: ColumnOption[], tag?: string) => {
    if (!cols.length) return;
    const cand = makeCandidate(cols, W, gap);
    cand.sideOverhang = Math.max(0, (W - cand.spareWidth - space.width) / 2);
    if (!bySig.has(cand.sig)) bySig.set(cand.sig, cand);
    if (tag && !(tag in tags)) tags[tag] = cand.sig;
  };

  add(fillWidth(options, W, gap, 'volume'), 'maxVolume');
  add(fillWidth(options.filter((o) => !o.mixed), W, gap, 'count'), 'maxCount');

  const boxFp = new Map(boxes.map((b) => [b.id, footprintKey(b)]));
  const groups = new Map<string, ColumnOption[]>();
  const perBox = new Map<string, ColumnOption[]>();
  for (const o of options) {
    const fp = `fp:${boxFp.get(o.boxId)}`;
    groups.set(fp, [...(groups.get(fp) ?? []), o]);
    if (!o.mixed) perBox.set(`box:${o.boxId}`, [...(perBox.get(`box:${o.boxId}`) ?? []), o]);
  }
  for (const [tag, opts] of groups) add(fillWidth(opts, W, gap, 'volume'), tag);
  for (const [tag, opts] of perBox) add(fillWidth(opts, W, gap, 'volume'), tag);

  // Neat layouts: one column type across the whole width, optionally with the rest filled in.
  for (const o of options) {
    const u = uniform(o, W, gap);
    add(u);
    const rest = W - (u.length * (o.w + gap));
    if (u.length && rest > 0) add([...u, ...fillWidth(options, rest, gap, 'volume')]);
  }

  const candidates = [...bySig.values()].sort((a, b) => b.volume - a.volume || b.count - a.count);

  const exact = { ...s, tolerance: 0, gap: 0 };
  const nominalCols = fillWidth(columnOptions(space, boxes, exact), W, 0, 'volume');
  const nominalBest = nominalCols.length ? makeCandidate(nominalCols, W, 0) : null;

  return { candidates, tags, nominalBest };
}
