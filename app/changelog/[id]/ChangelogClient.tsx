"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ChangelogSections } from "@/lib/gemini";
import type { ChangelogRecord } from "@/lib/db";
import {
  type SupportedLocale,
  SUPPORTED_LOCALES,
  calculateGlobalReachScore,
  getTranslatableLocales,
} from "@/lib/lingo-client";
import { type TranslatedContent } from "@/lib/db";

interface Props {
  id: string;
  changelog: ChangelogRecord;
  initialContent: TranslatedContent;
  initialLocale: string;
  translatedLocales: string[];
  allTranslations: Record<string, TranslatedContent>;
}

type TranslateStatus = "idle" | "translating" | "done" | "error";

const VOICE_LANGS: Record<string, string> = {
  en: "en-US", hi: "hi-IN", es: "es-ES", fr: "fr-FR",
  ja: "ja-JP", de: "de-DE", ar: "ar-SA", pt: "pt-BR",
  zh: "zh-CN", ko: "ko-KR",
};

const SECTION_CONFIG = [
  { key: "added", label: "Added", color: "#22c55e", bg: "rgba(34,197,94,0.06)", border: "rgba(34,197,94,0.15)" },
  { key: "fixed", label: "Fixed", color: "#3b82f6", bg: "rgba(59,130,246,0.06)", border: "rgba(59,130,246,0.15)" },
  { key: "changed", label: "Changed", color: "#f59e0b", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
  { key: "breaking", label: "Breaking", color: "#ef4444", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.15)" },
];

export default function ChangelogClient({
  id,
  changelog,
  initialContent,
  initialLocale,
  translatedLocales: initialTranslated,
  allTranslations: initialAllTranslations,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [toast, setToast] = useState<"saving" | "saved" | "hidden">(() =>
    searchParams.get("new") === "1" ? "saving" : "hidden"
  );

  useEffect(() => {
    if (toast !== "saving") return;
    const t1 = setTimeout(() => setToast("saved"), 2500);
    const t2 = setTimeout(() => setToast("hidden"), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [toast]);

  const [title, setTitle] = useState<string>(initialContent?.title ?? "New Update");
  const [sections, setSections] = useState<ChangelogSections>(initialContent?.sections ?? { added: [], fixed: [], changed: [], breaking: [] });
  const [locale, setLocale] = useState<string>(initialLocale ?? "en");
  const [translated, setTranslated] = useState<string[]>(initialTranslated ?? []);
  const [allTranslations, setAllTranslations] = useState<Record<string, TranslatedContent>>(initialAllTranslations);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  const [transStatus, setTransStatus] = useState<Record<string, TranslateStatus>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [embedOpen, setEmbedOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const reachScore = calculateGlobalReachScore((translated ?? []).filter(l => l !== "en") as SupportedLocale[]);
  const totalEntries = Object.values(sections ?? {}).flat().length;
  const translatableLocales = getTranslatableLocales();

  async function switchLocale(newLocale: string) {
    if (newLocale === locale) return;

    // Instant switch from local cache
    const target = allTranslations[newLocale];
    if (target) {
      setTitle(target.title);
      setSections(target.sections);
      setLocale(newLocale);
      // Sync URL in background
      router.replace(`/changelog/${id}?lang=${newLocale}`, { scroll: false });
    }
  }

  async function handleTranslate() {
    if (selectedLangs.length === 0) return;
    setIsTranslating(true);
    const statusMap: Record<string, TranslateStatus> = {};
    selectedLangs.forEach(l => { statusMap[l] = "translating"; });
    setTransStatus(statusMap);
    try {
      const res = await fetch("/api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changelogId: id, locales: selectedLangs }),
      });
      const data = await res.json();
      const newStatus: Record<string, TranslateStatus> = {};
      selectedLangs.forEach(l => { newStatus[l] = data.translations?.[l] ? "done" : "error"; });
      setTransStatus(newStatus);

      // Update local cache
      setAllTranslations(prev => ({ ...prev, ...data.translations }));
      setTranslated(data.translatedLocales ?? translated);
    } catch {
      const errStatus: Record<string, TranslateStatus> = {};
      selectedLangs.forEach(l => { errStatus[l] = "error"; });
      setTransStatus(errStatus);
    }
    setIsTranslating(false);
    setSelectedLangs([]);
    setTimeout(() => { setPickerOpen(false); setTransStatus({}); }, 1500);
  }

  function speak(text: string, entryId: string) {
    if (!("speechSynthesis" in window)) return;
    if (speaking === entryId) {
      window.speechSynthesis.cancel();
      setSpeaking(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = VOICE_LANGS[locale] ?? "en-US";
    utterance.rate = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const langCode = VOICE_LANGS[locale] ?? "en-US";
    const best = voices.find(v => v.lang === langCode && v.name.toLowerCase().includes("google"))
      ?? voices.find(v => v.lang.startsWith(langCode.slice(0, 2)));
    if (best) utterance.voice = best;
    utterance.onend = () => setSpeaking(null);
    utterance.onerror = () => setSpeaking(null);
    utteranceRef.current = utterance;
    setSpeaking(entryId);
    window.speechSynthesis.speak(utterance);
  }

  function toggleEntry(entryId: string) {
    setExpanded(prev => ({ ...prev, [entryId]: !prev[entryId] }));
  }

  function copyEmbed() {
    navigator.clipboard.writeText(
      `<script src="${window.location.origin}/embed.js" data-changelog="${id}"></script>`
    );
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  function copyShareUrl() {
    navigator.clipboard.writeText(
      `${window.location.origin}/changelog/${id}${locale !== "en" ? `?lang=${locale}` : ""}`
    );
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Instrument+Serif:ital@0;1&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg:#0a0a0a; --surface:#111; --surface2:#161616;
          --border:#1f1f1f; --border2:#2a2a2a;
          --amber:#f59e0b; --text:#e5e5e5; --muted:#525252;
          --green:#22c55e; --blue:#3b82f6; --red:#ef4444;
        }
        body { background:var(--bg); color:var(--text); font-family:'JetBrains Mono',monospace; min-height:100vh; }
        body::before {
          content:''; position:fixed; inset:0;
          background-image:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px);
          background-size:48px 48px; pointer-events:none; z-index:0; opacity:0.5;
        }
        .toast { position:fixed; top:20px; right:20px; z-index:999; display:flex; align-items:center; gap:10px; padding:12px 16px; border-radius:8px; font-size:12px; font-family:'JetBrains Mono',monospace; backdrop-filter:blur(12px); box-shadow:0 8px 24px rgba(0,0,0,0.4); cursor:pointer; }
        .toast.saving { background:rgba(17,17,17,0.95); border:1px solid rgba(245,158,11,0.3); color:var(--amber); }
        .toast.saved { background:rgba(17,17,17,0.95); border:1px solid rgba(34,197,94,0.3); color:var(--green); }
        .toast-spinner { width:14px; height:14px; border:2px solid rgba(245,158,11,0.3); border-top-color:var(--amber); border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0; }
        .page { position:relative; z-index:1; max-width:780px; margin:0 auto; padding:32px 24px 80px; }
        .nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:40px; padding-bottom:20px; border-bottom:1px solid var(--border); }
        .nav-logo { font-size:13px; font-weight:700; color:var(--amber); text-decoration:none; letter-spacing:0.05em; }
        .nav-right { display:flex; gap:8px; }
        .nav-btn { background:transparent; border:1px solid var(--border); color:var(--muted); font-family:'JetBrains Mono',monospace; font-size:11px; padding:6px 12px; border-radius:6px; cursor:pointer; transition:all 0.15s; }
        .nav-btn:hover { border-color:var(--border2); color:var(--text); }
        .nav-btn.primary { border-color:var(--amber); color:var(--amber); }
        .nav-btn.primary:hover { background:rgba(245,158,11,0.08); }
        .cl-header { margin-bottom:32px; }
        .repo-name { font-family:'Instrument Serif',serif; font-size:36px; font-weight:400; color:#fff; margin-bottom:12px; line-height:1.1; }
        .meta-row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
        .meta-tag { display:inline-flex; align-items:center; gap:6px; font-size:11px; color:var(--muted); letter-spacing:0.05em; }
        .version-badge { background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.2); color:#60a5fa; font-size:11px; padding:3px 10px; border-radius:100px; font-weight:700; letter-spacing:0.05em; }
        .repo-badge { background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2); color:var(--amber); font-size:11px; padding:3px 10px; border-radius:100px; font-weight:700; letter-spacing:0.05em; }
        .tone-badge { background:rgba(255,255,255,0.04); border:1px solid var(--border); color:var(--muted); font-size:11px; padding:3px 10px; border-radius:100px; }
        .reach-bar { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:16px 20px; margin-bottom:24px; display:flex; align-items:center; gap:16px; }
        .reach-label { font-size:11px; color:var(--muted); white-space:nowrap; }
        .reach-track { flex:1; height:4px; background:var(--border); border-radius:2px; overflow:hidden; }
        .reach-fill { height:100%; background:linear-gradient(90deg,var(--amber),#22c55e); border-radius:2px; transition:width 0.6s ease; }
        .reach-score { font-size:20px; font-weight:700; color:var(--amber); white-space:nowrap; }
        .reach-sub { font-size:10px; color:var(--muted); }
        .toolbar { display:flex; gap:8px; margin-bottom:28px; flex-wrap:wrap; align-items:center; }
        .lang-switcher { background:var(--surface); border:1px solid var(--border); color:var(--text); font-family:'JetBrains Mono',monospace; font-size:12px; padding:8px 12px; border-radius:6px; cursor:pointer; outline:none; }
        .translate-btn {
            background: linear-gradient(180deg, rgba(245,158,11,0.1) 0%, rgba(245,158,11,0) 100%);
            border: 1px solid rgba(245,158,11,0.25); border-top-color: rgba(245,158,11,0.5);
            color: #f59e0b; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700;
            padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            display: inline-flex; align-items: center; gap: 6px; position: relative; overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05); text-transform: uppercase; letter-spacing: 0.05em;
        }
        .translate-btn::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1.5px; opacity: 0; transition: opacity 0.3s ease;
            background: linear-gradient(90deg, transparent, rgba(245,158,11,0.6), transparent);
        }
        .translate-btn:hover {
            background: linear-gradient(180deg, rgba(245,158,11,0.2) 0%, rgba(245,158,11,0.05) 100%);
            border-color: rgba(245,158,11,0.4); border-top-color: rgba(245,158,11,0.8); color: #fbbf24;
            box-shadow: 0 6px 20px rgba(245,158,11,0.2), 0 0 12px rgba(245,158,11,0.1); transform: translateY(-1px);
        }
        .translate-btn:hover::before { opacity: 1; }
        .translate-btn:active { transform: translateY(1px); box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
        .translate-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        
        .graph-btn {
            background: linear-gradient(180deg, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0) 100%);
            border: 1px solid rgba(59,130,246,0.25); border-top-color: rgba(59,130,246,0.5);
            color: #3b82f6; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700;
            padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            display: inline-flex; align-items: center; gap: 6px; text-decoration: none; position: relative; overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05); text-transform: uppercase; letter-spacing: 0.05em;
        }
        .graph-btn::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1.5px; opacity: 0; transition: opacity 0.3s ease;
            background: linear-gradient(90deg, transparent, rgba(59,130,246,0.6), transparent);
        }
        .graph-btn:hover {
            background: linear-gradient(180deg, rgba(59,130,246,0.2) 0%, rgba(59,130,246,0.05) 100%);
            border-color: rgba(59,130,246,0.4); border-top-color: rgba(59,130,246,0.8); color: #60a5fa;
            box-shadow: 0 6px 20px rgba(59,130,246,0.2), 0 0 12px rgba(59,130,246,0.1); transform: translateY(-1px);
        }
        .graph-btn:hover::before { opacity: 1; }
        .graph-btn:active { transform: translateY(1px); box-shadow: 0 1px 4px rgba(0,0,0,0.4); }

        .btn-icon { font-size: 14px; transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .translate-btn:hover .btn-icon { transform: scale(1.15) rotate(15deg); }
        .graph-btn:hover .btn-icon { transform: scale(1.15) rotate(5deg); }
        .picker-panel { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:20px; margin-bottom:24px; }
        .picker-title { font-size:12px; color:var(--muted); margin-bottom:16px; }
        .picker-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:8px; margin-bottom:16px; }
        .lang-option { display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--surface2); border:1px solid var(--border); border-radius:6px; cursor:pointer; transition:all 0.15s; font-size:12px; }
        .lang-option:hover { border-color:var(--border2); }
        .lang-option.selected { border-color:var(--amber); background:rgba(245,158,11,0.08); color:var(--amber); }
        .lang-option.already-done { border-color:rgba(34,197,94,0.3); color:var(--green); opacity:0.7; cursor:default; }
        .lang-status { margin-left:auto; font-size:11px; }
        .picker-actions { display:flex; gap:8px; justify-content:flex-end; }
        .cancel-btn { background:transparent; border:1px solid var(--border); color:var(--muted); font-family:'JetBrains Mono',monospace; font-size:12px; padding:8px 16px; border-radius:6px; cursor:pointer; }
        .confirm-btn { background:var(--amber); color:#000; border:none; font-family:'JetBrains Mono',monospace; font-size:12px; font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer; }
        .confirm-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .section { margin-bottom:32px; }
        .section-header { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
        .section-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .section-label { font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; }
        .section-count { font-size:11px; color:var(--muted); }
        .entry { display:flex; align-items:flex-start; gap:12px; padding:14px 16px; border-radius:8px; margin-bottom:6px; border:1px solid; transition:all 0.15s; }
        .entry:hover { filter:brightness(1.08); }
        .entry-text { flex:1; line-height:1.6; color:var(--text); cursor:pointer; }
        .entry-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:4px; }
        .entry-title { font-weight:700; font-size:14px; color:#fff; }
        .entry-desc { font-size:13px; color:var(--text); opacity:0.9; }
        .entry-preview { font-size:13px; color:var(--text); opacity:0.8; }
        .entry-toggle { color:var(--amber); font-size:11px; white-space:nowrap; margin-top:2px; }
        .entry-full { margin-top:4px; }
        .entry-raw { font-size:10px; color:var(--muted); margin-top:8px; font-style:italic; padding-top:6px; border-top:1px solid var(--border); }
        .tts-btn { background:transparent; border:none; cursor:pointer; color:var(--muted); font-size:14px; padding:2px; flex-shrink:0; transition:color 0.15s; margin-top:2px; display:flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:4px; }
        .tts-btn:hover { color:var(--text); background:rgba(255,255,255,0.05); }
        .tts-btn.speaking { color:var(--amber); animation:tts-pulse 1s infinite; }
        @keyframes tts-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:100; padding:24px; }
        .modal { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:28px; max-width:520px; width:100%; }
        .modal-title { font-size:16px; font-weight:700; margin-bottom:8px; }
        .modal-desc { font-size:12px; color:var(--muted); margin-bottom:20px; line-height:1.6; }
        .code-block { background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:14px 16px; font-size:11px; color:var(--amber); word-break:break-all; line-height:1.6; margin-bottom:16px; }
        .modal-actions { display:flex; gap:8px; justify-content:flex-end; }
        .cl-footer { margin-top:48px; padding-top:24px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--muted); flex-wrap:wrap; gap:8px; }
        .cl-footer a { color:var(--amber); text-decoration:none; }
        @media(max-width:600px){ .repo-name{font-size:26px;} .reach-bar{flex-wrap:wrap;} .picker-grid{grid-template-columns:1fr 1fr;} }
      `}</style>

      {toast !== "hidden" && (
        <div className={`toast ${toast}`} onClick={() => setToast("hidden")}>
          {toast === "saving" ? (
            <><div className="toast-spinner" /> Saving to database... <span style={{ marginLeft: 4, opacity: 0.5 }}>✕</span></>
          ) : (
            <>✓ Saved — future lookups will be instant <span style={{ marginLeft: 4, opacity: 0.5 }}>✕</span></>
          )}
        </div>
      )}
      <div className="page">
        {/* Nav */}
        <nav className="nav">
          <a href="/" className="nav-logo">PUSHNOTES</a>
          <div className="nav-right">
            <button className="nav-btn" onClick={copyShareUrl}>{copied ? "✓ Copied!" : "Share ↗"}</button>
            <button className="nav-btn primary" onClick={() => setEmbedOpen(true)}>{"</>"} Embed</button>
          </div>
        </nav>

        {/* Header */}
        <div className="cl-header">
          <h1 className="repo-name">{title}</h1>
          <div className="meta-row">
            <span className="repo-badge">{changelog.repoName}</span>
            <span className="version-badge">{changelog.version}</span>
            <span className="tone-badge">{changelog.tone}</span>
            <span className="meta-tag">
              🕐 {new Date(changelog.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <span className="meta-tag">📝 {totalEntries} change{totalEntries !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Global Reach Score */}
        <div className="reach-bar">
          <div>
            <div className="reach-label">🌍 Global Dev Reach</div>
            <div className="reach-sub">% of world's developers who can read this</div>
          </div>
          <div className="reach-track">
            <div className="reach-fill" style={{ width: `${reachScore}%` }} />
          </div>
          <div>
            <div className="reach-score">{reachScore}%</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          {translated.length > 1 && (
            <select className="lang-switcher" value={locale} onChange={e => switchLocale(e.target.value)}>
              {translated.map(l => (
                <option key={l} value={l}>
                  {SUPPORTED_LOCALES[l as SupportedLocale]?.nativeName ?? l}{l === "en" ? " (source)" : ""}
                </option>
              ))}
            </select>
          )}
          <a
            href={`/changelog/${id}/graph`}
            className="graph-btn"
          >
            <span className="btn-icon">🗺️</span> ChangeLog Graph
          </a>
          <button className="translate-btn" onClick={() => setPickerOpen(!pickerOpen)} disabled={isTranslating}>
            {pickerOpen ? <><span className="btn-icon">✕</span> Close</> : <><span className="btn-icon">🌍</span> Translate</>}
          </button>
        </div>

        {/* Language Picker */}
        {pickerOpen && (
          <div className="picker-panel">
            <div className="picker-title">Select languages to translate into:</div>
            <div className="picker-grid">
              {translatableLocales.map(info => {
                const isDone = translated.includes(info.code) && info.code !== "en";
                const isSelected = selectedLangs.includes(info.code);
                const status = transStatus[info.code];
                return (
                  <div
                    key={info.code}
                    className={`lang-option ${isSelected ? "selected" : ""} ${isDone ? "already-done" : ""}`}
                    onClick={() => {
                      if (isDone || isTranslating) return;
                      setSelectedLangs(prev => prev.includes(info.code) ? prev.filter(l => l !== info.code) : [...prev, info.code]);
                    }}
                  >
                    <span>{info.nativeName}</span>
                    <span style={{ fontSize: "10px", color: "var(--muted)" }}>{info.code}</span>
                    <span className="lang-status">
                      {status === "translating" ? "⏳" : status === "done" ? "✅" : status === "error" ? "❌" : isDone ? "✓" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="picker-actions">
              <button className="cancel-btn" onClick={() => { setPickerOpen(false); setSelectedLangs([]); }}>Cancel</button>
              <button className="confirm-btn" onClick={handleTranslate} disabled={selectedLangs.length === 0 || isTranslating}>
                {isTranslating ? "Translating..." : `Translate${selectedLangs.length > 0 ? ` (${selectedLangs.length})` : ""} →`}
              </button>
            </div>
          </div>
        )}

        {/* Sections */}
        {SECTION_CONFIG.map(({ key, label, color, bg, border }) => {
          const entries = (sections ?? {})[key as keyof ChangelogSections] ?? [];
          if (entries.length === 0) return null;
          return (
            <div key={key} className="section">
              <div className="section-header">
                <div className="section-dot" style={{ background: color }} />
                <span className="section-label" style={{ color }}>{label}</span>
                <span className="section-count">{entries.length}</span>
              </div>
              {entries.map((entry, i) => {
                const entryId = `${key}-${i}`;
                const isOpen = expanded[entryId] ?? false;
                const isLong = entry.text.length > 100;
                const preview = isLong ? entry.text.slice(0, 100).trimEnd() + "…" : entry.text;

                return (
                  <div key={i} className="entry" style={{ backgroundColor: bg, borderColor: border }}>
                    <div className="entry-text" onClick={() => isLong && toggleEntry(entryId)}>
                      <div className="entry-title-row">
                        <span className="entry-title">{entry.title}</span>
                        {isLong && (
                          <span className="entry-toggle">{isOpen ? "▲ less" : "▼ more"}</span>
                        )}
                      </div>

                      {!isOpen && (
                        <div className="entry-preview">{preview}</div>
                      )}

                      {isOpen && (
                        <div className="entry-full">
                          <div className="entry-desc">{entry.text}</div>
                          <div className="entry-raw">{entry.raw}</div>
                        </div>
                      )}
                    </div>
                    <button
                      className={`tts-btn ${speaking === entryId ? "speaking" : ""}`}
                      onClick={() => speak(entry.text, entryId)}
                      title={speaking === entryId ? "Stop" : "Read aloud"}
                    >
                      {speaking === entryId ? "⏸" : "🔊"}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Footer */}
        <div className="cl-footer">
          <span>Generated by <a href="/">PushNotes</a> · Translated by <a href="https://lingo.dev" target="_blank">Lingo.dev</a></span>
          <a href="/">← Generate another</a>
        </div>
      </div>

      {/* Embed Modal */}
      {embedOpen && (
        <div className="modal-overlay" onClick={() => setEmbedOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Embed this changelog</div>
            <div className="modal-desc">Add this script tag to your website to show a floating changelog widget.</div>
            <div className="code-block">
              {`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/embed.js" data-changelog="${id}"></script>`}
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setEmbedOpen(false)}>Close</button>
              <button className="confirm-btn" onClick={copyEmbed}>{copied ? "✓ Copied!" : "Copy code"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
