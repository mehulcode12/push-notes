// ============================================================
// lib/lingo.ts — Lingo.dev SDK integration
// Translates changelog content at runtime using LingoDotDevEngine
// Uses SDK (not CLI) because changelog content is dynamic —
// it doesn't exist at build time so CLI file-based approach won't work.
// ============================================================

import { LingoDotDevEngine } from "lingo.dev/sdk";
import { ChangelogEntry, ChangelogSections } from "./gemini";

// Initialize Lingo.dev engine
const engine = new LingoDotDevEngine({
  apiKey: process.env.LINGODOTDEV_API_KEY!,
});

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type SupportedLocale =
  | "en" | "hi" | "es" | "fr"
  | "ja" | "de" | "ar" | "pt"
  | "zh" | "ko";

export interface LocaleInfo {
  code: SupportedLocale;
  name: string;         // display name in English
  nativeName: string;   // display name in the language itself
  rtl: boolean;         // right-to-left language
  devPopulation: number; // % of world's developers (for Global Reach Score)
}

export interface TranslatedChangelog {
  locale: SupportedLocale;
  sections: ChangelogSections;
  translatedAt: string;
}

// ─────────────────────────────────────────────
// SUPPORTED LOCALES REGISTRY
// Each locale includes metadata for the UI:
// - nativeName: shown in the language switcher
// - rtl: triggers RTL layout for Arabic
// - devPopulation: used to calculate Global Reach Score
// ─────────────────────────────────────────────

export const SUPPORTED_LOCALES: Record<SupportedLocale, LocaleInfo> = {
  en: { code: "en", name: "English",    nativeName: "English",    rtl: false, devPopulation: 27.6 },
  hi: { code: "hi", name: "Hindi",      nativeName: "हिंदी",       rtl: false, devPopulation: 6.4  },
  es: { code: "es", name: "Spanish",    nativeName: "Español",    rtl: false, devPopulation: 7.4  },
  fr: { code: "fr", name: "French",     nativeName: "Français",   rtl: false, devPopulation: 4.1  },
  ja: { code: "ja", name: "Japanese",   nativeName: "日本語",      rtl: false, devPopulation: 3.8  },
  de: { code: "de", name: "German",     nativeName: "Deutsch",    rtl: false, devPopulation: 3.7  },
  ar: { code: "ar", name: "Arabic",     nativeName: "العربية",    rtl: true,  devPopulation: 4.2  },
  pt: { code: "pt", name: "Portuguese", nativeName: "Português",  rtl: false, devPopulation: 3.1  },
  zh: { code: "zh", name: "Chinese",    nativeName: "中文",        rtl: false, devPopulation: 9.8  },
  ko: { code: "ko", name: "Korean",     nativeName: "한국어",      rtl: false, devPopulation: 2.3  },
};

// ─────────────────────────────────────────────
// GLOBAL REACH SCORE
// Calculates what % of world's developers can read this changelog.
// English is always included since source is English.
// Used as a fun motivational stat in the UI.
// ─────────────────────────────────────────────

export function calculateGlobalReachScore(
  translatedLocales: SupportedLocale[]
): number {
  // always include English baseline
  const allLocales = Array.from(new Set(["en" as SupportedLocale, ...translatedLocales]));

  const total = allLocales.reduce((sum, locale) => {
    return sum + (SUPPORTED_LOCALES[locale]?.devPopulation ?? 0);
  }, 0);

  // cap at 100% — populations overlap slightly
  return Math.min(Math.round(total), 100);
}

// ─────────────────────────────────────────────
// LOCALE VALIDATOR
// Ensures user-provided locale codes are valid
// before making API calls.
// ─────────────────────────────────────────────

export function isValidLocale(locale: string): locale is SupportedLocale {
  return locale in SUPPORTED_LOCALES;
}

export function validateLocales(locales: string[]): SupportedLocale[] {
  const valid = locales.filter(isValidLocale);
  const invalid = locales.filter((l) => !isValidLocale(l));

  if (invalid.length > 0) {
    console.warn(
      `[lingo] Ignoring unsupported locales: ${invalid.join(", ")}`
    );
  }

  // never translate to English — it's already the source
  return valid.filter((l) => l !== "en");
}

// ─────────────────────────────────────────────
// FLATTEN / UNFLATTEN
// We flatten our nested ChangelogSections into a flat object,
// translate it, then reconstruct the original shape.
// This preserves structure across all languages.
//
// Example:
//   { added: [{text: "Hello"}] }
//   → { "added.0.text": "Hello" }
//   → translate
//   → { added: [{text: "Hola"}] }
// ─────────────────────────────────────────────

