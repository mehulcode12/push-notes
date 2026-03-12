// ============================================================
// lib/lingo.ts — SERVER ONLY
// Contains LingoDotDevEngine — uses Node.js built-ins.
// Never import this in "use client" components!
// For client components, import from lib/lingo-client.ts instead.
// ============================================================

import { LingoDotDevEngine } from "lingo.dev/sdk";
import { ChangelogEntry, ChangelogSections } from "./gemini";
import {
  SupportedLocale,
  SUPPORTED_LOCALES,
  calculateGlobalReachScore,
  getTranslatableLocales,
  isValidLocale,
} from "./lingo-client";

// Re-export everything from lingo-client for server-side convenience
export type { SupportedLocale };
export {
  SUPPORTED_LOCALES,
  calculateGlobalReachScore,
  getTranslatableLocales,
  isValidLocale,
};
export type { LocaleInfo } from "./lingo-client";

// Initialize Lingo.dev engine (server-only)
const engine = new LingoDotDevEngine({
  apiKey: process.env.LINGODOTDEV_API_KEY!,
});

export interface TranslatedChangelog {
  locale: SupportedLocale;
  sections: ChangelogSections;
  translatedAt: string;
}

export function validateLocales(locales: string[]): SupportedLocale[] {
  const valid = locales.filter(isValidLocale);
  const invalid = locales.filter((l) => !isValidLocale(l));
  if (invalid.length > 0) {
    console.warn(`[lingo] Ignoring unsupported locales: ${invalid.join(", ")}`);
  }
  return valid.filter((l) => l !== "en");
}

function flattenSections(sections: ChangelogSections): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [section, entries] of Object.entries(sections)) {
    (entries as ChangelogEntry[]).forEach((entry, i) => {
      flat[`${section}.${i}.text`] = entry.text;
      flat[`${section}.${i}.raw`]  = entry.raw;
    });
  }
  return flat;
}

function unflattenSections(
  flat: Record<string, string>,
  original: ChangelogSections
): ChangelogSections {
  const result: ChangelogSections = { added: [], fixed: [], changed: [], breaking: [] };
  for (const [section, entries] of Object.entries(original)) {
    (entries as ChangelogEntry[]).forEach((_, i) => {
      const text = flat[`${section}.${i}.text`] ?? "";
      const raw  = flat[`${section}.${i}.raw`]  ?? "";
      (result[section as keyof ChangelogSections] as ChangelogEntry[]).push({ text, raw });
    });
  }
  return result;
}

export async function translateToLocale(
  sections: ChangelogSections,
  targetLocale: SupportedLocale
): Promise<TranslatedChangelog> {
  if (!process.env.LINGODOTDEV_API_KEY) {
    throw new Error("LINGODOTDEV_API_KEY is missing from .env.local");
  }
  if (targetLocale === "en") {
    return { locale: "en", sections, translatedAt: new Date().toISOString() };
  }
  const totalEntries = Object.values(sections).reduce((sum, arr) => sum + arr.length, 0);
  if (totalEntries === 0) {
    return { locale: targetLocale, sections, translatedAt: new Date().toISOString() };
  }
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
    return { locale: targetLocale, sections, translatedAt: new Date().toISOString() };
  }
}

export async function translateToLocales(
  sections: ChangelogSections,
  targetLocales: string[],
  onProgress?: (locale: SupportedLocale, status: "started" | "done" | "failed") => void
): Promise<TranslatedChangelog[]> {
  const validLocales = validateLocales(targetLocales);
  if (validLocales.length === 0) return [];
  const results: TranslatedChangelog[] = [];
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

export function getLocaleInfo(locale: SupportedLocale) {
  return SUPPORTED_LOCALES[locale];
}
