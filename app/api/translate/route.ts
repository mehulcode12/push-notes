// ============================================================`
// POST /api/translate
//
// Called when user selects languages and clicks "Translate".
// Only translates languages the user actually requested —
// no wasted Lingo.dev credits on unused languages.
//
// Flow:
//   1. Validate changelogId + locales
//   2. Fetch English source from DB
//   3. Translate each locale via Lingo.dev SDK
//   4. Save each translation to DB
//   5. Return all translations + updated reach score
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { translateToLocales, calculateGlobalReachScore, validateLocales } from "@/lib/lingo";
import {
  getTranslations,
  saveTranslation,
  getChangelogById,
  getTranslation,
  getTranslatedLocales,
} from "@/lib/db";
import { SupportedLocale } from "@/lib/lingo-client";

export async function POST(req: NextRequest) {
  // ── 1. Parse + validate request ───────────
  let body: { changelogId?: string; locales?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const { changelogId, locales } = body;

  if (!changelogId || typeof changelogId !== "string") {
    return NextResponse.json(
      { error: "Missing required field: changelogId" },
      { status: 400 }
    );
  }

  if (!locales || !Array.isArray(locales) || locales.length === 0) {
    return NextResponse.json(
      { error: "Missing required field: locales (must be non-empty array)" },
      { status: 400 }
    );
  }

  // ── 2. Check changelog exists ──────────────
  const changelog = await getChangelogById(changelogId);
  if (!changelog) {
    return NextResponse.json(
      { error: "Changelog not found" },
      { status: 404 }
    );
  }

  // ── 3. Validate requested locales ─────────
  const validLocales = validateLocales(locales);
  if (validLocales.length === 0) {
    return NextResponse.json(
      { error: "No valid locales provided" },
      { status: 400 }
    );
  }

  // ── 4. Fetch English source ────────────────
  const englishContent = await getTranslation(changelogId, "en");
  if (!englishContent) {
    return NextResponse.json(
      { error: "English source not found for this changelog" },
      { status: 404 }
    );
  }

  // ── 5. Filter out already-translated locales ──
  const results: Record<string, any> = await getTranslations(changelogId);
  const alreadyTranslated = Object.keys(results);
  const toTranslate = validLocales.filter(
    (l) => !alreadyTranslated.includes(l)
  );

  // ── 6. Translate new locales ───────────────
  if (toTranslate.length > 0) {
    const translations = await translateToLocales(
      englishContent,
      toTranslate,
      (locale, status) => {
        console.log(`[translate] ${locale}: ${status}`);
      }
    );

    // save each translation to DB
    for (const translation of translations) {
      try {
        await saveTranslation({
          changelogId,
          locale: translation.locale,
          content: translation.content,
        });
        results[translation.locale] = translation.content;
      } catch (err) {
        console.error(`[translate] Failed to save ${translation.locale}:`, err);
        // still return the translation even if save failed
        results[translation.locale] = translation.content;
      }
    }
  }

  // ── 7. Calculate updated reach score ──────
  const allTranslatedLocales = await getTranslatedLocales(changelogId);
  const reachScore = calculateGlobalReachScore(allTranslatedLocales);

  return NextResponse.json({
    changelogId,
    translations: results,
    translatedLocales: allTranslatedLocales,
    reachScore,
    skipped: alreadyTranslated.filter((l) =>
      validLocales.includes(l as SupportedLocale)
    ),
  });
}
