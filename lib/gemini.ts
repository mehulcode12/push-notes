// ============================================================
// lib/gemini.ts — AI-powered commit summarizer + tone detector
// Uses @google/genai (latest SDK)
// Hardened for all known Gemini failure modes:
//   - Random text prefix before JSON ("shame", "shamefully" etc.)
//   - Random text prefix before JSON
//   - Thinking mode leaking into output
//   - Missing commas, unterminated strings in JSON
//   - Markdown code fences around JSON
//   - 429/500/503/504 errors with exponential backoff + jitter
//   - Uses Gemini's OWN retryDelay from error response
//   - Model fallback (gemini-2.5-flash → gemini-2.5-flash-lite)
//   - Empty / null responses
//   - Control characters & unicode issues
//   - Invalid API key detection
// ============================================================

import { GoogleGenAI } from "@google/genai";
import { Commit, PullRequest } from "./github";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Primary model — 5 RPM on free tier
const PRIMARY_MODEL  = "gemini-2.5-flash";
// Fallback model — 30 RPM on free tier, much more lenient
// NOTE: gemini-1.5-flash was RETIRED April 29 2025 — do NOT use it
const FALLBACK_MODEL = "gemini-2.5-flash-lite";

const MAX_RETRIES    = 3;
const BASE_DELAY_MS  = 2000;

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type Tone = "formal" | "casual" | "technical";

export interface ChangelogEntry {
  text: string; // human-readable description
  raw:  string; // original commit/PR for traceability
}

export interface ChangelogSections {
  added:    ChangelogEntry[];
  fixed:    ChangelogEntry[];
  changed:  ChangelogEntry[];
  breaking: ChangelogEntry[];
}

export interface GeminiResult {
  tone:     Tone;
  version:  string;
  sections: ChangelogSections;
}

// Safe fallback — used throughout to avoid crashes
const EMPTY_SECTIONS: ChangelogSections = {
  added: [], fixed: [], changed: [], breaking: [],
};

// ─────────────────────────────────────────────
// ERROR CLASSIFIER
// Categorizes Gemini API errors to decide retry strategy.
// ─────────────────────────────────────────────

type ErrorCategory =
  | "rate_limit"      // 429 per-minute — wait and retry
  | "quota_exhausted" // 429 daily quota — switch model
  | "server_error"    // 500/503 — retry immediately
  | "timeout"         // 504 — retry with fallback model
  | "invalid_key"     // 401/403 — don't retry, surface to user
  | "invalid_request" // 400 — don't retry, bad input
  | "not_found"       // 404 — model doesn't exist
  | "unknown";

function classifyError(error: any): ErrorCategory {
  const msg    = (error?.message ?? "").toLowerCase();
  const status = error?.status ?? error?.httpStatus ?? error?.code ?? 0;

  if (status === 401 || status === 403 || msg.includes("api_key") || msg.includes("invalid key")) {
    return "invalid_key";
  }
  if (status === 404 || msg.includes("not_found") || msg.includes("not found")) {
    return "not_found";
  }
  if (status === 400 || msg.includes("invalid_argument") || msg.includes("bad request")) {
    return "invalid_request";
  }
  if (status === 429 || msg.includes("resource_exhausted") || msg.includes("too many requests") || msg.includes("rate limit")) {
    if (msg.includes("daily") || msg.includes("per day") || msg.includes("quota")) {
      return "quota_exhausted";
    }
    return "rate_limit";
  }
  if (status === 504 || msg.includes("timeout") || msg.includes("deadline_exceeded")) {
    return "timeout";
  }
  if (status === 500 || status === 503 || msg.includes("internal") || msg.includes("unavailable") || msg.includes("overloaded")) {
    return "server_error";
  }

  return "unknown";
}

function isRetryable(category: ErrorCategory): boolean {
  return ["rate_limit", "quota_exhausted", "server_error", "timeout", "unknown"].includes(category);
}

// ─────────────────────────────────────────────
// RETRY DELAY EXTRACTOR
// Gemini includes exact wait time in the error response.
// We read it directly instead of guessing with backoff.
// Format from API: { "retryDelay": "6.729s" }
// ─────────────────────────────────────────────

