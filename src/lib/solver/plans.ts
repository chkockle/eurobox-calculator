import type { BoxType, Level, Project, Settings, Shelf } from '../model/types';

export type Objective = 'volume' | 'count' | 'fewestTypes' | 'value';
import { levelSpace, solveLevel, type LevelCandidate, type LevelResult } from './level';

export interface LevelPlan {
  levelId: string;
  levelIndex: number;
  candidate: LevelCandidate | null;
  /** Estimated load of one board (one bay), null when kg/L is not set. */
  loadKg: number | null;
  overload: boolean;
}

export interface BoxCount {
  boxId: string;
  count: number;
  price: number | null;
}

export interface Plan {
  key: string;
  levels: LevelPlan[];
  /** Totals across all bays. */
  count: number;
  volume: number;
  boxes: BoxCount[];
  types: number;
  cost: number | null;
  /** True when every box used has a price. */
  costComplete: boolean;
  costPerLitre: number | null;
  totalLoadKg: number | null;
  overloadTotal: boolean;
  overhang: boolean;
  /** Smallest spare (width/height/depth) of any level, for the "tight fit" hint. */
  minSpare: number;
}

export interface ShelfSolution {
  levels: (LevelResult | null)[];
  plans: Plan[];
}

/** Below this much spare room (beyond the tolerance), a fit is flagged as tight. */
export const TIGHT_MM = 10;

function cacheKey(space: ReturnType<typeof levelSpace>): string {
  return JSON.stringify(space);
}

export function solveShelf(shelf: Shelf, boxes: BoxType[], project: Pick<Project, 'prices' | 'settings'>): ShelfSolution {
  const cache = new Map<string, LevelResult>();
  const levels = shelf.levels.map((l) => {
    if (!l.enabled) return null;
    const space = levelSpace(shelf, l);
    const allowed = levelBoxes(l, shelfBoxes(shelf, boxes));
    const k = cacheKey(space) + allowed.map((b) => b.id).join(',');
    if (!cache.has(k)) cache.set(k, solveLevel(space, allowed, project.settings));
    return cache.get(k)!;
  });

  // Strategies: most volume, most boxes, one box size throughout (per box type) and best price.
  const strategies = ['maxVolume', 'maxCount', ...boxes.map((b) => `box:${b.id}`)];
  if (boxes.some((b) => project.prices[b.id] != null)) strategies.push('value');

  const plans: Plan[] = [];
  for (const key of strategies) {
    // A level with its own box list keeps its best fill in every plan, instead of going empty
    // when the plan's single box type is not allowed there.
    const picks = levels.map((r, i) =>
      r ? pickFor(key, r, project.prices) ?? (shelf.levels[i].boxIds || shelf.boxIds ? pickFor('maxVolume', r, project.prices) : null) : null,
    );
    if (picks.every((c) => !c)) continue;
    const plan = buildPlan(key, shelf, picks, project.prices, project.settings);
    // A single-size plan only counts if that size is actually used somewhere.
    if (key.startsWith('box:') && !plan.boxes.some((b) => b.boxId === key.slice(4))) continue;
    plans.push(plan);
  }
  return { levels, plans };
}

/** Boxes allowed on a shelf: its own list if set, otherwise every selected box. */
export function shelfBoxes(shelf: Shelf, boxes: BoxType[]): BoxType[] {
  if (!shelf.boxIds) return boxes;
  const allowed = new Set(shelf.boxIds);
  return boxes.filter((b) => allowed.has(b.id));
}

/** Boxes allowed on a level: its own list if set, otherwise every selected box. */
export function levelBoxes(level: Level, boxes: BoxType[]): BoxType[] {
  if (!level.boxIds) return boxes;
  const allowed = new Set(level.boxIds);
  return boxes.filter((b) => allowed.has(b.id));
}

function candidateCostPerLitre(c: LevelCandidate, prices: Record<string, number>): number | null {
  let cost = 0;
  for (const col of c.columns) {
    const p = prices[col.boxId];
    if (p == null) return null;
    cost += p * col.count;
  }
  return c.volume > 0 ? cost / c.volume : null;
}

function pickFor(key: string, r: LevelResult, prices: Record<string, number>): LevelCandidate | null {
  if (key === 'value') {
    let best: LevelCandidate | null = null;
    let bestCpl = Infinity;
    for (const c of r.candidates) {
      const cpl = candidateCostPerLitre(c, prices);
      if (cpl != null && cpl < bestCpl - 1e-9) { best = c; bestCpl = cpl; }
    }
    return best;
  }
  const sig = r.tags[key];
  return sig ? r.candidates.find((c) => c.sig === sig) ?? null : null;
}

