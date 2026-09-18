import { describe, expect, it } from 'vitest';
import { DATASET_BOXES } from '../model/catalog';
import { DEFAULT_SETTINGS, defaultProject } from '../model/defaults';
import { PRESETS, makeLevel, shelfFromQuick } from '../model/shelfGen';
import type { BoxType, Settings, Shelf } from '../model/types';
import { parseProject, projectFromHash, shareHash } from '../state/persist';
import { parseDecimal } from '../format';
import { bayHeightDifference, mergeRackTops } from '../model/rack';
import { placeBoxes, shelfOffsets, shelfOuterWidth } from './geometry';
import { bestMixedStack, columnOptions, fillWidth, levelSpace, solveLevel, type LevelSpace } from './level';
import { basePlan, effectivePlan, rankPlans, solveShelf, suggestions } from './plans';

const box = (id: string): BoxType => {
  const b = DATASET_BOXES.find((x) => x.id === id);
  if (!b) throw new Error(id);
  return b;
};

const S: Settings = { ...DEFAULT_SETTINGS, tolerance: 0, gap: 0, topClearance: 0, stackOverlap: 0 };

const space = (over: Partial<LevelSpace> = {}): LevelSpace => ({
  width: 1200, depth: 400, height: 400, frontOverhang: 0, sideOverhang: 0, maxStack: 1, allowBehind: false, needsClearance: true, ...over,
});

describe('columnOptions', () => {
  it('only offers orientations that fit the depth', () => {
    const opts = columnOptions(space(), [box('euro-600x400x320')], S);
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ rotated: false, w: 600, d: 400, rows: 1, stack: 1 });
  });

  it('allows the front overhang only while enough of the box rests on the board', () => {
    // 600 deep box on a 450 deep board: needs 150 overhang; 1/3 of 600 = 200 max.
    const base = space({ depth: 450 });
    expect(columnOptions(base, [box('euro-600x400x320')], S).some((o) => o.rotated)).toBe(false);
    const withOverhang = columnOptions({ ...base, frontOverhang: 150 }, [box('euro-600x400x320')], S);
    const rotated = withOverhang.find((o) => o.rotated)!;
    expect(rotated.overhang).toBe(150);
    // A 350 deep board would need 250 overhang, more than a third of the box.
    const tooFar = columnOptions(space({ depth: 350, frontOverhang: 300 }), [box('euro-600x400x320')], S);
    expect(tooFar.some((o) => o.rotated)).toBe(false);
  });

  it('stacks up to the limit and keeps top clearance', () => {
    const b = box('euro-600x400x120');
    const opts = columnOptions(space({ height: 400, maxStack: 5 }), [b], { ...S, topClearance: 30 });
    expect(opts[0].stack).toBe(3); // 3 × 120 = 360 ≤ 370
    expect(opts[0].stackLimited).toBe(false);
    const noStack = columnOptions(space({ height: 400, maxStack: 1 }), [b], S);
    expect(noStack[0].stack).toBe(1);
    expect(noStack[0].stackLimited).toBe(true);
  });

  it('puts rows behind each other only when allowed', () => {
    const b = box('euro-400x300x220');
    const front = columnOptions(space({ depth: 600 }), [b], S).find((o) => !o.rotated)!;
    expect(front.rows).toBe(1);
    const behind = columnOptions(space({ depth: 600, allowBehind: true }), [b], S).find((o) => !o.rotated)!;
    expect(behind.rows).toBe(2); // 2 × 300 deep
  });

  it('applies tolerance, gap and lids', () => {
    const b = box('euro-600x400x320');
    // Tolerance counts across the width, not in depth
    expect(columnOptions(space({ width: 600 }), [b], { ...S, tolerance: 5 })).toHaveLength(0);
    expect(columnOptions(space({ width: 605 }), [b], { ...S, tolerance: 5 })).toHaveLength(1);
    // Lid of 15 + 320 exceeds 330
    expect(columnOptions(space({ height: 330 }), [b], { ...S, lids: true })).toHaveLength(0);
    const lidded: BoxType = { id: 'c1', family: 'custom', length: 600, width: 400, height: 310, capacityL: 55, lidded: true };
    expect(columnOptions(space({ height: 330 }), [lidded], { ...S, lids: true })).toHaveLength(1);
  });

  it('fills an open top without height limit with the tallest box, stacked up to the limit', () => {
    const boxes = [box('euro-600x400x120'), box('euro-600x400x320')];
    const open = space({ height: Infinity, needsClearance: false });
    const single = columnOptions(open, boxes, S);
    expect(single.every((o) => o.stack === 1)).toBe(true);
    const r = solveLevel(open, boxes, S);
    expect(r.candidates[0].columns.every((c) => c.boxId === 'euro-600x400x320')).toBe(true);
    const stacked = columnOptions({ ...open, maxStack: 3 }, boxes, S);
    expect(stacked.every((o) => o.stack === 3)).toBe(true);
  });
});

