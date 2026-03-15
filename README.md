# PushNotes

### Multilingual release notes on every push

> Paste any public GitHub repo URL → get a beautiful, AI-generated changelog in 10+ languages. Instantly.

[![Built for Lingo.dev Hackathon](https://img.shields.io/badge/Built%20for-Lingo.dev%20Hackathon%20%233-f59e0b?style=flat-square)](https://lingo.dev)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square)](https://nextjs.org)
[![Neon](https://img.shields.io/badge/Database-Neon%20Postgres-00e699?style=flat-square)](https://neon.tech)
[![Gemini](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-4285f4?style=flat-square)](https://aistudio.google.com)

**[📹 Watch Demo → youtube.com/@numpi1208](https://youtu.be/rl1EjdmHNlc)**

> Not deployed publicly to preserve free API tier limits during judging. Clone and run locally in under 2 minutes — full setup guide below.

---

## The Problem

Most changelogs are useless. "Fix bug." "Update deps." "Misc changes." Nobody knows what actually shipped, whether it is safe to upgrade, or how it affects their project.

And even the teams that write proper changelogs write them in English only. The French developer evaluating your library, the Japanese contributor deciding whether to upgrade, the Chinese PM trying to understand what their team shipped — they are all reading something that was never written for them.

PushNotes fixes both problems at once.

---

## Features

### Core
- **One input** — paste any public GitHub URL, no login, no OAuth, no credit card
- **AI-powered changelog** — reads actual file diffs, not just commit messages
- **Release headline** — AI generates a punchy title for the entire release
- **Per-entry titles** — every change gets its own title and impact description
- **Tone detection** — matches the writing style of the repo (technical vs casual)
- **Smart versioning** — auto-detects semver from commit prefixes (`feat:`, `fix:`, `BREAKING:`)

### Multilingual
- **10+ languages** — English, Hindi, Spanish, French, Japanese, German, Arabic, Portuguese, Chinese, Korean
- **Translate once, cached forever** — Lingo.dev translates on first request, stored permanently in Neon. Every visitor after that gets it instantly at zero cost
- **Instant language switching** — client-side state swap, zero network request after first translation
- **Native TTS** — listen to the changelog in the native accent for each language
- **Shareable language URLs** — `/changelog/[id]?lang=ja` links directly to Japanese

### Knowledge Graph
- **Interactive visual map** — every file changed in the release, laid out as a solar system
- **Risk coloring** — red (high churn, 3+ commits), amber (modified), green (stable)
- **Click-to-explain** — click any node, Gemini explains that file's changes natively in your active language
- **One-click graph translation** — translate every node label through Lingo.dev in one click
- **PM-friendly** — non-technical team members can understand the blast radius of a release without reading a single commit

> Not just for developers — a product manager can open the Knowledge Graph and immediately understand what their team shipped, which areas are risky, and what the blast radius of a release actually was. No developer explanation needed. No commit history to read.

### Quality of Life
- **Global Reach Score** — see what % of the world's developers can now read this changelog
- **Background saving** — changelog returns instantly, DB saves fire-and-forget in the background
- **404-proof** — retry logic prevents broken pages on fresh changelogs while DB catches up
- **Shareable links** — every changelog has a permanent URL

---

## Screenshots

**Landing Page**
![Landing Page](./screenshots/landing.png)

**AI-Generated Changelog**
![Changelog](./screenshots/changelog.png)

**Hindi Translation**
![Hindi Translation](./screenshots/hindi.png)

**Knowledge Graph — Japanese**
![Knowledge Graph](./screenshots/graph.png)

---

## Demo

[![PushNotes Demo](./screenshots/thumbnail.jpeg)](https://youtu.be/rl1EjdmHNlc)

> Click the image to watch the full demo video

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend + Backend | Next.js 15 App Router | Server components for data fetching, client components for zero-latency interactions |
| Database | Neon Serverless Postgres | Serverless, scales to zero, handles concurrent readers with no connection management needed |
| AI | Google Gemini 2.5 Flash | Reads raw code diffs, generates structured JSON with titles and impact descriptions |
| Translation (Runtime) | Lingo.dev SDK | Powers all multilingual features — woven into the core data model from day one |
| Translation (Dev/Test) | Lingo.dev CLI + MCP | Used during development to test translation output and iterate on the flattening logic |
| Graph | React Flow | Renders the radial Knowledge Graph from server-computed node positions |
| Hosting | Vercel-ready | Configured for instant deploy — not publicly hosted to preserve free API limits |
| Data | GitHub Public API | Fetches commit metadata and full file diffs for AI context |

> Lingo.dev is not a feature added on top of PushNotes. It is the foundation the entire translation architecture is built on.

---

## How Translation Caching Works

Every translation is a one-time operation. The first person who reads a changelog in Japanese triggers the Lingo.dev translation. Every person after that — anywhere in the world — gets the cached Japanese version served directly from Neon at zero cost.

```
User 1 opens changelog in Japanese
  → Lingo.dev translates the full bundle
  → Stored permanently in Neon (changelog_id + locale = UNIQUE)
  → Returned instantly

User 2, 3, 4... open same changelog in Japanese
  → Served directly from Neon
  → 0ms translation time
  → $0 translation cost
```

This means popular repos get faster and cheaper over time, not slower. The `UNIQUE (changelog_id, locale)` constraint in Postgres guarantees no duplicate translation ever runs — even under concurrent load from multiple users hitting the same changelog simultaneously.

> Typical generation time: 10–20 seconds depending on repo size. Language switch after first translation: 0ms.

---

## Project Structure

```
push-notes/
├── app/
│   ├── page.tsx                          # Landing page — single input, generation flow
│   ├── changelog/
│   │   └── [id]/
│   │       ├── page.tsx                  # Server component — fetches with retry logic
│   │       ├── loading.tsx               # Skeleton shown during DB retry
│   │       ├── ChangelogClient.tsx       # Client — language switch, TTS, collapsible entries
│   │       └── graph/
│   │           ├── page.tsx              # Server component — builds graph data server-side
│   │           └── GraphClient.tsx       # Client — React Flow radial graph, lazy AI explain
│   └── api/
│       ├── generate/route.ts             # Main pipeline — GitHub → Gemini → fire-and-forget DB
│       ├── translate/route.ts            # Translation endpoint — Lingo.dev → Neon cache
│       └── explain-node/route.ts         # Lazy node explanation — Gemini on demand only
├── lib/
│   ├── github.ts                         # GitHub API — commits + file diffs (parallel fetching)
│   ├── gemini.ts                         # Gemini integration — structured JSON output
│   ├── lingo.ts                          # Lingo.dev SDK — flatten, translate, unflatten
│   ├── lingo-client.ts                   # Browser-safe constants — no SDK imports
│   ├── graph.ts                          # Graph builder — radial layout, churn scoring
│   └── db.ts                             # Neon queries — changelogs + translations CRUD
└── .github/
    └── workflows/
        └── lingo.yml                     # Lingo.dev CI/CD — auto-translate on push
```

Every file in `lib/` has exactly one responsibility. No file does more than one thing. Server-only code never leaks into the client bundle — `lingo.ts` stays server-side, `lingo-client.ts` is the browser-safe equivalent.

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) database (free tier works)
- A [Google AI Studio](https://aistudio.google.com) API key (free)
- A [Lingo.dev](https://lingo.dev) API key
- A GitHub personal access token (optional but strongly recommended — avoids rate limits on popular repos)

### 1. Clone the repo

```bash
git clone https://github.com/mehulcode12/push-notes
cd push-notes
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the root:

```env
# Google Gemini — get from https://aistudio.google.com
GEMINI_API_KEY=your_gemini_api_key_here

# Neon Postgres — MUST be direct connection, NOT the pooler URL
# Correct:   ep-something-123456.us-east-1.aws.neon.tech
# Wrong:     ep-something-123456-pooler.us-east-1.aws.neon.tech
DATABASE_URL=your_neon_direct_connection_string_here

# Lingo.dev — get from https://lingo.dev/dashboard
LINGODOTDEV_API_KEY=your_lingodotdev_api_key_here

# GitHub — optional but prevents rate limiting on popular repos
GITHUB_TOKEN=your_github_personal_access_token_here
```

> **Why direct connection?** The Neon pooler URL adds latency and can be unreachable in some regions. Always use the direct connection string — it looks like `postgresql://user:pass@ep-name-123.region.aws.neon.tech/dbname` with no `-pooler` in the hostname.

### 3. Set up the database

Run these in your Neon SQL console:

```sql
CREATE TABLE changelogs (
  id           TEXT PRIMARY KEY,
  repo_url     TEXT NOT NULL,
  repo_name    TEXT NOT NULL,
  version      TEXT,
  tone         TEXT,
  generated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE translations (
  id           SERIAL PRIMARY KEY,
  changelog_id TEXT REFERENCES changelogs(id) ON DELETE CASCADE,
  locale       TEXT NOT NULL,
  content      JSONB NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE (changelog_id, locale)   -- prevents duplicate translations under any concurrent load
);
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste any public GitHub URL.

### 5. Reset the database (if needed)

```sql
-- Translations first — foreign key constraint
DELETE FROM translations;
DELETE FROM changelogs;
```

---

## Architecture

Three levels of depth — skip to whichever you want.

---

### Level 1 — The Big Picture

```
GitHub URL
    ↓
Fetch real file diffs in parallel (not just commit messages)
    ↓
Gemini reads raw code → structured changelog with titles + impact descriptions
    ↓
Returned to user instantly
    ↓
Database saves in background (non-blocking, fire-and-forget)
    ↓
User requests translation → Lingo.dev translates once → cached forever in Neon
    ↓
Every future visitor gets cached translation → 0ms, $0
    ↓
Knowledge Graph built from same diff data → visual, interactive, multilingual
```

---

### Level 2 — How Each Piece Works

**Generation pipeline**

The server fetches the last 20 commits from GitHub, then fetches the full file diff for each of the top 8 commits in parallel. That raw patch context is sent to Gemini with a structured prompt asking for a release headline, per-entry titles, and impact descriptions grouped into Added, Fixed, Changed, and Breaking sections. The moment Gemini responds, the changelog is returned to the client. The database save runs in a fire-and-forget background block — the user never waits for it.

**Translation as first-class data**

Translations are not a layer on top of the English content. Each locale is stored as its own complete `TranslatedContent` bundle in the `translations` table — a full copy of every title, every description, every section header, in that language. The `raw` field (git commit messages) is deliberately excluded from translation and restored from the English source after translation. This saves API tokens and keeps internal matching keys stable in English.

Switching language on the client is a state swap from a pre-loaded in-memory cache. No network request. No loading state. Instant.

**Knowledge Graph**

The graph is built entirely server-side from the same commit diff data used for the changelog. Files are grouped into packages, scored by churn (how many commits touched them in this release), and positioned using a custom radial layout algorithm. React Flow receives a ready-to-render node and edge array — no layout computation happens in the browser. AI explanations are completely lazy — Gemini is only called when a user explicitly clicks Explain on a specific node, and the result is stored in that node's local state so it never runs twice.

**Race condition handling**

Because the DB save is non-blocking, a user landing on `/changelog/[id]` immediately after generation could hit a 404 before the save completes. The server component detects `?new=1` in the URL and retries the database lookup up to 6 times at 1-second intervals before returning not found. A loading skeleton shows during retries. The user never sees a broken page.

---

### Level 3 — Implementation Details

**Parallel diff fetching**

```typescript
// lib/github.ts
const detailedCommits = await Promise.all(
  commits.slice(0, 8).map(c => fetchCommitDetails(owner, repo, c.sha))
);
// fetching 8 commits in parallel cuts fetch time by ~7x vs sequential
```

**Gemini structured output with graceful fallback**

```typescript
// lib/gemini.ts — enforces exact JSON schema in system prompt
const schema = {
  title:   string,                    // AI-generated release headline
  version: string,
  tone:    "technical" | "casual",
  sections: {
    added:    [{ title, description, raw }],
    fixed:    [{ title, description, raw }],
    changed:  [{ title, description, raw }],
    breaking: [{ title, description, raw }],
  }
}
// If Gemini omits a title → parser falls back to "Update" gracefully
// If Gemini returns malformed JSON → caught and re-prompted once
```

**Lingo.dev flattening — raw field exclusion**

```typescript
// lib/lingo.ts
function flattenContent(content: TranslatedContent): Record<string, string> {
  const flat: Record<string, string> = {};
  flat["release.title"] = content.title;
  for (const [section, entries] of Object.entries(content.sections)) {
    entries.forEach((entry, i) => {
      flat[`${section}.${i}.title`]       = entry.title;
      flat[`${section}.${i}.description`] = entry.description;
      // raw deliberately excluded — contains git SHAs, PR numbers, internal IDs
      // restored from English source after translation
      // saves tokens + keeps index-based matching stable
    });
  }
  return flat;
}
```

**Non-blocking DB save with correct FK ordering**

```typescript
// app/api/generate/route.ts
return NextResponse.json({ id, ...changelogData }); // user gets response immediately

void (async () => {
  await saveChangelog({ id, repoUrl, repoName, version, tone }); // parent row first
  await saveEnglishContent(id, sections);                         // child row second — FK constraint
})().catch(err => console.error("[generate] DB save failed:", err));

// sequential order inside the block is intentional
// saveEnglishContent has a foreign key on changelog_id
// if run in parallel, the child insert could arrive before the parent
```

**Retry loop — 404-proof fresh changelogs**

```typescript
// app/changelog/[id]/page.tsx
async function fetchWithRetry(id: string, isNew: boolean) {
  const attempts = isNew ? 6 : 1;   // only retry on fresh changelogs
  for (let i = 0; i < attempts; i++) {
    const result = await getChangelogById(id);
    if (result) return result;
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;   // after 6s, show not found
}
```

**Radial graph layout — pure trigonometry, zero dependencies**

```typescript
// lib/graph.ts — no dagre, no elk, no layout library
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// packages evenly distributed around root at ring 1
const pkgAngle = (pkgIdx / totalPackages) * 360;
const pkgPos   = polar(0, 0, 260, pkgAngle);

// files clustered around their package angle at ring 2
const fileAngle = pkgAngle + spreadOffset;
const filePos   = polar(0, 0, 480, fileAngle);

// result: clean solar system layout, zero overlaps, any number of packages
```

**Index-based translation matching — language-agnostic**

```typescript
// GraphClient.tsx
// String matching breaks because translation changes text completely
// Array position never changes regardless of language or script

const englishIndex   = allTranslations["en"].findIndex(e => e === node.label);
const translatedLabel = allTranslations[targetLocale][englishIndex];

// works for any language including RTL scripts (Arabic)
// resilient to any translation output — the math is language-agnostic
```

**Lazy AI node explanation — zero cost on page load**

```typescript
// app/api/explain-node/route.ts + GraphClient.tsx
// Gemini is never called on page load — only on explicit user click
// result stored in node state — never calls Gemini twice for the same node

const handleExplain = async (nodeId: string, patch: string) => {
  const res = await fetch("/api/explain-node", {
    body: JSON.stringify({ patch, locale: currentLocale }) // native language output
  });
  setNodes(nds => nds.map(n =>
    n.id === nodeId
      ? { ...n, data: { ...n.data, aiExplanation: res.explanation } }
      : n
  ));
};
```

**Browser bundle safety — server-only code never leaks to client**

```typescript
// lib/lingo.ts      — server only (uses jsdom, child_process via Lingo.dev SDK)
// lib/lingo-client.ts — browser safe (constants only, no SDK imports)

// next.config.ts
serverExternalPackages: ["lingo.dev", "@lingo.dev/sdk", "jsdom", "ws"]

// All client components import from lingo-client, never from lingo
// Prevents "Module not found" errors in the browser bundle
```

---

## Lingo.dev Integration

Lingo.dev is used at every layer of PushNotes:

| Layer | How Lingo.dev is used |
|---|---|
| **SDK (Runtime)** | Translates `TranslatedContent` bundles via the API — powers all 10+ language translations at runtime |
| **CLI (Development)** | Used locally during development to test translation output and iterate on the flatten/unflatten logic before deploying |
| **MCP (Development)** | Used during development to call Lingo.dev APIs directly from the AI coding assistant while building and debugging the translation pipeline |
| **CI/CD (Automation)** | GitHub Action in `.github/workflows/lingo.yml` auto-translates static UI strings on every push to main |

This is not a project that uses Lingo.dev as a checkbox. The entire data model — how content is structured, how it is flattened, how it is cached, how it is served — was designed around Lingo.dev from the first line of code.

---

## Supported Languages

| Language | Code | Native Name |
|---|---|---|
| English | `en` | English |
| Hindi | `hi` | हिन्दी |
| Spanish | `es` | Español |
| French | `fr` | Français |
| Japanese | `ja` | 日本語 |
| German | `de` | Deutsch |
| Arabic | `ar` | العربية (RTL supported) |
| Portuguese | `pt` | Português |
| Chinese (Simplified) | `zh` | 中文 |
| Korean | `ko` | 한국어 |

---

## Built For

**[Lingo.dev Multilingual Hackathon #3](https://lingo.dev)**

---

## Built By

**Mehul Ligade** — [github.com/mehulcode12](https://github.com/mehulcode12)

---

## License

MIT