export function buildPlan(
  key: string,
  shelf: Shelf,
  picks: (LevelCandidate | null)[],
  prices: Record<string, number>,
  settings: Settings,
): Plan {
  const bays = Math.max(1, shelf.bays);
  const counts = new Map<string, number>();
  let volume = 0;
  let overhang = false;
  let minSpare = Infinity;

  const levels: LevelPlan[] = shelf.levels.map((l, i) => {
    const c = picks[i] ?? null;
    let loadKg: number | null = null;
    if (c) {
      volume += c.volume * bays;
      for (const col of c.columns) counts.set(col.boxId, (counts.get(col.boxId) ?? 0) + col.count * bays);
      if (c.overhang > 0) overhang = true;
      minSpare = Math.min(minSpare, c.spareWidth, c.spareHeight, c.spareDepth);
      if (settings.kgPerLitre != null) loadKg = c.volume * settings.kgPerLitre;
    }
    return {
      levelId: l.id,
      levelIndex: i,
      candidate: c,
      loadKg,
      overload: loadKg != null && l.maxLoadKg != null && loadKg > l.maxLoadKg,
    };
  });

  const boxes: BoxCount[] = [...counts].map(([boxId, count]) => ({ boxId, count, price: prices[boxId] ?? null }))
    .sort((a, b) => b.count - a.count || a.boxId.localeCompare(b.boxId));
  const count = boxes.reduce((s, b) => s + b.count, 0);
  const priced = boxes.filter((b) => b.price != null);
  const cost = priced.length ? priced.reduce((s, b) => s + b.count * b.price!, 0) : null;
  const costComplete = boxes.length > 0 && priced.length === boxes.length;
  const totalLoadKg = settings.kgPerLitre != null ? volume * settings.kgPerLitre : null;

  return {
    key,
    levels,
    count,
    volume,
    boxes,
    types: boxes.length,
    cost,
    costComplete,
    costPerLitre: costComplete && volume > 0 ? cost! / volume : null,
    totalLoadKg,
    overloadTotal: totalLoadKg != null && shelf.maxTotalLoadKg != null && totalLoadKg > shelf.maxTotalLoadKg,
    overhang,
    minSpare: minSpare === Infinity ? 0 : minSpare,
  };
}

/** The plan a selection refers to; falls back to "most volume". */
export function basePlan(solution: ShelfSolution, key: string | null): Plan | null {
  const usable = solution.plans.filter((p) => p.count > 0);
  return usable.find((p) => p.key === key) ?? usable.find((p) => p.key === 'maxVolume') ?? usable[0] ?? null;
}

/** The handful of clearly different suggestions shown to the user. */
export interface Suggestions {
  maxVolume: Plan | null;
  maxCount: Plan | null;
  /** One plan per box size, most volume first. */
  singleSize: Plan[];
  /** Lowest price per litre among fully priced plans. */
  value: Plan | null;
}

export function suggestions(solution: ShelfSolution): Suggestions {
  const usable = solution.plans.filter((p) => p.count > 0);
  const byValue = rankPlans(usable, 'value');
  return {
    maxVolume: usable.find((p) => p.key === 'maxVolume') ?? null,
    maxCount: usable.find((p) => p.key === 'maxCount') ?? null,
    singleSize: rankPlans(usable.filter((p) => p.key.startsWith('box:')), 'volume'),
    value: byValue[0]?.costPerLitre != null ? byValue[0] : null,
  };
}

export function rankPlans(plans: Plan[], objective: Objective): Plan[] {
  const byVolume = (a: Plan, b: Plan) => b.volume - a.volume || b.count - a.count || a.types - b.types;
  const cmp: Record<Objective, (a: Plan, b: Plan) => number> = {
    volume: byVolume,
    count: (a, b) => b.count - a.count || byVolume(a, b),
    fewestTypes: (a, b) => a.types - b.types || byVolume(a, b),
    value: (a, b) => {
      const ca = a.costPerLitre ?? Infinity;
      const cb = b.costPerLitre ?? Infinity;
      return ca - cb || byVolume(a, b);
    },
  };
  return plans.filter((p) => p.count > 0).sort(cmp[objective]);
}

/**
 * The plan the user is looking at: the chosen (or top-ranked) plan with any manual
 * per-level choices applied. Overrides pointing at candidates that no longer exist are ignored.
 */
export function effectivePlan(
  shelf: Shelf,
  solution: ShelfSolution,
  selection: { plan: string | null; overrides: Record<string, string> } | undefined,
  prices: Record<string, number>,
  settings: Settings,
): Plan | null {
  const base = basePlan(solution, selection?.plan ?? null);
  if (!base) return null;
  const overrides = selection?.overrides ?? {};
  if (!Object.keys(overrides).length) return base;
  const picks = shelf.levels.map((l, i) => {
    const sig = overrides[l.id];
    if (sig === '') return null; // explicitly left empty
    const found = sig ? solution.levels[i]?.candidates.find((c) => c.sig === sig) : undefined;
    return found ?? base.levels[i]?.candidate ?? null;
  });
  return buildPlan(base.key, shelf, picks, prices, settings);
}
