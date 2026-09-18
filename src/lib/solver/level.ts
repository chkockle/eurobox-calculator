import { footprintKey } from '../model/catalog';
import type { BoxType, Level, Settings, Shelf } from '../model/types';

/**
 * One "column" of a level: a strip across the shelf width filled with a single box
 * type in one orientation — `rows` deep (front to back) and `stack` high.
 */
export interface ColumnOption {
  key: string;
  boxId: string;
  /** false: the box's length runs along the shelf width; true: rotated 90°. */
  rotated: boolean;
  /** Slot size including tolerance and lid (what the solver reserves). */
  w: number;
  d: number;
  h: number;
  /** Space between rows front to back (gap + tolerance). */
  rowGap: number;
  /** Nominal size along width/depth/height, for rendering (height without lid). */
  nomW: number;
  nomD: number;
  nomH: number;
  lid: number;
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
  maxStack: number;
  allowBehind: boolean;
  /** Whether top clearance applies (false for an open top). */
  needsClearance: boolean;
}

export function levelSpace(shelf: Shelf, level: Level): LevelSpace {
  return {
    width: shelf.clearWidth,
    depth: shelf.clearDepth,
    height: level.clearHeight ?? Infinity,
    frontOverhang: shelf.frontOverhang,
    // No stack limit means "as many as fit" — except on a top without height limit, where
    // nothing would stop the stack; there it only stacks when a number is given.
    maxStack: level.maxStack == null ? (level.clearHeight == null ? 1 : Infinity) : Math.max(1, Math.floor(level.maxStack)),
    allowBehind: level.allowBehind,
    needsClearance: !level.openTop,
  };
}

const EPS = 1e-6;

/** Build every feasible column (box type × orientation) for a level. */
export function columnOptions(space: LevelSpace, boxes: BoxType[], s: Settings): ColumnOption[] {
  const out: ColumnOption[] = [];
  const tol = Math.max(0, s.tolerance);
  const gap = Math.max(0, s.gap);
  const usableH = space.height - (space.needsClearance ? Math.max(0, s.topClearance) : 0);
  const support = Math.min(1, Math.max(0, s.minSupport));

  for (const b of boxes) {
    const lid = s.lids && !b.lidded ? Math.max(0, s.lidHeight) : 0;
    const h = b.height + lid + tol;
    const heightFits = Math.floor((usableH + EPS) / h);
    const stack = Math.min(space.maxStack, heightFits);
    if (stack < 1) continue;

    const orientations: [number, number, boolean][] = [[b.length, b.width, false]];
    if (b.length !== b.width) orientations.push([b.width, b.length, true]);

    for (const [nomW, nomD, rotated] of orientations) {
      const w = Math.ceil(nomW + tol);
      // In depth the tolerance only matters between rows: a slightly deeper box just sits a few mm further forward.
      const d = nomD;
      const rowGap = gap + tol;
      if (w > space.width + EPS) continue;
      // The front box may stick out as far as allowed, while keeping minSupport of its depth on the board.
      const reach = Math.min(Math.max(0, space.frontOverhang), nomD * (1 - support));
      const maxDepth = space.depth + reach;
      let rows = Math.floor((maxDepth + rowGap + EPS) / (d + rowGap));
      if (!space.allowBehind) rows = Math.min(rows, 1);
      if (rows < 1) continue;
      const used = rows * d + (rows - 1) * rowGap;
      const count = rows * stack;
      out.push({
        key: `${b.id}|${rotated ? 'r' : 'n'}`,
        boxId: b.id,
        rotated,
        w, d, h, rowGap,
        nomW, nomD, nomH: b.height, lid,
        stack, rows, count,
        volume: count * (b.capacityL ?? 0),
        overhang: Math.max(0, used - space.depth),
        spareDepth: maxDepth - used,
        spareHeight: usableH - stack * h,
        stackLimited: Number.isFinite(heightFits) && heightFits > stack,
      });
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
    boxIds: [...new Set(sorted.map((c) => c.boxId))],
  };
}

export function solveLevel(space: LevelSpace, boxes: BoxType[], s: Settings): LevelResult {
  const gap = Math.max(0, s.gap);
  const W = space.width;
  const options = columnOptions(space, boxes, s);
  const bySig = new Map<string, LevelCandidate>();
  const tags: Record<string, string> = {};

  const add = (cols: ColumnOption[], tag?: string) => {
    if (!cols.length) return;
    const cand = makeCandidate(cols, W, gap);
    if (!bySig.has(cand.sig)) bySig.set(cand.sig, cand);
    if (tag && !(tag in tags)) tags[tag] = cand.sig;
  };

  add(fillWidth(options, W, gap, 'volume'), 'maxVolume');
  add(fillWidth(options, W, gap, 'count'), 'maxCount');

  const boxFp = new Map(boxes.map((b) => [b.id, footprintKey(b)]));
  const groups = new Map<string, ColumnOption[]>();
  const perBox = new Map<string, ColumnOption[]>();
  for (const o of options) {
    const fp = `fp:${boxFp.get(o.boxId)}`;
    groups.set(fp, [...(groups.get(fp) ?? []), o]);
    perBox.set(`box:${o.boxId}`, [...(perBox.get(`box:${o.boxId}`) ?? []), o]);
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
