// GitHub Analytics Fetcher
// Modules:
//   parseGitHubUrl()   — validates + parses any GitHub URL format
//   fetchRepoMeta()    — repo name, stars, language, topics
//   fetchCommits()     — last N commits with author + message
//   fetchMergedPRs()   — recently merged PRs with labels
//   fetchLatestRelease() — latest release tag for version detection
//   fetchReadme()      — raw README text for tone detection in Gemini
//   fetchRepoAnalytics() — single call combining all of the above