describe('levelSpace stacking', () => {
  const shelf = shelfFromQuick(PRESETS[0].input);
  it('stacks as many as fit when no limit is set, and respects a set maximum', () => {
    const b = [box('euro-400x300x150')];
    const s = { ...DEFAULT_SETTINGS, stackOverlap: 0 }; // 5 mm tolerance, 30 mm top clearance
    const level = { ...makeLevel(520), maxStack: null };
    expect(columnOptions(levelSpace(shelf, level), b, s)[0].stack).toBe(3); // 3 × 155 ≤ 490
    expect(columnOptions(levelSpace(shelf, { ...level, maxStack: 2 }), b, s)[0].stack).toBe(2);
    expect(columnOptions(levelSpace(shelf, { ...level, maxStack: 3 }), b, s)[0].stack).toBe(3);
  });

  it('does not stack endlessly on a top without height limit', () => {
    const b = [box('euro-400x300x150')];
    const top = makeLevel(null, true);
    expect(columnOptions(levelSpace(shelf, top), b, DEFAULT_SETTINGS)[0].stack).toBe(1);
    expect(columnOptions(levelSpace(shelf, { ...top, maxStack: 4 }), b, DEFAULT_SETTINGS)[0].stack).toBe(4);
  });
});

describe('stacking overlap', () => {
  it('lets boxes sink into the rim below, so more fit on top of each other', () => {
    const b = [box('euro-600x400x120')];
    // 350 mm: without overlap 2 × 120; with 15 mm each extra box adds 105 → 120 + 105 + 105 = 330
    expect(columnOptions(space({ height: 350, maxStack: 9 }), b, S)[0].stack).toBe(2);
    const withOverlap = columnOptions(space({ height: 350, maxStack: 9 }), b, { ...S, stackOverlap: 15 })[0];
    expect(withOverlap.stack).toBe(3);
    expect(withOverlap.h).toBe(330);
    // Lids sit between the boxes: no interlock.
    expect(columnOptions(space({ height: 400, maxStack: 9 }), b, { ...S, stackOverlap: 15, lids: true, lidHeight: 15 })[0].stack).toBe(2);
  });

  it('places stacked boxes overlapping in 3D', () => {
    const shelf = { ...shelfFromQuick(PRESETS[0].input), levels: [{ ...makeLevel(350), maxStack: null }] };
    const settings = { ...S, stackOverlap: 15 };
    const sol = solveShelf(shelf, [box('euro-600x400x120')], { prices: {}, settings });
    const placed = placeBoxes(shelf, basePlan(sol, 'maxVolume')!, settings);
    const ys = [...new Set(placed.map((p) => p.y))].sort((a, b) => a - b);
    expect(ys.map((y) => y - shelf.bottomOffset)).toEqual([0, 105, 210]);
  });
});

