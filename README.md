# 📝 PushNotes
### Multilingual release notes on every push

> Paste any public GitHub repo URL → get a beautiful, AI-generated changelog in 10+ languages. Instantly.

---

## 🌍 What is PushNotes?

**PushNotes** is an AI-powered changelog generator that reads your GitHub commits and pull requests, turns them into clean human-readable release notes, translates them into 10+ languages — and visualizes them as an **interactive multilingual mindmap**.

No login. No OAuth. No credit card. Just paste a GitHub URL and go.

---

## ✨ Features

- 🔗 **Paste any public GitHub URL** — no authentication required
- 🤖 **AI-powered summarization** — raw commits → readable `Added`, `Fixed`, `Changed` sections
- 🧠 **Tone Detection** — matches the writing style of the repo's own docs (formal vs casual)
- 🗺️ **Interactive Mindmap View** — visualize your entire release as a beautiful, zoomable mindmap
- 🌐 **Multilingual Mindmap** — every mindmap node translates live when you switch language
- 🔄 **Live Language Switcher** — instantly switch between 10+ languages on the changelog page
- 🌍 **Global Reach Score** — see what % of the world's developers your changelog now reaches
- 🔗 **Shareable per-language URLs** — e.g. `/changelog/react?lang=ja` for Japanese
- 📦 **Embeddable Widget** — drop a `<script>` tag into any website to show a floating translated changelog popup
- 🏷️ **Smart Version Tagging** — auto-detects semver from commit prefixes (`feat:`, `fix:`, `BREAKING:`)
- 💾 **Cached Results** — previously generated changelogs are stored and instantly served

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend + Backend | Next.js (App Router) |
| Database | Neon (Serverless Postgres) |
| AI Summarizer | Google Gemini API |
| Localization | **Lingo.dev CLI + Compiler + MCP + CI/CD** |
| Mindmap Rendering | React Flow / D3.js |
| Hosting | Vercel |
| Data Source | GitHub Public API |

> 💡 100% free stack — no credit card required anywhere.

---

## 🌐 Supported Languages

English • Hindi • Spanish • French • Japanese • German • Arabic • Portuguese • Chinese • Korean

---

## 🏆 Built For

**Lingo.dev Multilingual Hackathon #3**

## 🙌 Built By

**Mehul Ligade - mehulcode12**

---

## 📄 License

MIT
