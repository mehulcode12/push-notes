// ============================================================
// POST /api/generate
//
// Pipeline:
//   1. Validate input URL
//   2. Check cache (return instantly if recent changelog exists)
//   3. Fetch GitHub data (commits, PRs, README, release)
//   4. Summarize with Gemini (tone detection + changelog sections)
//   5. Save to Neon DB
//   6. Save English content as base translation
//   7. Return changelog ID + data
//
// Translation is NOT done here — it's on-demand via /api/translate
// This keeps generation fast and avoids burning Lingo.dev credits
// on languages the user may never request.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { fetchRepoAnalytics, parseGitHubUrl } from "@/lib/github";
import { generateChangelog } from "@/lib/gemini";
import {
  generateChangelogId,
  saveChangelog,
  saveEnglishContent,
  findCachedChangelog,
  getTranslation,
} from "@/lib/db";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface GenerateResponse {
  id: string;
  repoName: string;
  version: string;
  tone: string;
  title: string;
  sections: {
    added:    { text: string; raw: string }[];
    fixed:    { text: string; raw: string }[];
    changed:  { text: string; raw: string }[];
    breaking: { text: string; raw: string }[];
  };
  meta: {
    stars:       number;
    language:    string | null;
    description: string | null;
    topics:      string[];
  };
  cached: boolean;
  generatedAt: string;
}

// ─────────────────────────────────────────────
// POST /api/generate
// ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Parse + validate request body ──────
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const { url } = body;

  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing required field: url" },
      { status: 400 }
    );
  }

  // ── 2. Validate URL format ─────────────────
  let owner: string, repo: string;
  try {
    const parsed = parseGitHubUrl(url.trim());
    owner = parsed.owner;
    repo  = parsed.repo;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Invalid GitHub URL format" },
      { status: 400 }
    );
  }

  const normalizedUrl = `github.com/${owner}/${repo}`;

  // ── 3. Check cache first ───────────────────
  // If we generated a changelog for this repo in the last 24 hours,
  // return it instantly — no API calls needed.
  try {
    const cached = await findCachedChangelog(normalizedUrl);

    if (cached) {
      const sections = await getTranslation(cached.id, "en");

      if (sections) {
        console.log(`[generate] Cache hit for ${normalizedUrl} → ${cached.id}`);

        return NextResponse.json({
          id:          cached.id,
          repoName:    cached.repoName,
          version:     cached.version,
          tone:        cached.tone,
          title:       sections.title,
          sections:    sections.sections,
          meta: {
            stars:       0,
            language:    null,
            description: null,
            topics:      [],
          },
          cached:      true,
          generatedAt: cached.generatedAt,
        } satisfies GenerateResponse);
      }
    }
  } catch (err) {
    console.warn("[generate] Cache check failed, continuing:", err);
  }

  // ── 4. Fetch GitHub data ───────────────────
  let analytics;
  try {
    analytics = await fetchRepoAnalytics(normalizedUrl);
  } catch (err: any) {
    const msg = err.message ?? "Failed to fetch GitHub data";

    if (msg.includes("not found") || msg.includes("404")) {
      return NextResponse.json(
        { error: "Repository not found. Make sure it's public." },
        { status: 404 }
      );
    }
    if (msg.includes("rate limit")) {
      return NextResponse.json(
        { error: "GitHub API rate limit exceeded. Try again in a few minutes." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: `GitHub error: ${msg}` },
      { status: 502 }
    );
  }

  // ── 5. Generate changelog with Gemini ─────
  let geminiResult;
  try {
    geminiResult = await generateChangelog(
      analytics.commits,
      analytics.pullRequests,
      analytics.readme,
      analytics.latestRelease?.tagName ?? null
    );
  } catch (err: any) {
    const msg = err.message ?? "AI generation failed";

    if (msg.includes("GEMINI_API_KEY")) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: `AI error: ${msg}` },
      { status: 502 }
    );
  }

  // ── 6. Save to database ────────────────────
  const id = generateChangelogId(analytics.meta.fullName);

  try {
  void (async () => {
    try {
      await saveChangelog({
        id,
        repoUrl:  normalizedUrl,
        repoName: analytics.meta.fullName,
        version:  geminiResult.version,
        tone:     geminiResult.tone,
      });
      await saveEnglishContent(id, geminiResult.title, geminiResult.sections);
      console.log(`[generate] ✅ DB saved: ${id}`);
    } catch (err) {
      console.error(`[generate] ❌ DB save failed:`, err);
    }
  })();

  } catch (err: any) {
    console.error("[generate] DB save failed:", err);
    // non-fatal — return data even if save failed
  }

  // ── 7. Return response ─────────────────────
  return NextResponse.json({
    id,
    repoName:    analytics.meta.fullName,
    version:     geminiResult.version,
    tone:        geminiResult.tone,
    title:       geminiResult.title,
    sections:    geminiResult.sections,
    meta: {
      stars:       analytics.meta.stars,
      language:    analytics.meta.language,
      description: analytics.meta.description,
      topics:      analytics.meta.topics,
    },
    cached:      false,
    generatedAt: new Date().toISOString(),
  } satisfies GenerateResponse);
}