describe('mixed stacks', () => {
  it('combines heights of one footprint when that fills the height better', () => {
    // 400 mm usable: 2 × 170 = 340 (60.6 L), 220 + 170 = 390 (70.3 L), 1 × 320 (59.6 L)
    const boxes = [box('euro-600x400x170'), box('euro-600x400x220'), box('euro-600x400x320')];
    const opts = columnOptions(space({ height: 400, maxStack: 5 }), boxes, S);
    const mixed = opts.filter((o) => o.mixed);
    expect(mixed.length).toBeGreaterThan(0);
    expect(mixed[0].items.map((it) => it.nomH)).toEqual([220, 170]); // taller at the bottom
    const best = solveLevel(space({ height: 400, maxStack: 5 }), boxes, S).candidates[0];
    expect(best.columns.every((c) => c.mixed)).toBe(true);
    expect(best.boxIds.sort()).toEqual(['euro-600x400x170', 'euro-600x400x220']);
  });

  it('does not mix when a single height is as good, or when stacking is off', () => {
    const items = [box('euro-600x400x200'), box('euro-600x400x400')].map((b) => ({ boxId: b.id, h: b.height, nomH: b.height, lid: 0, capacityL: b.capacityL! }));
    expect(bestMixedStack(items, 400, 5)).toBeNull(); // 2 × 200 or 1 × 400 fill it exactly
    const opts = columnOptions(space({ height: 400, maxStack: 1 }), [box('euro-600x400x170'), box('euro-600x400x220')], S);
    expect(opts.some((o) => o.mixed)).toBe(false);
  });

  it('counts every box of a mixed stack in the plan and places them on top of each other', () => {
    const shelf = { ...shelfFromQuick(PRESETS[0].input), levels: [{ ...makeLevel(430), maxStack: null }] };
    const boxes = [box('euro-600x400x170'), box('euro-600x400x220')];
    const sol = solveShelf(shelf, boxes, { prices: {}, settings: S });
    const plan = basePlan(sol, 'maxVolume')!;
    const col = plan.levels[0].candidate!.columns[0];
    expect(col.mixed).toBe(true);
    expect(plan.count).toBe(plan.levels[0].candidate!.columns.reduce((n, c) => n + c.rows * c.items.length, 0));
    expect(plan.boxes.map((b) => b.boxId).sort()).toEqual(['euro-600x400x170', 'euro-600x400x220']);
    const placed = placeBoxes(shelf, plan, S).filter((p) => p.x === placeBoxes(shelf, plan, S)[0].x);
    expect(placed.map((p) => p.y)).toEqual([shelf.bottomOffset, shelf.bottomOffset + 220]);
  });
});

describe('fillWidth', () => {
  it('uses the gap only between boxes', () => {
    const [o] = columnOptions(space({ width: 1220 }), [box('euro-600x400x320')], S);
    expect(fillWidth([o], 1220, 20, 'volume')).toHaveLength(2); // 600 + 20 + 600
    expect(fillWidth([o], 1219, 20, 'volume')).toHaveLength(1);
  });

  it('mixes footprints to use the width', () => {
    const opts = columnOptions(space({ width: 1000, height: 330 }), [box('euro-600x400x320'), box('euro-400x300x320')], S);
    const cols = fillWidth(opts, 1000, 0, 'volume');
    expect(cols.reduce((s, c) => s + c.w, 0)).toBeLessThanOrEqual(1000);
    // 60×40 plus one 40×30 (either way round) beats two 40×30 across
    expect(cols).toHaveLength(2);
    expect(cols.reduce((s, c) => s + c.volume, 0)).toBeCloseTo(59.6 + 27.1);
  });
});

describe('solveLevel', () => {
  it('reports a larger nominal-only result when tolerance and gaps block a box', () => {
    const r = solveLevel(space({ width: 1500, height: 330 }), [box('euro-600x400x320'), box('euro-400x300x320')], { ...S, tolerance: 5, gap: 10 });
    const best = r.candidates[0];
    expect(best.count).toBe(2);
    expect(r.nominalBest!.count).toBe(3); // 600 + 600 + 300 = 1500 exactly
  });
});

