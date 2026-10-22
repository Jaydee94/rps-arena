import { get, writable, type Readable } from 'svelte/store';
import de from './locales/de.json';
import en from './locales/en.json';

export type Locale = 'de' | 'en';

const DICTIONARIES: Record<Locale, Record<string, string>> = { de, en };
const STORAGE_KEY = 'rps.locale';

function isLocale(value: unknown): value is Locale {
  return value === 'de' || value === 'en';
}

/** Stored choice first, then `navigator.language` (de* -> de), else en. Never throws. */
export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // storage unavailable: fall through to the browser language
  }
  const language = typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
  return language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

const current = writable<Locale>(detectLocale());
// Mirrors the store in a rune so that `t()` is tracked by Svelte templates and effects.
let active = $state<Locale>(get(current));

export const locale: Readable<Locale> = { subscribe: current.subscribe };

export function setLocale(next: Locale): void {
  active = next;
  current.set(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // storage unavailable: the choice just won't survive a reload
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}

/** Translates `key` in the current locale; `{name}` placeholders are filled from `vars`. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const text = DICTIONARIES[active][key];
  if (text === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key "${key}"`);
    return key;
  }
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
