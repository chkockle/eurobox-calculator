import { boxDims } from './model/catalog';
import type { BoxType } from './model/types';
import { t } from './i18n/index.svelte';
import type { LevelCandidate } from './solver/level';

export function boxName(b: BoxType | undefined): string {
  if (!b) return '?';
  if (b.family === 'custom' && b.name) return `${b.name} (${boxDims(b)})`;
  return boxDims(b);
}

export function planLabel(key: string, byId: Map<string, BoxType>): string {
  if (key === 'maxVolume') return t('plan.maxVolume');
  if (key === 'maxCount') return t('plan.maxCount');
  if (key === 'value') return t('plan.value');
  if (key.startsWith('fp:')) {
    const [l, w] = key.slice(3).split('×').map(Number);
    return t('plan.fp', { fp: `${l / 10}×${w / 10}` });
  }
  if (key.startsWith('box:')) return t('plan.box', { box: boxName(byId.get(key.slice(4))) });
  return key;
}

/** "3 × 60×40×32 cm (turned, 2 high)" summaries for a level candidate. */
export function candidateSummary(c: LevelCandidate, byId: Map<string, BoxType>): string {
  const groups = new Map<string, { n: number; col: LevelCandidate['columns'][number] }>();
  for (const col of c.columns) {
    const g = groups.get(col.key);
    if (g) g.n += col.count;
    else groups.set(col.key, { n: col.count, col });
  }
  return [...groups.values()]
    .map(({ n, col }) => {
      const extra = [
        col.rotated ? t('level.rotated') : '',
        col.stack > 1 ? t('level.stackOf', { n: col.stack }) : '',
        col.rows > 1 ? t('level.rowsOf', { n: col.rows }) : '',
      ].filter(Boolean);
      if (col.mixed) {
        // "3 × 60×40 stack 22+17 cm (turned)"
        const b = byId.get(col.boxId);
        const heights = col.items.map((it) => fmtCm(it.nomH)).join(' + ');
        const fp = b ? `${fmtCm(b.length)}×${fmtCm(b.width)}` : '';
        const turned = col.rotated ? ` (${t('level.rotated')})` : '';
        return t('level.mixedColumn', { n: n / col.stack, fp, heights }) + turned;
      }
      return t('level.column', { n, box: boxName(byId.get(col.boxId)) }) + (extra.length ? ` (${extra.join(', ')})` : '');
    })
    .join(' + ');
}

const fmtCm = (mm: number) => {
  const v = mm / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

const HUES: Record<string, number> = { '600×400': 212, '400×300': 160, '300×200': 38, '800×600': 275 };

/** Stable colour per box: hue by footprint, lightness by height. */
export function boxColor(b: BoxType | undefined): string {
  if (!b) return '#888';
  const fp = `${b.length}×${b.width}`;
  const hue = b.family === 'custom' ? 330 : HUES[fp] ?? 0;
  const sat = 60;
  const light = 68 - Math.min(30, (b.height / 470) * 30);
  return `hsl(${hue}, ${sat}%, ${Math.round(light)}%)`;
}