describe('solveShelf on the OBI preset', () => {
  const shelf: Shelf = shelfFromQuick(PRESETS[0].input);
  const project = defaultProject();
  const boxes = DATASET_BOXES.filter((b) => project.enabledBoxIds.includes(b.id));

  it('derives clear dimensions from outer measurements', () => {
    expect(shelf.clearWidth).toBe(1600 - 2 * 40);
    expect(shelf.levels).toHaveLength(3);
    expect(shelf.levels[0].clearHeight).toBe(Math.round((1800 - 80) / 3 - 30));
  });

  it('finds plans and ranks them by the objective', () => {
    const sol = solveShelf(shelf, boxes, project);
    const ranked = rankPlans(sol.plans, 'volume');
    expect(ranked.length).toBeGreaterThan(3);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].volume).toBeGreaterThanOrEqual(ranked[i].volume);
    const fewest = rankPlans(sol.plans, 'fewestTypes');
    expect(fewest[0].types).toBe(1);
    // 1520 wide, 600 deep: three 60×40 boxes turned front-to-back (3 × 405 + 2 × 10 = 1235)
    expect(ranked[0].levels.every((l) => (l.candidate?.count ?? 0) >= 3)).toBe(true);
  });

  it('places every box inside its bay and on its level', () => {
    const sol = solveShelf(shelf, boxes, project);
    const plan = rankPlans(sol.plans, 'volume')[0];
    const placed = placeBoxes(shelf, plan, project.settings);
    expect(placed).toHaveLength(plan.count);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(shelf.uprightSize);
      expect(p.x + p.w).toBeLessThanOrEqual(shelf.uprightSize + shelf.clearWidth);
      expect(p.zFront).toBeLessThanOrEqual(0.0001);
      expect(p.zFront - p.d).toBeGreaterThanOrEqual(-shelf.clearDepth);
    }
  });

  it('applies level overrides and ignores stale ones', () => {
    const sol = solveShelf(shelf, boxes, project);
    const ranked = rankPlans(sol.plans, 'volume');
    const lvl = shelf.levels[0];
    const alt = sol.levels[0]!.candidates.at(-1)!;
    const p = effectivePlan(shelf, sol, { plan: null, overrides: { [lvl.id]: alt.sig } }, {}, project.settings)!;
    expect(p.levels[0].candidate?.sig).toBe(alt.sig);
    const stale = effectivePlan(shelf, sol, { plan: null, overrides: { [lvl.id]: 'nope' } }, {}, project.settings)!;
    expect(stale.levels[0].candidate?.sig).toBe(basePlan(sol, null)!.levels[0].candidate?.sig);
    expect(ranked.length).toBeGreaterThan(0);
  });

  it('flags overload only with user-provided limits', () => {
    const s2 = { ...shelf, levels: shelf.levels.map((l) => ({ ...l, maxLoadKg: 10 })) };
    const noKg = solveShelf(s2, boxes, project).plans;
    expect(noKg.some((p) => p.levels.some((l) => l.overload))).toBe(false);
    const withKg = solveShelf(s2, boxes, { ...project, settings: { ...project.settings, kgPerLitre: 0.5 } }).plans;
    expect(withKg.some((p) => p.levels.some((l) => l.overload))).toBe(true);
  });

  it('restricts a level to its own box list and keeps it filled in single-type plans', () => {
    const small = ['euro-400x300x120', 'euro-400x300x220'];
    const s2 = { ...shelf, levels: shelf.levels.map((l, i) => (i === 2 ? { ...l, boxIds: small } : l)) };
    const sol = solveShelf(s2, boxes, project);
    expect(sol.levels[2]!.candidates.every((c) => c.boxIds.every((id) => small.includes(id)))).toBe(true);
    const only60 = sol.plans.find((p) => p.key === 'box:euro-600x400x420')!;
    expect(only60.levels[2].candidate?.boxIds[0]).toMatch(/^euro-400x300/);
  });

  it('combines the shelf box list with level lists', () => {
    const only40 = boxes.filter((b) => b.length === 400).map((b) => b.id);
    const s2 = { ...shelf, boxIds: only40 };
    const sol = solveShelf(s2, boxes, project);
    for (const r of sol.levels) expect(r!.candidates.every((c) => c.boxIds.every((id) => only40.includes(id)))).toBe(true);
    const s3 = { ...s2, levels: s2.levels.map((l, i) => (i === 0 ? { ...l, boxIds: ['euro-600x400x320'] } : l)) };
    expect(solveShelf(s3, boxes, project).levels[0]!.candidates).toHaveLength(0);
  });

  it('offers most volume, most boxes, one plan per box size and a price suggestion', () => {
    const sol = solveShelf(shelf, boxes, { ...project, prices: { 'euro-600x400x320': 10 } });
    const s = suggestions(sol);
    expect(s.maxVolume?.key).toBe('maxVolume');
    expect(s.maxCount!.count).toBeGreaterThanOrEqual(s.maxVolume!.count);
    expect(s.singleSize.length).toBeGreaterThan(3);
    expect(s.singleSize.every((p) => p.types === 1)).toBe(true);
    for (let i = 1; i < s.singleSize.length; i++) expect(s.singleSize[i - 1].volume).toBeGreaterThanOrEqual(s.singleSize[i].volume);
    expect(s.value?.boxes.every((b) => b.boxId === 'euro-600x400x320')).toBe(true);
    // Selecting the price suggestion keeps it, even if it equals a single-size plan.
    expect(s.value?.key).toBe('value');
    expect(basePlan(sol, 'value')?.key).toBe('value');
    expect(basePlan(sol, 'value')?.costPerLitre).toBe(s.value?.costPerLitre);
  });

  it('ranks by price per litre when prices are given', () => {
    const prices = { 'euro-600x400x320': 10, 'euro-400x300x320': 100 };
    const sol = solveShelf(shelf, boxes, { ...project, prices });
    const ranked = rankPlans(sol.plans, 'value');
    expect(ranked[0].costPerLitre).not.toBeNull();
    expect(ranked[0].boxes.every((b) => b.price != null)).toBe(true);
  });
});

