// ============================================================
// lib/db.ts — Neon Database Client
// Uses Pool + WebSocket transport (not HTTP fetch).
// HTTP fetch fails on some networks (ENOTFOUND api.neon.tech).
// WebSocket connects directly to Postgres — more reliable locally.
//
// NOTE: ws package is required for Node.js < v22
//   npm install ws
//   npm install --save-dev @types/ws
// ============================================================

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { ChangelogSections, Tone } from "./gemini";
import { SupportedLocale } from "./lingo-client";

export interface TranslatedContent {
  title:    string;
  sections: ChangelogSections;
}

// Required for Node.js environments without native WebSocket (< v22)
// This is what fixes the ENOTFOUND error with HTTP transport
neonConfig.webSocketConstructor = ws;

// ─────────────────────────────────────────────
// POOL FACTORY
// Creates a new Pool per request — required for serverless.
// Do NOT create Pool outside a function in serverless environments.
// Each function call creates, uses, and ends its own pool.
// ─────────────────────────────────────────────

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from .env.local");
  }
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface ChangelogRecord {
  id: string;
  repoUrl: string;
  repoName: string;
  version: string;
  tone: Tone;
  generatedAt: string;
}

export interface TranslationRecord {
  id: number;
  changelogId: string;
  locale: SupportedLocale;
  content: TranslatedContent;
  createdAt: string;
}

// ─────────────────────────────────────────────
// ID GENERATOR
// Creates a URL-safe unique slug from repo name.
// e.g. "facebook/react" → "facebook-react-a3f2b1"
// Used as the changelog page URL: /changelog/facebook-react-a3f2b1
// ─────────────────────────────────────────────

export function generateChangelogId(repoFullName: string): string {
  const base = repoFullName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

// ─────────────────────────────────────────────
// CACHE CHECK
// Before running the expensive GitHub → Gemini pipeline,
// check if we already have a recent changelog for this repo.
// "Recent" = generated within the last 24 hours.
// Instant results for repeated requests — no wasted API calls.
// ─────────────────────────────────────────────

export async function findCachedChangelog(
  repoUrl: string
): Promise<ChangelogRecord | null> {
  const pool = getPool();
  try {
    const normalized = repoUrl.trim().toLowerCase().replace(/\/$/, "");
    const { rows } = await pool.query(
      `SELECT
         id,
         repo_url    AS "repoUrl",
         repo_name   AS "repoName",
         version,
         tone,
         generated_at::text AS "generatedAt"
       FROM changelogs
       WHERE LOWER(repo_url) = $1
         AND generated_at > NOW() - INTERVAL '24 hours'
       ORDER BY generated_at DESC
       LIMIT 1`,
      [normalized]
    );
    return rows.length > 0 ? (rows[0] as ChangelogRecord) : null;
  } catch (error) {
    console.error("[db/findCachedChangelog] Error:", error);
    return null; // cache miss is not fatal — just regenerate
  } finally {
    await pool.end();
  }
}

// ─────────────────────────────────────────────
// SAVE CHANGELOG
// Inserts a new changelog record after generation.
// ON CONFLICT updates existing record safely.
// ─────────────────────────────────────────────

export async function saveChangelog(data: {
  id: string;
  repoUrl: string;
  repoName: string;
  version: string;
  tone: Tone;
}): Promise<ChangelogRecord> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `INSERT INTO changelogs (id, repo_url, repo_name, version, tone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         version      = EXCLUDED.version,
         tone         = EXCLUDED.tone,
         generated_at = NOW()
       RETURNING
         id,
         repo_url    AS "repoUrl",
         repo_name   AS "repoName",
         version,
         tone,
         generated_at::text AS "generatedAt"`,
      [data.id, data.repoUrl, data.repoName, data.version, data.tone]
    );
    return rows[0] as ChangelogRecord;
  } finally {
    await pool.end();
  }
}

// ─────────────────────────────────────────────
// GET CHANGELOG BY ID
// Fetches a changelog by its URL slug.
// Used by the /changelog/[id] page to load content.
// ─────────────────────────────────────────────

