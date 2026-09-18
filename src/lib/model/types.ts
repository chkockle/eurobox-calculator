// All lengths in millimetres, capacities in litres, loads in kg.

export type Family = 'euro' | 'alc' | 'klt' | 'custom';

export interface BoxType {
  id: string;
  family: Family;
  /** Nominal external length (the longer side of the footprint). */
  length: number;
  /** Nominal external width (the shorter side of the footprint). */
  width: number;
  /** Nominal external height, without lid. */
  height: number;
  /** Usable capacity. May be null for custom boxes without a known capacity. */
  capacityL: number | null;
  capacityLowL?: number | null;
  capacityHighL?: number | null;
  /** True when the lid is integral (ALC) — no extra lid height is added. */
  lidded: boolean;
  /** Display name for custom boxes. */
  name?: string;
}

export interface Level {
  id: string;
  /**
   * Clear height: top of this board to the underside of the next board. On an open top
   * (the space on top of the shelf) it is the usable height, or null for no limit.
   */
  clearHeight: number | null;
  /** True for the space on top of the highest board (nothing above it). */
  openTop: boolean;
  enabled: boolean;
  /** Most boxes on top of each other: 1 = no stacking, null = as many as fit. */
  maxStack: number | null;
  /** Allow boxes behind other boxes (not everything reachable from the front). */
  allowBehind: boolean;
  /** Rated load of this board, as given by the user. null = unknown, no check. */
  maxLoadKg: number | null;
  /** Only these boxes on this level (e.g. small boxes for small parts). null = all selected boxes. */
  boxIds: string[] | null;
}

export interface Shelf {
  id: string;
  name: string;
  /** Number of identical bays side by side. */
  bays: number;
  /** Clear width of one bay, between the uprights. */
  clearWidth: number;
  /** Clear depth of a board. */
  clearDepth: number;
  /** How far boxes may stick out beyond the front edge. 0 = not allowed. */
  frontOverhang: number;
  /** Rated total load of the whole shelf, as given by the user. */
  maxTotalLoadKg: number | null;
  /** Visual only: board thickness, upright size and height of the lowest board surface. */
  boardThickness: number;
  uprightSize: number;
  bottomOffset: number;
  /** Levels from bottom to top. */
  levels: Level[];
  /** Only these boxes on this shelf (all levels). null = all selected boxes. Combined with each level's list. */
  boxIds: string[] | null;
  /** Built onto the previous shelf in the list, sharing its upright (e.g. separately configured bays). */
  joined: boolean;
}

export interface Settings {
  /** Added to every nominal external dimension to cover manufacturer differences. */
  tolerance: number;
  /** Gap between neighbouring boxes (fingers, handles). */
  gap: number;
  /** Space kept free above the top box so it can be lifted out. */
  topClearance: number;
  /** Boxes get separate lids (not applied to boxes with integral lids). */
  lids: boolean;
  lidHeight: number;
  /** Minimum share of a box's depth that must rest on the board when overhanging. */
  minSupport: number;
  /** Expected weight of the contents per litre of capacity, as given by the user. */
  kgPerLitre: number | null;
  currency: string;
  /** Gap between neighbouring shelves in the "all shelves" view. */
  shelfGap: number;
}

export type Objective = 'volume' | 'count' | 'fewestTypes' | 'value';

export interface ShelfSelection {
  /** Chosen plan strategy key. */
  plan: string | null;
  /** Manual per-level choices: level id → candidate signature. */
  overrides: Record<string, string>;
}

export interface Project {
  version: 1;
  name: string;
  shelves: Shelf[];
  enabledBoxIds: string[];
  customBoxes: BoxType[];
  /** Price per box, keyed by box id. */
  prices: Record<string, number>;
  settings: Settings;
  objective: Objective;
  selection: Record<string, ShelfSelection>;
}