describe('top of shelf', () => {
  const twoBays = { ...shelfFromQuick({ ...PRESETS[0].input, bays: 2 }), levels: [makeLevel(400), makeLevel(null, true)] };
  const boxes = [box('euro-600x400x320')];
  const settings = { ...S, gap: 10, tolerance: 5 };

  it('is one surface across all bays, counted once', () => {
    // Outer width 1600: bays are 740 each (two 60×40 lengthwise need 1220 → only one per bay).
    const sol = solveShelf(twoBays, boxes, { prices: {}, settings });
    const plan = basePlan(sol, 'maxVolume')!;
    expect(twoBays.clearWidth).toBe(740);
    expect(plan.levels[0].candidate!.count).toBe(1); // per bay …
    // … but 3 turned (405 wide) across the continuous 1600 mm top: 3 × 405 + 2 × 10 = 1235
    expect(plan.levels[1].candidate!.count).toBe(3);
    expect(plan.count).toBe(2 * 1 + 3);
  });

  it('lets boxes stick out at the sides within the support rule', () => {
    const narrow = { ...twoBays, levels: [{ ...makeLevel(null, true), topWidth: 1150 }] };
    const without = solveLevel(levelSpace(narrow, narrow.levels[0]), boxes, settings).candidates[0];
    const withSide = solveLevel(levelSpace(narrow, { ...narrow.levels[0], sideOverhang: 50 }), boxes, settings).candidates[0];
    expect(without.volume).toBeLessThan(withSide.volume);
    expect(withSide.sideOverhang).toBeGreaterThan(0);
    expect(withSide.sideOverhang).toBeLessThanOrEqual(50);
  });

  it('places top boxes centred over the whole shelf', () => {
    const sol = solveShelf(twoBays, boxes, { prices: {}, settings });
    const plan = basePlan(sol, 'maxVolume')!;
    const top = placeBoxes(twoBays, plan, settings).filter((p) => p.levelIndex === 1);
    const left = Math.min(...top.map((p) => p.x));
    const right = Math.max(...top.map((p) => p.x + p.w));
    expect(Math.abs(left - (shelfOuterWidth(twoBays) - right))).toBeLessThan(10);
  });
});

