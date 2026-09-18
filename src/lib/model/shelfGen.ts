import type { Level, Shelf } from './types';

export const uid = (): string => Math.random().toString(36).slice(2, 10);

/** Nominal/outer measurements of a shelf, as printed on the product page. */
export interface QuickShelfInput {
  name: string;
  outerHeight: number;
  outerWidth: number;
  outerDepth: number;
  /** Number of boards, including the top board. */
  boards: number;
  bays: number;
  boardThickness: number;
  uprightSize: number;
  /** Height of the lowest board's top surface above the floor. */
  bottomOffset: number;
  /** Use the space on top of the highest board. */
  useTop: boolean;
  /** Usable height on top; null = no limit. */
  topSpace: number | null;
}

export interface ShelfPreset {
  id: string;
  /** Shown as-is; product names are not translated. */
  label: string;
  source?: string;
  input: QuickShelfInput;
}

export const PRESETS: ShelfPreset[] = [
  {
    id: 'obi-xl-180-160-60',
    label: 'OBI Metall-Schwerlast-Steckregal XL 180 × 160 × 60 cm (4 Böden)',
    source: 'https://www.obi.de/p/3277613/obi-metall-schwerlast-steckregal-xl-verzinkt-180-cm-x-160-cm-x-60-cm',
    input: {
      name: 'OBI XL 180×160×60',
      outerHeight: 1800, outerWidth: 1600, outerDepth: 600,
      boards: 4, bays: 1, boardThickness: 30, uprightSize: 40, bottomOffset: 80,
      useTop: false, topSpace: null,
    },
  },
  {
    id: 'generic-180-90-40',
    label: 'Steckregal 180 × 90 × 40 cm (5)',
    input: {
      name: 'Steckregal 180×90×40',
      outerHeight: 1800, outerWidth: 900, outerDepth: 400,
      boards: 5, bays: 1, boardThickness: 30, uprightSize: 35, bottomOffset: 80,
      useTop: false, topSpace: null,
    },
  },
  {
    id: 'generic-180-120-50',
    label: 'Steckregal 180 × 120 × 50 cm (5)',
    input: {
      name: 'Steckregal 180×120×50',
      outerHeight: 1800, outerWidth: 1200, outerDepth: 500,
      boards: 5, bays: 1, boardThickness: 30, uprightSize: 35, bottomOffset: 80,
      useTop: false, topSpace: null,
    },
  },
  {
    id: 'generic-200-100-60',
    label: 'Steckregal 200 × 100 × 60 cm (5)',
    input: {
      name: 'Steckregal 200×100×60',
      outerHeight: 2000, outerWidth: 1000, outerDepth: 600,
      boards: 5, bays: 1, boardThickness: 30, uprightSize: 40, bottomOffset: 80,
      useTop: false, topSpace: null,
    },
  },
];

export function makeLevel(clearHeight: number | null, openTop = false): Level {
  return {
    id: uid(),
    clearHeight,
    openTop,
    enabled: true,
    maxStack: null,
    allowBehind: false,
    maxLoadKg: null,
    boxIds: null,
  };
}

/** Derive clear dimensions and evenly spaced levels from outer measurements. */
export function shelfFromQuick(q: QuickShelfInput): Shelf {
  const boards = Math.max(1, Math.round(q.boards));
  const bays = Math.max(1, Math.round(q.bays));
  const levels: Level[] = [];
  if (boards >= 2) {
    const pitch = (q.outerHeight - q.bottomOffset) / (boards - 1);
    const clear = Math.max(0, Math.round(pitch - q.boardThickness));
    for (let i = 0; i < boards - 1; i++) levels.push(makeLevel(clear));
  }
  if (q.useTop || boards < 2) levels.push(makeLevel(q.topSpace == null ? null : Math.max(0, q.topSpace), true));

  return {
    id: uid(),
    name: q.name,
    bays,
    clearWidth: Math.max(0, Math.round((q.outerWidth - (bays + 1) * q.uprightSize) / bays)),
    clearDepth: q.outerDepth,
    frontOverhang: 0,
    maxTotalLoadKg: null,
    boardThickness: q.boardThickness,
    uprightSize: q.uprightSize,
    bottomOffset: q.bottomOffset,
    levels,
    boxIds: null,
    joined: false,
  };
}

/** Height of each level's board surface above the floor (for rendering). */
export function levelBaseHeights(shelf: Shelf): number[] {
  const out: number[] = [];
  let y = shelf.bottomOffset;
  for (const l of shelf.levels) {
    out.push(y);
    y += (l.clearHeight ?? 0) + shelf.boardThickness;
  }
  return out;
}

/** Overall height implied by the levels (top of the uprights). */
export function shelfTotalHeight(shelf: Shelf): number {
  const bases = levelBaseHeights(shelf);
  if (!shelf.levels.length) return shelf.bottomOffset;
  const last = shelf.levels.length - 1;
  const top = bases[last] + (shelf.levels[last].clearHeight ?? 0);
  return shelf.levels[last].openTop ? bases[last] : top + shelf.boardThickness;
}