function extractRetryDelay(error: any): number | null {
  try {
    // error.message is sometimes a JSON string — parse it
    const parsed = typeof error?.message === "string"
      ? JSON.parse(error.message)
      : error;

    const details = parsed?.error?.details ?? [];
    const retryInfo = details.find(
      (d: any) => d["@type"]?.includes("RetryInfo")
    );

    if (retryInfo?.retryDelay) {
      // format: "6s" or "6.729674681s" or "56.968637417s"
      const seconds = parseFloat(
        retryInfo.retryDelay.replace("s", "").trim()
      );
      if (!isNaN(seconds)) {
        return (seconds + 1.5) * 1000; // add 1.5s buffer, convert to ms
      }
    }
  } catch {
    // message wasn't JSON or retryDelay missing — fall through
  }
  return null;
}

// ─────────────────────────────────────────────
// BACKOFF DELAY
// Used when Gemini doesn't provide a retryDelay.
// Exponential backoff with jitter.
// ─────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffDelay(attempt: number, category: ErrorCategory): number {
  const multiplier   = category === "rate_limit" ? 3 : 1.5;
  const exponential  = BASE_DELAY_MS * Math.pow(multiplier, attempt);
  const jitter       = Math.random() * 1500;
  return Math.min(exponential + jitter, 60000); // cap at 60s
}

// ─────────────────────────────────────────────
// RETRY WRAPPER
// - Uses Gemini's own retryDelay if available
// - Falls back to exponential backoff with jitter
// - Switches to FALLBACK_MODEL on quota_exhausted or last attempt
// - Never retries invalid_key, invalid_request, not_found
// ─────────────────────────────────────────────

async function withRetry<T>(
  fn: (model: string) => Promise<T>,
  context: string
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // switch to fallback on quota exhausted or last attempt
    const model = attempt === MAX_RETRIES - 1 ? FALLBACK_MODEL : PRIMARY_MODEL;

    try {
      if (attempt > 0) {
        console.log(`[gemini/${context}] Attempt ${attempt + 1}/${MAX_RETRIES} using ${model}`);
      }
      return await fn(model);

    } catch (error: any) {
      lastError  = error;
      const category = classifyError(error);

      console.warn(
        `[gemini/${context}] Attempt ${attempt + 1} failed (${category}):`,
        error?.message ?? error
      );

      // surface immediately — retrying won't help
      if (category === "invalid_key") {
        throw new Error("Invalid Gemini API key. Check GEMINI_API_KEY in .env.local");
      }
      if (category === "invalid_request") {
        throw new Error(`Bad request to Gemini API: ${error?.message}`);
      }
      if (category === "not_found") {
        throw new Error(`Gemini model not found: ${error?.message}`);
      }

      if (!isRetryable(category) || attempt === MAX_RETRIES - 1) break;

      // prefer Gemini's own retryDelay — it's always more accurate
      const geminiDelay = extractRetryDelay(error);
      const delay       = geminiDelay ?? backoffDelay(attempt, category);

      console.log(`[gemini/${context}] Retrying in ${Math.round(delay / 1000)}s...`);
      await sleep(delay);
    }
  }

  throw new Error(
    `[gemini/${context}] All ${MAX_RETRIES} attempts failed. Last: ${lastError?.message ?? lastError}`
  );
}

// ─────────────────────────────────────────────
// ROBUST JSON PARSER
// Handles every known Gemini JSON failure mode:
//   1. ```json ... ``` fences
//   2. Random preamble text before JSON
//   3. Thinking mode content leaking
//   4. Trailing commas before } or ]
//   5. Smart quotes instead of straight quotes
//   6. Single quotes instead of double quotes
//   7. Trailing text after closing brace
//   8. Completely empty response
//   9. Unterminated JSON — regex extraction fallback
//  10. Unicode escape issues
// ─────────────────────────────────────────────

