import { DEFAULT_ENABLED_IDS } from './catalog';
import { PRESETS, shelfFromQuick } from './shelfGen';
import type { Project, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  tolerance: 5,
  gap: 10,
  topClearance: 30,
  lids: false,
  lidHeight: 15,
  minSupport: 2 / 3,
  kgPerLitre: null,
  currency: '€',
  shelfGap: 20,
};

export function defaultProject(): Project {
  return {
    version: 1,
    name: '',
    shelves: [shelfFromQuick(PRESETS[0].input)],
    enabledBoxIds: [...DEFAULT_ENABLED_IDS],
    customBoxes: [],
    prices: {},
    settings: { ...DEFAULT_SETTINGS },
    objective: 'volume',
    selection: {},
  };
}
