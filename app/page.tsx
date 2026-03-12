// ============================================================
// app/page.tsx — PushNotes Landing Page
// Aesthetic: Dark terminal-editorial, amber accents, monospace
// ============================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Example repos for quick demo
const EXAMPLE_REPOS = [
  { label: "lingo.dev", url: "github.com/lingodotdev/lingo.dev" },
  { label: "next.js",   url: "github.com/vercel/next.js" },
  { label: "react",     url: "github.com/facebook/react" },
  { label: "vscode",    url: "github.com/microsoft/vscode" },
];

// Live step-by-step progress messages
const STEPS = [
  { id: "fetch",     label: "Fetching commits from GitHub..." },
  { id: "ai",        label: "Summarizing with Gemini AI..."   },
  { id: "save",      label: "Saving to database..."           },
  { id: "done",      label: "Done!"                           },
];

type Step = "idle" | "fetch" | "ai" | "save" | "done" | "error";

export default function Home() {
  const router = useRouter();
  const [url, setUrl]           = useState("");
  const [step, setStep]         = useState<Step>("idle");
  const [error, setError]       = useState<string | null>(null);

  async function handleGenerate(inputUrl?: string) {
    const target = (inputUrl ?? url).trim();
    if (!target) return;

    setError(null);
    setStep("fetch");

    try {
      // small delay so user sees each step
      await delay(600);
      setStep("ai");
      await delay(400);
      setStep("save");

      const res = await fetch("/api/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ url: target }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong");
      }

      setStep("done");
      await delay(500);

      // navigate to changelog page
      router.push(`/changelog/${data.id}`);

    } catch (err: any) {
      setStep("error");
      setError(err.message ?? "Failed to generate changelog");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleGenerate();
  }

  const isLoading = step !== "idle" && step !== "error";
  const currentStepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Instrument+Serif:ital@0;1&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:       #0a0a0a;
          --surface:  #111111;
          --border:   #1f1f1f;
          --amber:    #f59e0b;
          --amber-dim:#92400e;
          --text:     #e5e5e5;
          --muted:    #525252;
          --green:    #22c55e;
          --red:      #ef4444;
        }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'JetBrains Mono', monospace;
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* grid background */
        body::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          z-index: 0;
        }

        /* amber glow top center */
        body::after {
          content: '';
          position: fixed;
          top: -200px;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 400px;
          background: radial-gradient(ellipse, rgba(245,158,11,0.12) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .wrapper {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          gap: 0;
        }

        /* ── HEADER ── */
        .header {
          text-align: center;
          margin-bottom: 56px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(245,158,11,0.08);
          border: 1px solid rgba(245,158,11,0.2);
          color: var(--amber);
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 6px 14px;
          border-radius: 100px;
          margin-bottom: 32px;
        }

        .badge::before {
          content: '';
          width: 6px;
          height: 6px;
          background: var(--amber);
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }

        .headline {
          font-family: 'Instrument Serif', serif;
          font-size: clamp(42px, 6vw, 80px);
          font-weight: 400;
          line-height: 1.05;
          letter-spacing: -0.02em;
          color: #fff;
          margin-bottom: 20px;
        }

        .headline em {
          font-style: italic;
          color: var(--amber);
        }

        .subline {
          font-size: 14px;
          color: var(--muted);
          line-height: 1.7;
          max-width: 420px;
          margin: 0 auto;
          font-family: 'JetBrains Mono', monospace;
        }

        /* ── INPUT CARD ── */
        .card {
          width: 100%;
          max-width: 600px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.03), 0 24px 48px rgba(0,0,0,0.5);
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          background: rgba(255,255,255,0.02);
        }

        .dot { width: 10px; height: 10px; border-radius: 50%; }
        .dot-red    { background: #ef4444; }
        .dot-yellow { background: #f59e0b; }
        .dot-green  { background: #22c55e; }

        .card-title {
          font-size: 11px;
          color: var(--muted);
          margin-left: 4px;
          letter-spacing: 0.05em;
        }

        .input-row {
          display: flex;
          align-items: center;
          padding: 20px;
          gap: 12px;
          border-bottom: 1px solid var(--border);
        }

        .prompt {
          color: var(--amber);
          font-size: 16px;
          font-weight: 700;
          flex-shrink: 0;
          user-select: none;
        }

        .url-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text);
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          caret-color: var(--amber);
        }

        .url-input::placeholder { color: var(--muted); }

        .url-input:disabled { opacity: 0.5; cursor: not-allowed; }

        .generate-btn {
          background: var(--amber);
          color: #000;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.15s ease;
          letter-spacing: 0.03em;
        }

        .generate-btn:hover:not(:disabled) {
          background: #fbbf24;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(245,158,11,0.3);
        }

        .generate-btn:active:not(:disabled) { transform: translateY(0); }

        .generate-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        /* ── STEPS ── */
        .steps {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .step-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          color: var(--muted);
          transition: color 0.2s;
        }

        .step-row.active  { color: var(--text); }
        .step-row.done-s  { color: var(--green); }
        .step-row.error-s { color: var(--red);   }

        .step-icon {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 1px solid currentColor;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          flex-shrink: 0;
        }

        .step-row.active .step-icon {
          border-color: var(--amber);
          background: rgba(245,158,11,0.1);
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .step-row.done-s .step-icon  { background: rgba(34,197,94,0.1);  }
        .step-row.error-s .step-icon { background: rgba(239,68,68,0.1);  }

        /* ── EXAMPLES ── */
        .examples {
          padding: 16px 20px;
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .examples-label {
          font-size: 11px;
          color: var(--muted);
          margin-right: 4px;
          white-space: nowrap;
        }

        .example-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--muted);
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .example-btn:hover {
          border-color: var(--amber-dim);
          color: var(--amber);
          background: rgba(245,158,11,0.05);
        }

        /* ── ERROR ── */
        .error-box {
          margin-top: 16px;
          width: 100%;
          max-width: 600px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 12px;
          color: var(--red);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* ── FEATURES ── */
        .features {
          display: flex;
          gap: 24px;
          margin-top: 48px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .feature {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.05em;
        }

        .feature span { color: var(--amber); }

        /* ── FOOTER ── */
        .footer {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.05em;
          z-index: 1;
        }

        .footer a { color: var(--amber); text-decoration: none; }

        @media (max-width: 600px) {
          .input-row { flex-wrap: wrap; }
          .generate-btn { width: 100%; justify-content: center; }
          .features { gap: 16px; }
        }
      `}</style>

      <div className="wrapper">
        {/* Header */}
        <div className="header">
          <div className="badge">
            Powered by Lingo.dev
          </div>

          <h1 className="headline">
            Release notes,<br />
            in <em>every</em> language
          </h1>
          <p className="subline">
            Paste any public GitHub repo.<br />
            Get an AI-generated changelog with <em style={{color: 'var(--amber)'}}>mindmap view</em>, translated into  <em style={{color: 'var(--amber)'}}>10+ languages instantly.</em>
          </p>
          
        </div>

        {/* Main card */}
        <div className="card">
          {/* macOS-style titlebar */}
          <div className="card-header">
            <div className="dot dot-red"    />
            <div className="dot dot-yellow" />
            <div className="dot dot-green"  />
            <span className="card-title">pushnotes — terminal</span>
          </div>

          {/* URL input row */}
          <div className="input-row">
            <span className="prompt">&gt;_</span>
            <input
              className="url-input"
              type="text"
              placeholder="github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoFocus
              spellCheck={false}
            />
            <button
              className="generate-btn"
              onClick={() => handleGenerate()}
              disabled={isLoading || !url.trim()}
            >
              {isLoading ? "Working..." : "Generate →"}
            </button>
          </div>

          {/* Loading steps — shown during generation */}
          {isLoading && (
            <div className="steps">
              {STEPS.filter(s => s.id !== "done").map((s, i) => {
                const isDone   = i < currentStepIndex;
                const isActive = s.id === step;
                return (
                  <div
                    key={s.id}
                    className={`step-row ${isActive ? "active" : ""} ${isDone ? "done-s" : ""}`}
                  >
                    <div className="step-icon">
                      {isDone ? "✓" : isActive ? "◌" : "·"}
                    </div>
                    {s.label}
                  </div>
                );
              })}
            </div>
          )}

          {/* Example repos */}
          {!isLoading && (
            <div className="examples">
              <span className="examples-label">try:</span>
              {EXAMPLE_REPOS.map((ex) => (
                <button
                  key={ex.url}
                  className="example-btn"
                  onClick={() => {
                    setUrl(ex.url);
                    handleGenerate(ex.url);
                  }}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error message */}
        {step === "error" && error && (
          <div className="error-box">
            ✗ {error}
          </div>
        )}

        {/* Feature pills */}
        <div className="features">
          <div className="feature"><span>⚡</span> No login required</div>
          <div className="feature"><span>🌍</span> 10+ languages</div>
          <div className="feature"><span>🗺️</span> Mindmap view</div>
          <div className="feature"><span>📦</span> Embeddable widget</div>
        </div>

        {/* Footer */}
        <div className="footer">
          Built for <a href="https://lingo.dev" target="_blank">Lingo.dev</a> Multilingual Hackathon #3
        </div>
      </div>
    </>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