describe('mergeRackTops', () => {
  const bay = { ...shelfFromQuick({ ...PRESETS[1].input }), levels: [makeLevel(350), makeLevel(null, true)] };
  const name = (_: Shelf, i: number) => `bay ${i + 1}`;

  it('joins the tops of attached bays at the same height into one surface', () => {
    const merged = mergeRackTops([bay, { ...bay, id: 'b2', joined: true }], name);
    expect(merged[0].topSpanWidth).toBe(2 * shelfOuterWidth(bay) - bay.uprightSize);
    expect(merged[1].levels[1]).toMatchObject({ enabled: false, mergedInto: 'bay 1' });
    const sol = solveShelf(merged[0], [box('euro-600x400x320')], { prices: {}, settings: S });
    expect(basePlan(sol, 'maxVolume')!.levels[1].candidate!.spareWidth).toBeGreaterThan(sol.levels[0]!.candidates[0].spareWidth);
  });

  it('never joins separate shelves, nor bays whose tops are at different heights', () => {
    expect(mergeRackTops([bay, { ...bay, id: 'b2', joined: false }], name)[0].topSpanWidth).toBeUndefined();
    const taller = { ...bay, id: 'b3', joined: true, levels: [makeLevel(450), makeLevel(null, true)] };
    const merged = mergeRackTops([bay, taller], name);
    expect(merged[0].topSpanWidth).toBeUndefined();
    expect(merged[1].levels[1].enabled).toBe(true);
    expect(bayHeightDifference([bay, taller], 1)).toBe(100);
    expect(bayHeightDifference([bay, { ...bay, joined: true }], 1)).toBe(0);
  });
});

describe('shelfOffsets', () => {
  it('shares the upright for attached shelves and keeps the gap otherwise', () => {
    const a = shelfFromQuick({ ...PRESETS[1].input }); // 1 bay, 35 mm uprights
    const b = { ...a, joined: true };
    const c = { ...a, joined: false };
    const w = shelfOuterWidth(a);
    expect(shelfOffsets([a, b, c], 20)).toEqual([0, w - 35, 2 * w - 35 + 20]);
  });
});

describe('parseDecimal', () => {
  it('accepts comma and dot as decimal separator', () => {
    expect(parseDecimal('4,3')).toBe(4.3);
    expect(parseDecimal('5.03')).toBe(5.03);
    expect(parseDecimal('1.234,50')).toBe(1234.5);
    expect(parseDecimal(' 9,06 ')).toBe(9.06);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNaN();
  });
});

describe('persistence', () => {
  it('round-trips through a share link, including an unlimited open top', () => {
    const p = defaultProject();
    p.shelves[0].levels.push(makeLevel(null, true));
    const back = projectFromHash(shareHash(p));
    expect(back).toEqual(p);
  });

  it('rejects garbage and sanitises values', () => {
    expect(() => parseProject({ foo: 1 })).toThrow();
    const p = parseProject({ shelves: [{ bays: -3, levels: [{ maxStack: 0 }] }], prices: { a: -1, b: 2 } });
    expect(p.shelves[0].bays).toBe(1);
    expect(p.shelves[0].levels[0].maxStack).toBe(1);
    expect(parseProject({ shelves: [{ levels: [{ maxStack: null }] }] }).shelves[0].levels[0].maxStack).toBeNull();
    expect(p.prices).toEqual({ b: 2 });
  });
});
