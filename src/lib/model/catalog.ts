import { DATASET_BOXES } from '../data/catalog.generated';
import type { BoxType, Project } from './types';

export { DATASET_BOXES };

export function allBoxes(project: Pick<Project, 'customBoxes'>): BoxType[] {
  return [...DATASET_BOXES, ...project.customBoxes];
}

export function footprintKey(b: Pick<BoxType, 'length' | 'width'>): string {
  return `${b.length}×${b.width}`;
}

/** "60×40×32 cm" style label (dimensions in cm, one decimal only when needed). */
export function boxDims(b: Pick<BoxType, 'length' | 'width' | 'height'>): string {
  const cm = (mm: number) => {
    const v = mm / 10;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  return `${cm(b.length)}×${cm(b.width)}×${cm(b.height)} cm`;
}

/** Rough usable capacity for a custom box: straight-walled Euroboxes are ~76–78 % of external volume. */
export function estimateCapacityL(b: Pick<BoxType, 'length' | 'width' | 'height'>): number {
  return Math.round(((b.length * b.width * b.height) / 1e6) * 0.76 * 10) / 10;
}

/** Enabled by default: the common 60×40 and 40×30 Euroboxes. */
export const DEFAULT_ENABLED_IDS = DATASET_BOXES.filter(
  (b) => b.family === 'euro' && (b.length === 600 || b.length === 400),
).map((b) => b.id);