function flattenSections(sections: ChangelogSections): Record<string, string> {
  const flat: Record<string, string> = {};

  for (const [section, entries] of Object.entries(sections)) {
    (entries as ChangelogEntry[]).forEach((entry, i) => {
      // only translate the human-readable text, not the raw commit message
      flat[`${section}.${i}.text`] = entry.text;
      // preserve raw as-is (not translated — it's the original commit)
      flat[`${section}.${i}.raw`] = entry.raw;
    });
  }

  return flat;
}

function unflattenSections(
  flat: Record<string, string>,
  original: ChangelogSections
): ChangelogSections {
  const result: ChangelogSections = {
    added: [], fixed: [], changed: [], breaking: [],
  };

  for (const [section, entries] of Object.entries(original)) {
    (entries as ChangelogEntry[]).forEach((_, i) => {
      const text = flat[`${section}.${i}.text`] ?? "";
      const raw  = flat[`${section}.${i}.raw`]  ?? "";

      (result[section as keyof ChangelogSections] as ChangelogEntry[]).push({
        text,
        raw, // raw is always English — never translated
      });
    });
  }

  return result;
}

// ─────────────────────────────────────────────
// SINGLE LOCALE TRANSLATOR
// Translates one locale at a time.
// Uses Lingo.dev SDK's localizeObject() for runtime content.
// ─────────────────────────────────────────────

export async function translateToLocale(
  sections: ChangelogSections,
  targetLocale: SupportedLocale
): Promise<TranslatedChangelog> {
  if (!process.env.LINGODOTDEV_API_KEY) {
    throw new Error("LINGODOTDEV_API_KEY is missing from .env.local");
  }

  // skip translation if source is English — return as-is
  if (targetLocale === "en") {
    return {
      locale: "en",
      sections,
      translatedAt: new Date().toISOString(),
    };
  }

  // check if there's anything to translate
  const totalEntries = Object.values(sections).reduce(
    (sum, arr) => sum + arr.length, 0
  );

  if (totalEntries === 0) {
    console.warn(`[lingo] No entries to translate for ${targetLocale}`);
    return {
      locale: targetLocale,
      sections,
      translatedAt: new Date().toISOString(),
    };
  }

  // flatten → translate → unflatten
  const flat = flattenSections(sections);

  try {
    const translated = await engine.localizeObject(flat, {
      sourceLocale: "en",
      targetLocale,
    });

    return {
      locale: targetLocale,
      sections: unflattenSections(translated as Record<string, string>, sections),
      translatedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`[lingo] Translation to ${targetLocale} failed:`, error?.message ?? error);
    // return original English on failure — never crash
    return {
      locale: targetLocale,
      sections,
      translatedAt: new Date().toISOString(),
    };
  }
}

// ─────────────────────────────────────────────
// MULTI LOCALE TRANSLATOR
// Translates to multiple locales.
// Runs sequentially (not parallel) to respect Lingo.dev rate limits.
// Reports per-locale progress via onProgress callback —
// used by the UI to show live progress per language.
// ─────────────────────────────────────────────

export async function translateToLocales(
  sections: ChangelogSections,
  targetLocales: string[],
  onProgress?: (locale: SupportedLocale, status: "started" | "done" | "failed") => void
): Promise<TranslatedChangelog[]> {
  const validLocales = validateLocales(targetLocales);

  if (validLocales.length === 0) {
    console.warn("[lingo] No valid locales to translate to");
    return [];
  }

  const results: TranslatedChangelog[] = [];

  // sequential to avoid hitting rate limits
  for (const locale of validLocales) {
    onProgress?.(locale, "started");

    try {
      const result = await translateToLocale(sections, locale);
      results.push(result);
      onProgress?.(locale, "done");
    } catch (error) {
      console.error(`[lingo] Failed for ${locale}:`, error);
      onProgress?.(locale, "failed");
    }
  }

  return results;
}

// ─────────────────────────────────────────────
// HELPERS FOR UI
// ─────────────────────────────────────────────

// Returns locale info for the language switcher dropdown
export function getLocaleInfo(locale: SupportedLocale): LocaleInfo {
  return SUPPORTED_LOCALES[locale];
}

// Returns all supported locales except English (source)
export function getTranslatableLocales(): LocaleInfo[] {
  return Object.values(SUPPORTED_LOCALES).filter((l) => l.code !== "en");
}
