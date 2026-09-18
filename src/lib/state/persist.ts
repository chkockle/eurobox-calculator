import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { DEFAULT_SETTINGS, defaultProject } from '../model/defaults';
import type { BoxType, Level, Project, Shelf } from '../model/types';
import { uid } from '../model/shelfGen';

export const STORAGE_KEY = 'eurobox-calc:project';
export const FILE_FORMAT = 'eurobox-calculator';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

function parseLevel(v: unknown): Level {
  const o = isObj(v) ? v : {};
  const openTop = o.openTop === true;
  return {
    id: str(o.id, uid()),
    // Only an open top may be unlimited (null).
    clearHeight: openTop && o.clearHeight == null ? null : Math.max(0, num(o.clearHeight, 300)),
    openTop,
    enabled: o.enabled !== false,
    maxStack: o.maxStack === null ? null : Math.max(1, Math.round(num(o.maxStack, 1))),
    allowBehind: o.allowBehind === true,
    maxLoadKg: numOrNull(o.maxLoadKg),
    boxIds: Array.isArray(o.boxIds) ? o.boxIds.filter((x): x is string => typeof x === 'string') : null,
  };
}

function parseShelf(v: unknown): Shelf {
  const o = isObj(v) ? v : {};
  return {
    id: str(o.id, uid()),
    name: str(o.name, ''),
    bays: Math.max(1, Math.round(num(o.bays, 1))),
    clearWidth: Math.max(0, num(o.clearWidth, 1000)),
    clearDepth: Math.max(0, num(o.clearDepth, 400)),
    frontOverhang: Math.max(0, num(o.frontOverhang, 0)),
    maxTotalLoadKg: numOrNull(o.maxTotalLoadKg),
    boardThickness: Math.max(0, num(o.boardThickness, 30)),
    uprightSize: Math.max(0, num(o.uprightSize, 35)),
    bottomOffset: Math.max(0, num(o.bottomOffset, 80)),
    levels: Array.isArray(o.levels) ? o.levels.map(parseLevel) : [],
    boxIds: Array.isArray(o.boxIds) ? o.boxIds.filter((x): x is string => typeof x === 'string') : null,
    joined: o.joined === true,
  };
}

function parseBox(v: unknown): BoxType | null {
  if (!isObj(v)) return null;
  const length = num(v.length, 0), width = num(v.width, 0), height = num(v.height, 0);
  if (length <= 0 || width <= 0 || height <= 0) return null;
  return {
    id: str(v.id, `custom-${uid()}`),
    family: 'custom',
    length: Math.max(length, width),
    width: Math.min(length, width),
    height,
    capacityL: numOrNull(v.capacityL),
    lidded: v.lidded === true,
    name: str(v.name, ''),
  };
}

/** Validate untrusted JSON (file import, share link, localStorage) into a Project. Throws on unusable input. */
export function parseProject(input: unknown): Project {
  const root = isObj(input) && isObj(input.project) ? input.project : input;
  if (!isObj(root) || !Array.isArray(root.shelves)) throw new Error('not-a-project');
  const version = num(root.version, 1);
  if (version > 1) throw new Error('newer-version');

  const d = defaultProject();
  const s = isObj(root.settings) ? root.settings : {};
  const prices: Record<string, number> = {};
  if (isObj(root.prices)) {
    for (const [k, v] of Object.entries(root.prices)) if (typeof v === 'number' && Number.isFinite(v) && v >= 0) prices[k] = v;
  }
  const selection: Project['selection'] = {};
  if (isObj(root.selection)) {
    for (const [k, v] of Object.entries(root.selection)) {
      if (!isObj(v)) continue;
      const overrides: Record<string, string> = {};
      if (isObj(v.overrides)) for (const [lk, lv] of Object.entries(v.overrides)) if (typeof lv === 'string') overrides[lk] = lv;
      selection[k] = { plan: typeof v.plan === 'string' ? v.plan : null, overrides };
    }
  }

  return {
    version: 1,
    name: str(root.name, ''),
    shelves: root.shelves.map(parseShelf),
    enabledBoxIds: Array.isArray(root.enabledBoxIds) ? root.enabledBoxIds.filter((x): x is string => typeof x === 'string') : d.enabledBoxIds,
    customBoxes: Array.isArray(root.customBoxes) ? root.customBoxes.map(parseBox).filter((b): b is BoxType => !!b) : [],
    prices,
    settings: {
      tolerance: Math.max(0, num(s.tolerance, DEFAULT_SETTINGS.tolerance)),
      gap: Math.max(0, num(s.gap, DEFAULT_SETTINGS.gap)),
      topClearance: Math.max(0, num(s.topClearance, DEFAULT_SETTINGS.topClearance)),
      lids: s.lids === true,
      lidHeight: Math.max(0, num(s.lidHeight, DEFAULT_SETTINGS.lidHeight)),
      minSupport: Math.min(1, Math.max(0.5, num(s.minSupport, DEFAULT_SETTINGS.minSupport))),
      kgPerLitre: numOrNull(s.kgPerLitre),
      currency: str(s.currency, DEFAULT_SETTINGS.currency).slice(0, 5),
      shelfGap: Math.max(0, num(s.shelfGap, DEFAULT_SETTINGS.shelfGap)),
    },
    selection,
  };
}

export function exportJson(project: Project): string {
  return JSON.stringify({ format: FILE_FORMAT, exportedAt: new Date().toISOString(), project }, null, 2);
}

export function shareHash(project: Project): string {
  return `#p=${compressToEncodedURIComponent(JSON.stringify(project))}`;
}

export function projectFromHash(hash: string): Project | null {
  const m = /^#p=(.+)$/.exec(hash);
  if (!m) return null;
  const json = decompressFromEncodedURIComponent(m[1]);
  if (!json) return null;
  try {
    return parseProject(JSON.parse(json));
  } catch {
    return null;
  }
}

export function loadStored(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function store(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // storage unavailable (private mode, quota) — autosave is a convenience only
  }
}
