'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { TH } from './th';

export const LOCALES = ['en', 'th'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = { en: 'English', th: 'ภาษาไทย' };

const STORAGE_KEY = 'tmt.locale';

/** Text in the chosen language; text that has no translation is returned unchanged. */
export function translate(locale: Locale, text: string): string {
  return locale === 'th' ? (TH[text] ?? text) : text;
}

function readStored(): Locale | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return LOCALES.find((l) => l === value) ?? null;
  } catch {
    return null; // private window or blocked storage: the choice just is not remembered
  }
}

function store(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* not remembered */
  }
}

interface LocaleValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleValue>({ locale: 'en', setLocale: () => undefined });

/** The language of the menu and page titles; remembered per browser. English until chosen. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  // Read after mount so the first render matches the server's.
  useEffect(() => {
    const stored = readStored();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, unknown while rendering on the server
    if (stored) setLocaleState(stored);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    store(next);
  }, []);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

/** `t('Defects')` → "ข้อบกพร่อง" in Thai. */
export function useT(): (text: string) => string {
  const { locale } = useLocale();
  return useCallback((text: string) => translate(locale, text), [locale]);
}