export async function getChangelogById(
  id: string
): Promise<ChangelogRecord | null> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT
         id,
         repo_url    AS "repoUrl",
         repo_name   AS "repoName",
         version,
         tone,
         generated_at::text AS "generatedAt"
       FROM changelogs
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return rows.length > 0 ? (rows[0] as ChangelogRecord) : null;
  } catch (error) {
    console.error("[db/getChangelogById] Error:", error);
    return null;
  } finally {
    await pool.end();
  }
}

// ─────────────────────────────────────────────
// SAVE TRANSLATION
// Stores a translated changelog for a specific locale.
// ON CONFLICT safely updates if translation already exists.
// Called after user selects languages and clicks Translate.
// ─────────────────────────────────────────────

export async function saveTranslation(data: {
  changelogId: string;
  locale: SupportedLocale;
  content: TranslatedContent;
}): Promise<void> {
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO translations (changelog_id, locale, content)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (changelog_id, locale) DO UPDATE SET
         content    = EXCLUDED.content,
         created_at = NOW()`,
      [data.changelogId, data.locale, JSON.stringify(data.content)]
    );
  } catch (error) {
    console.error(`[db/saveTranslation] Error saving ${data.locale}:`, error);
    throw error; // re-throw — caller needs to know if save failed
  } finally {
    await pool.end();
  }
}

// ─────────────────────────────────────────────
// GET ALL TRANSLATIONS
// Fetches all available translations for a changelog.
// Returns a map of locale → sections for easy UI lookup.
// Used to populate language switcher on the changelog page.
// ─────────────────────────────────────────────

export async function getTranslations(
  changelogId: string
): Promise<Record<SupportedLocale, TranslatedContent>> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT locale, content
       FROM translations
       WHERE changelog_id = $1
       ORDER BY created_at ASC`,
      [changelogId]
    );

    const result: Partial<Record<SupportedLocale, TranslatedContent>> = {};
    for (const locale of rows) {
      result[locale.locale as SupportedLocale] = locale.content as TranslatedContent;
    }
    return result as Record<SupportedLocale, TranslatedContent>;
  } catch (error) {
    console.error("[db/getTranslations] Error:", error);
    return {} as Record<SupportedLocale, TranslatedContent>;
  } finally {
    await pool.end();
  }
}

// ─────────────────────────────────────────────
// GET SINGLE TRANSLATION
// Fetches one specific locale for a changelog.
// Called when user switches language on the changelog page.
// ─────────────────────────────────────────────

export async function getTranslation(
  changelogId: string,
  locale: SupportedLocale
): Promise<TranslatedContent | null> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT content
       FROM translations
       WHERE changelog_id = $1 AND locale = $2
       LIMIT 1`,
      [changelogId, locale]
    );
    return rows.length > 0 ? (rows[0].content as TranslatedContent) : null;
  } catch (error) {
    console.error(`[db/getTranslation] Error for ${locale}:`, error);
    return null;
  } finally {
    await pool.end();
  }
}

// ─────────────────────────────────────────────
// GET TRANSLATED LOCALES
// Returns list of locales that have been translated so far.
// Used to show available languages in the switcher
// and calculate the Global Reach Score dynamically.
// ─────────────────────────────────────────────

export async function getTranslatedLocales(
  changelogId: string
): Promise<SupportedLocale[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT locale
       FROM translations
       WHERE changelog_id = $1
       ORDER BY created_at ASC`,
      [changelogId]
    );
    return rows.map((r) => r.locale as SupportedLocale);
  } catch (error) {
    console.error("[db/getTranslatedLocales] Error:", error);
    return [];
  } finally {
    await pool.end();
  }
}

// ─────────────────────────────────────────────
// SAVE ENGLISH CONTENT
// Saves the English (source) changelog sections as a translation.
// This makes it consistent — all languages including English
// are stored in the translations table for uniform access.
// ─────────────────────────────────────────────

export async function saveEnglishContent(
  changelogId: string,
  title: string,
  sections: ChangelogSections
): Promise<void> {
  await saveTranslation({
    changelogId,
    locale: "en",
    content: { title, sections },
  });
}
