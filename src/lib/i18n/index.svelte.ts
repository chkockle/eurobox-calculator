import { de } from './de';
import { en, type MessageKey } from './en';

export type Locale = 'de' | 'en';
const LOCALE_KEY = 'eurobox-calc:locale';
const dictionaries: Record<Locale, Record<MessageKey, string>> = { de, en };

function detect(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved === 'de' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

let current = $state<Locale>(detect());

export const i18n = {
  get locale(): Locale {
    return current;
  },
  set locale(v: Locale) {
    current = v;
    try {
      localStorage.setItem(LOCALE_KEY, v);
    } catch {
      // ignore
    }
    document.documentElement.lang = v;
  },
};

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let s = dictionaries[current][key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function fmt(n: number, digits = 0): string {
  return new Intl.NumberFormat(current, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function money(n: number, currency: string): string {
  const s = new Intl.NumberFormat(current, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return current === 'de' ? `${s} ${currency}` : `${currency}${s}`;
}

export type { MessageKey };
