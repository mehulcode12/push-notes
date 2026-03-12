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
import { TranslatedContent } from "./db";

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
  locale:       SupportedLocale;
  content:      TranslatedContent;
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

function flattenContent(content: TranslatedContent): Record<string, string> {
  const flat: Record<string, string> = {
    "release.title": content.title,
  };
  for (const [section, entries] of Object.entries(content.sections)) {
    (entries as ChangelogEntry[]).forEach((entry, i) => {
      flat[`${section}.${i}.title`] = entry.title;
      flat[`${section}.${i}.text`]  = entry.text;
      flat[`${section}.${i}.raw`]   = entry.raw;
    });
  }
  return flat;
}

function unflattenContent(
  flat: Record<string, string>,
  original: TranslatedContent
): TranslatedContent {
  const sections: ChangelogSections = { added: [], fixed: [], changed: [], breaking: [] };
  const releaseTitle = flat["release.title"] ?? original.title;

  for (const [section, entries] of Object.entries(original.sections)) {
    (entries as ChangelogEntry[]).forEach((_, i) => {
      const title = flat[`${section}.${i}.title`] ?? "";
      const text  = flat[`${section}.${i}.text`]  ?? "";
      const raw   = flat[`${section}.${i}.raw`]   ?? "";
      (sections[section as keyof ChangelogSections] as ChangelogEntry[]).push({ title, text, raw });
    });
  }
  return { title: releaseTitle, sections };
}

export async function translateToLocale(
  content: TranslatedContent,
  targetLocale: SupportedLocale
): Promise<TranslatedChangelog> {
  if (!process.env.LINGODOTDEV_API_KEY) {
    throw new Error("LINGODOTDEV_API_KEY is missing from .env.local");
  }
  if (targetLocale === "en") {
    return { locale: "en", content, translatedAt: new Date().toISOString() };
  }
  const totalEntries = Object.values(content.sections).reduce((sum, arr) => sum + arr.length, 0);
  if (totalEntries === 0) {
    return { locale: targetLocale, content, translatedAt: new Date().toISOString() };
  }
  const flat = flattenContent(content);
  try {
    const translated = await engine.localizeObject(flat, {
      sourceLocale: "en",
      targetLocale,
    });
    return {
      locale: targetLocale,
      content: unflattenContent(translated as Record<string, string>, content),
      translatedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`[lingo] Translation to ${targetLocale} failed:`, error?.message ?? error);
    return { locale: targetLocale, content, translatedAt: new Date().toISOString() };
  }
}

export async function translateToLocales(
  content: TranslatedContent,
  targetLocales: string[],
  onProgress?: (locale: SupportedLocale, status: "started" | "done" | "failed") => void
): Promise<TranslatedChangelog[]> {
  const validLocales = validateLocales(targetLocales);
  if (validLocales.length === 0) return [];
  const results: TranslatedChangelog[] = [];
  for (const locale of validLocales) {
    onProgress?.(locale, "started");
    try {
      const result = await translateToLocale(content, locale);
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
