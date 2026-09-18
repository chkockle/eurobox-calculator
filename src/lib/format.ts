/** Parse user input that may use either a comma or a dot as decimal separator. null = empty, NaN = invalid. */
export function parseDecimal(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, '');
  if (s === '') return null;
  // "1.234,50" (German grouping) → "1234.50"; "4,3" → "4.3"
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