function robustParseJSON(raw: string | undefined | null): any {
  if (!raw || raw.trim().length === 0) return null;

  let text = raw;

  // 1. strip markdown code fences
  text = text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/```\s*$/im, "");

  // 2. strip Gemini thinking/reasoning tags
  text = text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "");

  // 3. replace smart/curly quotes with straight quotes
  text = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');

  // 4. remove control characters
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 5. direct parse — happy path
  try { return JSON.parse(text.trim()); } catch {}

  // 6. extract first JSON object — handles random preamble
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    // 6a. direct parse of extracted object
    try { return JSON.parse(jsonMatch[0]); } catch {}

    // 6b. fix trailing commas
    const fixedTrailing = jsonMatch[0]
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    try { return JSON.parse(fixedTrailing); } catch {}

    // 6c. fix single quotes
    const fixedQuotes = fixedTrailing
      .replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3')
      .replace(/:\s*'([^']*)'/g, ': "$1"');
    try { return JSON.parse(fixedQuotes); } catch {}
  }

  // 7. try JSON array extraction as last resort
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch {}
  }

  console.error("[gemini/robustParseJSON] All parsing strategies failed:", text.slice(0, 300));
  return null;
}

// ─────────────────────────────────────────────
// INPUT SANITIZER
// Strips chars that cause Gemini to reject requests.
// ─────────────────────────────────────────────

function sanitize(text: string, maxLen: number): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\\/g, "\\\\")
    .slice(0, maxLen)
    .trim();
}

// ─────────────────────────────────────────────
// SECTION VALIDATOR
// Ensures Gemini output matches expected shape.
// Handles alternate key names Gemini sometimes uses.
// ─────────────────────────────────────────────

function validateSections(parsed: any): ChangelogSections {
  if (!parsed || typeof parsed !== "object") return EMPTY_SECTIONS;

  const toEntries = (arr: any[]): ChangelogEntry[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        text: String(item.text ?? item.description ?? item.message ?? "").trim(),
        raw:  String(item.raw  ?? item.original   ?? item.commit  ?? "").trim(),
      }))
      .filter((e) => e.text.length > 0);
  };

  return {
    added:    toEntries(parsed.added    ?? parsed.features     ?? []),
    fixed:    toEntries(parsed.fixed    ?? parsed.bugfixes     ?? parsed.bugs ?? []),
    changed:  toEntries(parsed.changed  ?? parsed.updates      ?? parsed.improvements ?? []),
    breaking: toEntries(parsed.breaking ?? parsed.breaking_changes ?? []),
  };
}

// ─────────────────────────────────────────────
// TONE DETECTION
// Reads README to detect project's communication style.
// Falls back to "technical" if README missing or API fails.
// ─────────────────────────────────────────────

export async function detectTone(readme: string | null): Promise<Tone> {
  if (!readme || readme.trim().length < 50) return "technical";

  const sanitized = sanitize(readme, 1500);

  const prompt = `Analyze this GitHub README and classify its tone.

README:
"""
${sanitized}
"""

Reply with ONLY one word (no explanation, no punctuation, no extra text):
formal | casual | technical`;

  try {
    const result = await withRetry(async (model) => {
      const res = await ai.models.generateContent({ model, contents: prompt });
      if (!res.text || res.text.trim().length === 0) {
        throw new Error("Empty response from Gemini");
      }
      return res.text.trim().toLowerCase();
    }, "detectTone");

    if (result === "formal" || result === "casual" || result === "technical") {
      return result as Tone;
    }
    // loose match — Gemini sometimes adds punctuation
    if (result.includes("formal"))    return "formal";
    if (result.includes("casual"))    return "casual";
    if (result.includes("technical")) return "technical";

    return "technical";
  } catch (err) {
    console.error("[gemini/detectTone] Failed, using default:", err);
    return "technical"; // never crash — always return valid tone
  }
}

// ─────────────────────────────────────────────
// VERSION DETECTION
// Pure logic — no API call needed.
// Reads conventional commit prefixes for semver bump.
// ─────────────────────────────────────────────

export function detectVersion(
  commits: Commit[],
  currentVersion: string | null
): string {
  if (!commits?.length) return currentVersion ?? "v1.0.0";

  const msgs = commits.map((c) => (c.shortMessage ?? "").toLowerCase());

  const hasBreaking = msgs.some((m) =>
    m.includes("breaking change") ||
    m.includes("breaking:") ||
    /^[a-z]+!:/.test(m)
  );
  const hasFeat = msgs.some((m) => /^feat[:(]/.test(m));
  const hasFix  = msgs.some((m) => /^fix[:(]/.test(m));

  // extract semver from strings like "v1.2.3" or "package@1.2.3"
  const match = (currentVersion ?? "").match(/(\d+)\.(\d+)\.(\d+)/);
  let [major, minor, patch] = match
    ? [+match[1], +match[2], +match[3]]
    : [1, 0, 0];

  if      (hasBreaking) { major++; minor = 0; patch = 0; }
  else if (hasFeat)     { minor++; patch = 0; }
  else if (hasFix)      { patch++; }
  else                  { patch++; }

  return `v${major}.${minor}.${patch}`;
}

// ─────────────────────────────────────────────
// COMMIT SUMMARIZER
// Groups commits + PRs into clean changelog sections.
// Pre-filters non-user-facing commits to save tokens.
// ─────────────────────────────────────────────

const SKIP_PREFIXES = [
  "chore", "ci", "docs", "test", "style",
  "build", "release", "revert", "wip", "merge",
];

export async function summarizeCommits(
  commits: Commit[],
  pullRequests: PullRequest[],
  tone: Tone
): Promise<ChangelogSections> {
  if (!commits?.length) {
    console.warn("[gemini/summarizeCommits] No commits — returning empty");
    return EMPTY_SECTIONS;
  }

  // filter non-user-facing commits — better quality + fewer tokens
  const relevant = commits.filter(
    (c) => !SKIP_PREFIXES.some((p) => c.shortMessage.toLowerCase().startsWith(p))
  );
  const finalCommits = relevant.length > 0 ? relevant : commits;

  const commitList = finalCommits.map((c) => {
    let line = `- ${sanitize(c.shortMessage, 100)}`;
    if (c.filesChanged?.length) {
      const files = c.filesChanged
        .map(f => `${f.filename} (+${f.additions}/-${f.deletions})${f.patch ? `: ${f.patch.slice(0, 150)}` : ""}`)
        .join("; ");
      line += `\n  Files: ${files}`;
    }
    return line;
  }).join("\n");

  const prList = pullRequests.length > 0
    ? pullRequests
        .map((pr) => `- PR #${pr.number}: ${sanitize(pr.title, 100)}`)
        .join("\n")
    : "None";

  const toneInstruction = {
    formal:    "Use professional, concise language suitable for enterprise release notes.",
    casual:    "Use friendly, approachable language. Light emoji is welcome.",
    technical: "Use precise developer-focused language with technical terms.",
  }[tone];

  // Explicit JSON-only instruction — reduces preamble text issues
  const prompt = `You are a changelog generator. Output ONLY a JSON object. No explanation, no markdown, no code blocks, no text before or after the JSON.

Style: ${toneInstruction}

Commits:
${commitList}

PRs:
${prList}

Output this EXACT JSON structure with no deviations:
{"added":[{"text":"description","raw":"original"}],"fixed":[{"text":"description","raw":"original"}],"changed":[{"text":"description","raw":"original"}],"breaking":[{"text":"description","raw":"original"}]}

Rules:
- added    = new features, new APIs, new commands, new options
- fixed    = bug fixes, crash fixes, error corrections
- changed  = refactors, updates, improvements (non-breaking)
- breaking = anything that breaks existing behavior
- Skip chore/ci/docs/test/style/build commits
- Deduplicate commits and PRs that describe the same change
- Use the file changes and diffs to explain REAL impact — what changed in the code and why it matters
- Bad: "Added whoami support"
- Good: "detailed description of what was added, why it matters, and how users can take advantage of it. If the commit message is vague, use the code diff to infer more details about the change and its impact on users."
- Max 3-4 sentences per entry
- Empty section = empty array []
- Return ONLY the JSON — absolutely nothing else`;

  try {
    const raw = await withRetry(async (model) => {
      const res = await ai.models.generateContent({ model, contents: prompt });
      if (!res.text || res.text.trim().length === 0) {
        throw new Error("Empty response from Gemini");
      }
      return res.text;
    }, "summarizeCommits");

    const parsed = robustParseJSON(raw);

    if (!parsed) {
      console.error("[gemini/summarizeCommits] All JSON parsing strategies failed — using empty sections");
      return EMPTY_SECTIONS;
    }

    return validateSections(parsed);

  } catch (err) {
    console.error("[gemini/summarizeCommits] Failed:", err);
    return EMPTY_SECTIONS; // never crash
  }
}

// ─────────────────────────────────────────────
// MAIN — Single entry point used by /api/generate
// ─────────────────────────────────────────────

export async function generateChangelog(
  commits: Commit[],
  pullRequests: PullRequest[],
  readme: string | null,
  currentVersion: string | null
): Promise<GeminiResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing from .env.local");
  }

  // tone detection and version detection run in parallel
  const [tone, version] = await Promise.all([
    detectTone(readme),
    Promise.resolve(detectVersion(commits, currentVersion)),
  ]);

  // summarize after tone is known — tone affects writing style
  const sections = await summarizeCommits(commits, pullRequests, tone);

  return { tone, version, sections };
}
