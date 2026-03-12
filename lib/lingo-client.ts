// ============================================================
// lib/lingo-client.ts — Browser-safe Lingo.dev constants
// NO imports from lingo.dev SDK — safe for "use client" components.
// Contains only pure data and functions that work in any environment.
//
// lib/lingo.ts  — server-only (SDK, LingoDotDevEngine, translation)
// lib/lingo-client.ts — browser-safe (constants, pure functions only)
// ============================================================

export type SupportedLocale =
  | "en" | "hi" | "es" | "fr"
  | "ja" | "de" | "ar" | "pt"
  | "zh" | "ko";

export interface LocaleInfo {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  rtl: boolean;
  devPopulation: number;
}

export const SUPPORTED_LOCALES: Record<SupportedLocale, LocaleInfo> = {
  en: { code: "en", name: "English",    nativeName: "English",   rtl: false, devPopulation: 27.6 },
  hi: { code: "hi", name: "Hindi",      nativeName: "हिंदी",      rtl: false, devPopulation: 6.4  },
  es: { code: "es", name: "Spanish",    nativeName: "Español",   rtl: false, devPopulation: 7.4  },
  fr: { code: "fr", name: "French",     nativeName: "Français",  rtl: false, devPopulation: 4.1  },
  ja: { code: "ja", name: "Japanese",   nativeName: "日本語",     rtl: false, devPopulation: 3.8  },
  de: { code: "de", name: "German",     nativeName: "Deutsch",   rtl: false, devPopulation: 3.7  },
  ar: { code: "ar", name: "Arabic",     nativeName: "العربية",   rtl: true,  devPopulation: 4.2  },
  pt: { code: "pt", name: "Portuguese", nativeName: "Português", rtl: false, devPopulation: 3.1  },
  zh: { code: "zh", name: "Chinese",    nativeName: "中文",       rtl: false, devPopulation: 9.8  },
  ko: { code: "ko", name: "Korean",     nativeName: "한국어",     rtl: false, devPopulation: 2.3  },
};

export function calculateGlobalReachScore(
  translatedLocales: SupportedLocale[]
): number {
  const allLocales = Array.from(new Set(["en" as SupportedLocale, ...translatedLocales]));
  const total = allLocales.reduce((sum, locale) => {
    return sum + (SUPPORTED_LOCALES[locale]?.devPopulation ?? 0);
  }, 0);
  return Math.min(Math.round(total), 100);
}

export function getTranslatableLocales(): LocaleInfo[] {
  return Object.values(SUPPORTED_LOCALES).filter((l) => l.code !== "en");
}

export function isValidLocale(locale: string): locale is SupportedLocale {
  return locale in SUPPORTED_LOCALES;
}
