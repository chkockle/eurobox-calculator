import { describe, expect, it } from 'vitest';
import { DATASET_BOXES } from '../model/catalog';
import { DEFAULT_SETTINGS, defaultProject } from '../model/defaults';
import { PRESETS, makeLevel, shelfFromQuick } from '../model/shelfGen';
import type { BoxType, Settings, Shelf } from '../model/types';
import { parseProject, projectFromHash, shareHash } from '../state/persist';
import { placeBoxes } from './geometry';
import { columnOptions, fillWidth, solveLevel, type LevelSpace } from './level';
import { effectivePlan, rankPlans, solveShelf } from './plans';

const box = (id: string): BoxType => {
  const b = DATASET_BOXES.find((x) => x.id === id);
  if (!b) throw new Error(id);
  return b;
};

const S: Settings = { ...DEFAULT_SETTINGS, tolerance: 0, gap: 0, topClearance: 0 };

const space = (over: Partial<LevelSpace> = {}): LevelSpace => ({
  width: 1200, depth: 400, height: 400, frontOverhang: 0, maxStack: 1, allowBehind: false, needsClearance: true, ...over,
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
    const noStack = columnOptions(space({ height: 400, maxStack: 1 }), [b], S);
    expect(noStack[0].stack).toBe(1);
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
    expect(columnOptions(space({ height: 330 }), [box('alc-600x400x310')], { ...S, lids: true })).toHaveLength(1);
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
    const p = effectivePlan(shelf, sol, ranked, { plan: null, overrides: { [lvl.id]: alt.sig } }, {}, project.settings)!;
    expect(p.levels[0].candidate?.sig).toBe(alt.sig);
    const stale = effectivePlan(shelf, sol, ranked, { plan: null, overrides: { [lvl.id]: 'nope' } }, {}, project.settings)!;
    expect(stale.levels[0].candidate?.sig).toBe(ranked[0].levels[0].candidate?.sig);
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

  it('ranks by price per litre when prices are given', () => {
    const prices = { 'euro-600x400x320': 10, 'euro-400x300x320': 100 };
    const sol = solveShelf(shelf, boxes, { ...project, prices });
    const ranked = rankPlans(sol.plans, 'value');
    expect(ranked[0].costPerLitre).not.toBeNull();
    expect(ranked[0].boxes.every((b) => b.price != null)).toBe(true);
  });
});

describe('persistence', () => {
  it('round-trips through a share link', () => {
    const p = defaultProject();
    p.shelves[0].levels.push(makeLevel(250, true));
    const back = projectFromHash(shareHash(p));
    expect(back).toEqual(p);
  });

  it('rejects garbage and sanitises values', () => {
    expect(() => parseProject({ foo: 1 })).toThrow();
    const p = parseProject({ shelves: [{ bays: -3, levels: [{ maxStack: 0 }] }], prices: { a: -1, b: 2 } });
    expect(p.shelves[0].bays).toBe(1);
    expect(p.shelves[0].levels[0].maxStack).toBe(1);
    expect(p.prices).toEqual({ b: 2 });
  });
});
