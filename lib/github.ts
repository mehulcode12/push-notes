// ============================================================
// lib/github.ts — PushNotes GitHub Analytics Fetcher
// ============================================================

// This module handles everything related to GitHub data fetching.
// It's designed to be modular — each function does one job only.
// fetchRepoAnalytics() is the main entry point used by the API route.

const GITHUB_API = "https://api.github.com";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface RepoMeta {
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  defaultBranch: string;
  topics: string[];
}

export interface Commit {
  sha: string;
  shortMessage: string;
  author: string;
  date: string;
  filesChanged?: { filename: string; additions: number; deletions: number; patch?: string }[];
}

export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  mergedAt: string;
  labels: string[];
}

export interface Release {
  tagName: string;
  publishedAt: string;
}

export interface RepoAnalytics {
  meta: RepoMeta;
  commits: Commit[];
  pullRequests: PullRequest[];
  latestRelease: Release | null;
  readme: string | null;
}

export interface ParsedRepoUrl {
  owner: string;
  repo: string;
}

// ─────────────────────────────────────────────
// UTILITY — Parse GitHub URL
// Accepts:
//   https://github.com/facebook/react
//   github.com/facebook/react
//   facebook/react
// ─────────────────────────────────────────────

// Accepts any GitHub URL format the user might paste —
// handles messy inputs gracefully instead of crashing.
export function parseGitHubUrl(input: string): ParsedRepoUrl {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^github\.com\//, "")
    .replace(/\/$/, "");

  const parts = cleaned.split("/").filter(Boolean);

  if (parts.length < 2) {
    throw new Error(
      `Invalid GitHub URL: "${input}". Expected format: github.com/owner/repo`
    );
  }

  return {
    owner: parts[0],
    repo: parts[1],
  };
}

// ─────────────────────────────────────────────
// UTILITY — Shared fetch with auth headers
// ─────────────────────────────────────────────

// Central fetch utility — all GitHub API calls go through here.
// Handles auth token (optional), rate limiting, and 404 errors in one place.
// Without a token: 60 requests/hr. With token: 5000 requests/hr.

async function githubFetch(endpoint: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  }

  const res = await fetch(`${GITHUB_API}${endpoint}`, { headers });

  if (res.status === 404) {
    throw new Error(`Repository not found. Make sure the repo is public.`);
  }

  if (res.status === 403) {
    const reset = res.headers.get("X-RateLimit-Reset");
    const resetTime = reset
      ? new Date(parseInt(reset) * 1000).toLocaleTimeString()
      : "soon";
    throw new Error(`GitHub API rate limit exceeded. Resets at ${resetTime}.`);
  }

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ─────────────────────────────────────────────
// FETCHERS
// ─────────────────────────────────────────────

// 1. Repo metadata
export async function fetchRepoMeta(
  owner: string,
  repo: string
): Promise<RepoMeta> {
  const data = await githubFetch(`/repos/${owner}/${repo}`);

  return {
    owner,
    repo,
    fullName: data.full_name,
    description: data.description,
    language: data.language,
    stars: data.stargazers_count,
    forks: data.forks_count,
    defaultBranch: data.default_branch,
    topics: data.topics ?? [],
  };
}

// 2. Recent commits (last 20)
// Fetches last 20 commits — enough to capture recent activity without overwhelming the API for Demo.
async function fetchCommitDetails(owner: string, repo: string, sha: string) {
  try {
    const data = await githubFetch(`/repos/${owner}/${repo}/commits/${sha}`);
    return (data.files ?? []).map((f: any) => ({
      filename:  f.filename,
      additions: f.additions,
      deletions: f.deletions,
      patch:     f.patch ? f.patch.slice(0, 300) : undefined,
    }));
  } catch {
    return [];
  }
}

export async function fetchCommits(
  owner: string,
  repo: string,
  limit = 20
): Promise<Commit[]> {
  const data = await githubFetch(
    `/repos/${owner}/${repo}/commits?per_page=${limit}`
  );

  const commits = data.map((item: any) => ({
    sha: item.sha,
    shortMessage: (item.commit.message ?? "").split("\n")[0].trim(),
    author: item.commit.author?.name ?? item.author?.login ?? "Unknown",
    date: item.commit.author?.date ?? "",
  }));

  const withDetails = await Promise.all(
    commits.slice(0, 8).map(async (c: Commit) => ({
      ...c,
      filesChanged: await fetchCommitDetails(owner, repo, c.sha),
    }))
  );

  return [...withDetails, ...commits.slice(8)];
}

// 3. Recently merged PRs (last 10)
// Only fetches MERGED PRs — open or closed-without-merge are irrelevant
// for changelog generation since they didn't ship to users.

export async function fetchMergedPRs(
  owner: string,
  repo: string,
  limit = 10
): Promise<PullRequest[]> {
  const data = await githubFetch(
    `/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${limit}`
  );

  return data
    .filter((pr: any) => pr.merged_at !== null)
    .map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body,
      mergedAt: pr.merged_at,
      labels: pr.labels?.map((l: any) => l.name) ?? [],
    }));
}

// 4. Latest release (for version tagging)
export async function fetchLatestRelease(
  owner: string,
  repo: string
): Promise<Release | null> {
  try {
    const data = await githubFetch(`/repos/${owner}/${repo}/releases/latest`);
    return {
      tagName: data.tag_name,
      publishedAt: data.published_at,
    };
  } catch {
    return null;
  }
}

// 5. README (for tone detection in Gemini)
// README text is passed to Gemini for tone detection.
// We only need the first 3000 chars — the intro sets the tone.

export async function fetchReadme(
  owner: string,
  repo: string
): Promise<string | null> {
  try {
    const data = await githubFetch(`/repos/${owner}/${repo}/readme`);
    const decoded = Buffer.from(data.content, "base64").toString("utf-8");
    // trim to first 3000 chars — enough for tone detection
    return decoded.slice(0, 3000);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// MAIN — Single call combining all fetchers
// ─────────────────────────────────────────────

// Main function called by /api/generate route.
// Uses Promise.all to run all 5 fetches in PARALLEL —
// cutting total fetch time from  ~5s  sequential to  ~1s  parallel.

export async function fetchRepoAnalytics(
  rawUrl: string
): Promise<RepoAnalytics> {
  const { owner, repo } = parseGitHubUrl(rawUrl);

  // run all fetches in parallel for speed
  const [meta, commits, pullRequests, latestRelease, readme] =
    await Promise.all([
      fetchRepoMeta(owner, repo),
      fetchCommits(owner, repo),
      fetchMergedPRs(owner, repo),
      fetchLatestRelease(owner, repo),
      fetchReadme(owner, repo),
    ]);

  return { meta, commits, pullRequests, latestRelease, readme };
}
