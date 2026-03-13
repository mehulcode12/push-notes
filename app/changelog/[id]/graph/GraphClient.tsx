"use client";

import {
    useState, useCallback, useMemo, memo, useEffect,
} from "react";
import ReactFlow, {
    Background, Controls, MiniMap,
    Handle, Position, NodeProps,
    BackgroundVariant,
    useNodesState, useEdgesState,
    getBezierPath, EdgeProps,
    BaseEdge,
} from "reactflow";
import "reactflow/dist/style.css";

import type { GraphData, GraphNodeData, CommitSummary } from "@/lib/graph";
import type { ChangelogSections } from "@/lib/gemini";
import type { ChangelogRecord } from "@/lib/db";
import { getTranslatableLocales } from "@/lib/lingo-client";

// ─────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────

interface Props {
    id: string;
    changelog: ChangelogRecord;
    graphData: GraphData;
    sections: ChangelogSections;
    allTranslations: Record<string, any>;
    initialLocale: string;
    translatedLocales: string[];
    commits: any[];
}

// ─────────────────────────────────────────────────────────────
// CHURN PALETTE
// ─────────────────────────────────────────────────────────────

const C = {
    1: { glow: "#22c55e", border: "#22c55e55", bg: "rgba(34,197,94,0.07)", text: "#22c55e", label: "Stable" },
    2: { glow: "#f59e0b", border: "#f59e0b55", bg: "rgba(245,158,11,0.07)", text: "#f59e0b", label: "Modified" },
    3: { glow: "#ef4444", border: "#ef444455", bg: "rgba(239,68,68,0.07)", text: "#ef4444", label: "Hot 🔥" },
} as const;

const SEC = {
    added: "#22c55e",
    fixed: "#3b82f6",
    changed: "#f59e0b",
    breaking: "#ef4444",
} as const;

// ─────────────────────────────────────────────────────────────
// CUSTOM NODES
// ─────────────────────────────────────────────────────────────

const NodeHandles = () => (
    <>
        <Handle type="target" position={Position.Top} id="t-top" style={{ opacity: 0 }} />
        <Handle type="target" position={Position.Right} id="t-right" style={{ opacity: 0 }} />
        <Handle type="target" position={Position.Bottom} id="t-bottom" style={{ opacity: 0 }} />
        <Handle type="target" position={Position.Left} id="t-left" style={{ opacity: 0 }} />
        
        <Handle type="source" position={Position.Top} id="s-top" style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Right} id="s-right" style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Left} id="s-left" style={{ opacity: 0 }} />
    </>
);

const RootNode = memo(({ data, selected }: NodeProps<GraphNodeData>) => (
    <div style={{
        width: 260, padding: "18px 22px",
        background: "radial-gradient(ellipse at top, rgba(245,158,11,0.15) 0%, rgba(10,10,10,0.95) 70%)",
        border: `1.5px solid ${selected ? "#f59e0b" : "rgba(245,158,11,0.35)"}`,
        borderRadius: 14,
        boxShadow: selected
            ? "0 0 0 4px rgba(245,158,11,0.15), 0 20px 60px rgba(0,0,0,0.8)"
            : "0 8px 40px rgba(0,0,0,0.6)",
        fontFamily: "'JetBrains Mono', monospace",
        textAlign: "center",
        cursor: "default",
        transition: "all 0.25s",
        position: "relative",
    }}>
        <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: "0.15em", marginBottom: 8, opacity: 0.8 }}>
            🚀 RELEASE
        </div>
        <div style={{
            fontSize: 13, color: "#fff", fontWeight: 700,
            lineHeight: 1.4, marginBottom: 10,
        }}>
            {data.label}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, fontSize: 10 }}>
            <span style={{ color: "#525252" }}>{data.commitCount} commits</span>
            <span style={{ color: "#2a2a2a" }}>·</span>
            <span style={{ color: "#525252" }}>{data.fileCount} files</span>
        </div>
        <NodeHandles />
    </div>
));
RootNode.displayName = "RootNode";

const PackageNode = memo(({ data, selected }: NodeProps<GraphNodeData>) => {
    const c = C[data.churnScore];
    return (
        <div style={{
            width: 180, padding: "14px 16px",
            background: c.bg,
            border: `1px solid ${selected ? c.glow : c.border}`,
            borderRadius: 10,
            boxShadow: selected ? `0 0 0 3px ${c.glow}22, 0 12px 40px rgba(0,0,0,0.7)` : "0 4px 24px rgba(0,0,0,0.5)",
            fontFamily: "'JetBrains Mono', monospace",
            transition: "all 0.2s",
            cursor: "pointer",
        }}>
            <NodeHandles />
            <div style={{ fontSize: 8, color: c.text, letterSpacing: "0.12em", marginBottom: 6, opacity: 0.8 }}>
                📦 PACKAGE
            </div>
            <div style={{
                fontSize: 11, color: "#e5e5e5", fontWeight: 600,
                marginBottom: 8, lineHeight: 1.3,
                wordBreak: "break-all",
            }}>
                {data.label}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
                    <span style={{ color: "#22c55e" }}>+{data.additions}</span>
                    <span style={{ color: "#ef4444" }}>-{data.deletions}</span>
                </div>
                <div style={{
                    fontSize: 9, color: c.text,
                    background: `${c.glow}18`,
                    border: `1px solid ${c.glow}33`,
                    borderRadius: 100, padding: "2px 7px",
                }}>
                    {c.label}
                </div>
            </div>
            <div style={{ fontSize: 9, color: "#3a3a3a", marginTop: 5 }}>
                {data.fileCount} files · {data.commitCount} commits
            </div>
        </div>
    );
});
PackageNode.displayName = "PackageNode";

const FileNode = memo(({ data, selected }: NodeProps<GraphNodeData>) => {
    const c = C[data.churnScore];
    const secColor = data.section ? SEC[data.section] : c.glow;
    return (
        <div style={{
            width: 160, padding: "10px 13px",
            background: "rgba(14,14,14,0.97)",
            borderTop: `1px solid ${selected ? secColor : "#1e1e1e"}`,
            borderRight: `1px solid ${selected ? secColor : "#1e1e1e"}`,
            borderBottom: `1px solid ${selected ? secColor : "#1e1e1e"}`,
            borderLeft: `3px solid ${secColor}`,
            borderRadius: 8,
            boxShadow: selected ? `0 0 0 2px ${secColor}22, 0 8px 32px rgba(0,0,0,0.8)` : "0 2px 16px rgba(0,0,0,0.6)",
            fontFamily: "'JetBrains Mono', monospace",
            transition: "all 0.2s",
            cursor: "pointer",
        }}>
            <NodeHandles />
            <div style={{
                fontSize: 11, color: "#d4d4d4", fontWeight: 600,
                marginBottom: 5, lineHeight: 1.3,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
                {data.label}
            </div>
            <div style={{ display: "flex", gap: 8, fontSize: 10, marginBottom: 4 }}>
                <span style={{ color: "#22c55e" }}>+{data.additions}</span>
                <span style={{ color: "#ef4444" }}>-{data.deletions}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9, color: "#3a3a3a" }}>
                    {data.commitCount} commit{data.commitCount !== 1 ? "s" : ""}
                </span>
                {data.churnScore === 3 && (
                    <span style={{ fontSize: 9, color: "#ef4444" }}>🔥</span>
                )}
                {data.section && (
                    <span style={{
                        fontSize: 8, color: secColor,
                        background: `${secColor}15`,
                        border: `1px solid ${secColor}33`,
                        borderRadius: 100, padding: "1px 6px",
                    }}>
                        {data.section}
                    </span>
                )}
            </div>
        </div>
    );
});
FileNode.displayName = "FileNode";

const nodeTypes = {
    rootNode: RootNode,
    packageNode: PackageNode,
    fileNode: FileNode,
};

// ─────────────────────────────────────────────────────────────
// CUSTOM CURVED EDGE
// ─────────────────────────────────────────────────────────────

function SmoothEdge({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    style,
}: EdgeProps) {
    const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
    return <BaseEdge path={path} style={{ ...style, strokeLinecap: "round" }} />;
}

const edgeTypes = { smoothEdge: SmoothEdge };

// ─────────────────────────────────────────────────────────────
// DETAIL PANEL
// ─────────────────────────────────────────────────────────────

interface PanelProps {
    node: GraphNodeData & { id: string };
    onClose: () => void;
    onExplain: (id: string, patch: string, label: string) => Promise<void>;
    loading: boolean;
}

const DetailPanel = memo(({ node, onClose, onExplain, loading }: PanelProps) => {
    const c = C[node.churnScore];
    const secColor = node.section ? SEC[node.section] : c.glow;

    return (
        <div style={{
            position: "absolute", right: 16, top: 56,
            width: 320, maxHeight: "calc(100vh - 80px)", overflowY: "auto",
            background: "#0d0d0d",
            border: `1px solid #1f1f1f`,
            borderTop: `2px solid ${node.kind === "root" ? "#f59e0b" : node.kind === "package" ? c.glow : secColor}`,
            borderRadius: "0 0 12px 12px",
            fontFamily: "'JetBrains Mono', monospace",
            boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
            zIndex: 20,
        }}>
            {/* Header */}
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                    <div style={{ fontSize: 8, color: "#525252", letterSpacing: "0.12em", marginBottom: 6 }}>
                        {node.kind.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 13, color: "#fff", fontWeight: 700, lineHeight: 1.3 }}>
                        {node.label}
                    </div>
                </div>
                <button onClick={onClose} style={{
                    background: "none", border: "1px solid #2a2a2a", color: "#525252",
                    cursor: "pointer", fontSize: 13, borderRadius: 6,
                    width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginLeft: 12,
                }}>✕</button>
            </div>

            <div style={{ padding: "16px 20px" }}>
                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                    {[
                        { val: `+${node.additions}`, label: "added", color: "#22c55e" },
                        { val: `-${node.deletions}`, label: "removed", color: "#ef4444" },
                        { val: `${node.commitCount}`, label: "commits", color: "#8b5cf6" },
                    ].map(({ val, label, color }) => (
                        <div key={label} style={{
                            background: `${color}0d`, border: `1px solid ${color}22`,
                            borderRadius: 8, padding: "8px 0", textAlign: "center",
                        }}>
                            <div style={{ fontSize: 16, color, fontWeight: 700 }}>{val}</div>
                            <div style={{ fontSize: 8, color: "#525252", marginTop: 2 }}>{label}</div>
                        </div>
                    ))}
                </div>

                {/* Churn badge */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <div style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: c.bg, border: `1px solid ${c.glow}33`,
                        borderRadius: 100, padding: "4px 12px", fontSize: 10, color: c.text,
                    }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.glow }} />
                        {c.label}
                    </div>
                    {node.section && (
                        <div style={{
                            display: "inline-flex", alignItems: "center",
                            background: `${secColor}0d`, border: `1px solid ${secColor}33`,
                            borderRadius: 100, padding: "4px 12px", fontSize: 10, color: secColor,
                        }}>
                            {node.section}
                        </div>
                    )}
                </div>

                {/* AI Explanation */}
                {node.aiExplanation ? (
                    <div style={{
                        background: "rgba(245,158,11,0.05)",
                        border: "1px solid rgba(245,158,11,0.15)",
                        borderRadius: 8, padding: "12px 14px",
                        fontSize: 11, color: "#d4d4d4", lineHeight: 1.7, marginBottom: 16,
                    }}>
                        <div style={{ fontSize: 8, color: "#f59e0b", letterSpacing: "0.1em", marginBottom: 8 }}>✨ AI ANALYSIS</div>
                        {node.aiExplanation}
                    </div>
                ) : node.patch ? (
                    <button
                        onClick={() => onExplain(node.id, node.patch!, node.label)}
                        disabled={loading}
                        style={{
                            width: "100%", marginBottom: 16,
                            background: loading ? "transparent" : "rgba(245,158,11,0.08)",
                            border: "1px solid rgba(245,158,11,0.25)",
                            borderRadius: 8, color: loading ? "#525252" : "#f59e0b",
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 11, padding: "10px 0", cursor: loading ? "not-allowed" : "pointer",
                            transition: "all 0.2s",
                        }}
                    >
                        {loading ? "⏳ Analyzing..." : "✨ Explain this change"}
                    </button>
                ) : null}

                {/* Commits list */}
                {node.commits.length > 0 && (
                    <div>
                        <div style={{ fontSize: 8, color: "#525252", letterSpacing: "0.12em", marginBottom: 10 }}>
                            COMMITS THAT TOUCHED THIS
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {node.commits.slice(0, 5).map((c: CommitSummary) => (
                                <div key={c.sha} style={{
                                    background: "#111", border: "1px solid #1a1a1a",
                                    borderRadius: 6, padding: "8px 10px",
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                        <span style={{
                                            fontSize: 9, color: "#8b5cf6",
                                            background: "rgba(139,92,246,0.1)",
                                            border: "1px solid rgba(139,92,246,0.2)",
                                            borderRadius: 4, padding: "1px 6px",
                                            fontFamily: "monospace", flexShrink: 0,
                                        }}>
                                            {c.sha}
                                        </span>
                                        <div style={{ display: "flex", gap: 6, fontSize: 9, marginLeft: "auto" }}>
                                            <span style={{ color: "#22c55e" }}>+{c.additions}</span>
                                            <span style={{ color: "#ef4444" }}>-{c.deletions}</span>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 10, color: "#737373", lineHeight: 1.4 }}>
                                        {c.message.slice(0, 60)}{c.message.length > 60 ? "…" : ""}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Diff patch */}
                {node.patch && (
                    <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 8, color: "#525252", letterSpacing: "0.12em", marginBottom: 8 }}>DIFF</div>
                        <div style={{
                            background: "#080808", border: "1px solid #181818",
                            borderRadius: 6, padding: "10px 12px",
                            fontSize: 9.5, fontFamily: "monospace",
                            maxHeight: 160, overflowY: "auto", lineHeight: 1.6,
                        }}>
                            {node.patch.split("\n").slice(0, 40).map((line, i) => (
                                <div key={i} style={{
                                    color: line.startsWith("+") ? "#22c55e"
                                        : line.startsWith("-") ? "#ef4444"
                                            : line.startsWith("@@") ? "#3b82f6"
                                                : "#3a3a3a",
                                }}>
                                    {line || " "}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});
DetailPanel.displayName = "DetailPanel";

// ─────────────────────────────────────────────────────────────
// STATS BAR PILL
// ─────────────────────────────────────────────────────────────

function Pill({ label, color }: { label: string; color: string }) {
    return (
        <div style={{
            background: `${color}10`, border: `1px solid ${color}30`,
            borderRadius: 100, padding: "4px 12px",
            fontSize: 10, color, fontFamily: "'JetBrains Mono', monospace",
        }}>
            {label}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// LANG PICKER OVERLAY
// ─────────────────────────────────────────────────────────────

interface PickerProps {
    translatedLocales: string[];
    onTranslate: (langs: string[]) => Promise<void>;
    onClose: () => void;
    translating: boolean;
}

function LangPicker({ translatedLocales, onTranslate, onClose, translating }: PickerProps) {
    const [selected, setSelected] = useState<string[]>([]);
    const all = getTranslatableLocales();

    const toggle = (code: string) =>
        setSelected(prev => prev.includes(code) ? prev.filter(l => l !== code) : [...prev, code]);

    return (
        <div style={{
            position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)",
            background: "#0d0d0d", border: "1px solid #1f1f1f", borderRadius: 12,
            padding: "20px 24px", zIndex: 30, minWidth: 380,
            boxShadow: "0 32px 80px rgba(0,0,0,0.9)",
            fontFamily: "'JetBrains Mono', monospace",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                    <div style={{ fontSize: 11, color: "#e5e5e5", fontWeight: 700 }}>Translate Graph</div>
                    <div style={{ fontSize: 9, color: "#525252", marginTop: 3 }}>
                        All node labels will switch to selected language
                    </div>
                </div>
                <button onClick={onClose} style={{ background: "none", border: "none", color: "#525252", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 16 }}>
                {all.map(({ code, nativeName }) => {
                    const done = translatedLocales.includes(code) && code !== "en";
                    const selected_ = selected.includes(code);
                    return (
                        <div
                            key={code}
                            onClick={() => !done && toggle(code)}
                            style={{
                                padding: "8px 6px", textAlign: "center",
                                background: done ? "rgba(34,197,94,0.05)" : selected_ ? "rgba(245,158,11,0.08)" : "#111",
                                border: `1px solid ${done ? "rgba(34,197,94,0.2)" : selected_ ? "rgba(245,158,11,0.4)" : "#1f1f1f"}`,
                                borderRadius: 7, cursor: done ? "default" : "pointer",
                                fontSize: 10,
                                color: done ? "#22c55e" : selected_ ? "#f59e0b" : "#525252",
                                transition: "all 0.15s",
                            }}
                        >
                            {nativeName}
                            {done && <div style={{ fontSize: 7, marginTop: 2, opacity: 0.6 }}>✓ done</div>}
                        </div>
                    );
                })}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={onClose} style={{
                    background: "transparent", border: "1px solid #1f1f1f",
                    color: "#525252", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11, padding: "7px 16px", borderRadius: 7, cursor: "pointer",
                }}>
                    Cancel
                </button>
                <button
                    onClick={() => onTranslate(selected)}
                    disabled={selected.length === 0 || translating}
                    style={{
                        background: selected.length === 0 ? "transparent" : "#f59e0b",
                        color: selected.length === 0 ? "#525252" : "#000",
                        border: "none", fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11, fontWeight: 700, padding: "7px 18px", borderRadius: 7,
                        cursor: selected.length === 0 || translating ? "not-allowed" : "pointer",
                        opacity: selected.length === 0 ? 0.4 : 1, transition: "all 0.2s",
                    }}
                >
                    {translating ? "Translating..." : `Translate (${selected.length})`} →
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function GraphClient({
    id, changelog, graphData, allTranslations,
    initialLocale, translatedLocales,
}: Props) {
    const [nodes, setNodes, onNodesChange] = useNodesState(graphData.nodes as any);
    const [edges, , onEdgesChange] = useEdgesState(
        graphData.edges.map(e => ({ ...e, type: "smoothEdge" })) as any
    );

    const [selectedNode, setSelectedNode] = useState<(GraphNodeData & { id: string }) | null>(null);
    const [explaining, setExplaining] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [translating, setTranslating] = useState(false);
    const [locale, setLocale] = useState(initialLocale);

    const stats = graphData.stats;

    const onNodeClick = useCallback((_: any, node: any) => {
        setSelectedNode({ ...node.data, id: node.id });
    }, []);

    // ── Sync node labels with locale ───────────
    useEffect(() => {
        const translation = allTranslations[locale];
        const enTranslation = allTranslations["en"];
        if (!translation || !enTranslation) return;

        setNodes(nds => nds.map(n => {
            if (n.id === "root") {
                return { ...n, data: { ...n.data, label: translation.title || n.data.label } };
            }
            if (n.data.kind === "file") {
                let foundMatch: any = null;
                for (const sectionKey of Object.keys(enTranslation.sections)) {
                    const enEntries = enTranslation.sections[sectionKey];
                    const base = n.data.label.split(".")[0].toLowerCase();
                    const matchIdx = enEntries.findIndex((e: any) => e.raw.toLowerCase().includes(base));
                    if (matchIdx !== -1) {
                        foundMatch = translation.sections[sectionKey]?.[matchIdx];
                        break;
                    }
                }
                if (foundMatch) {
                     return { ...n, data: { ...n.data, aiExplanation: foundMatch.text }};
                }
            }
            return n;
        }));
    }, [locale, allTranslations, setNodes]);

    const handleExplain = useCallback(async (nodeId: string, patch: string, label: string) => {
        setExplaining(true);
        try {
            const res = await fetch("/api/explain-node", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patch, label, repoName: changelog.repoName }),
            });
            const data = await res.json();
            const exp = data.explanation ?? "No explanation available.";
            setNodes(nds => nds.map(n =>
                n.id === nodeId ? { ...n, data: { ...n.data, aiExplanation: exp } } : n
            ));
            setSelectedNode(prev => prev ? { ...prev, aiExplanation: exp } : prev);
        } catch {
            setSelectedNode(prev => prev ? { ...prev, aiExplanation: "Failed to get explanation." } : prev);
        }
        setExplaining(false);
    }, [changelog.repoName, setNodes]);

    const handleTranslate = useCallback(async (langs: string[]) => {
        if (!langs.length) return;
        setTranslating(true);
        try {
            await fetch("/api/translate", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ changelogId: id, locales: langs }),
            });
            setLocale(langs[0]);
        } catch { /* silent */ }
        setTranslating(false);
        setPickerOpen(false);
    }, [id]);

    // Global click-off to deselect
    const onPaneClick = useCallback(() => setSelectedNode(null), []);

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #080808; }

        .react-flow__renderer       { background: transparent; }
        .react-flow__background     { background: #080808 !important; }
        .react-flow__controls       { background: #0d0d0d !important; border: 1px solid #1a1a1a !important; border-radius: 8px !important; box-shadow: none !important; }
        .react-flow__controls-button{ background: #0d0d0d !important; border-bottom: 1px solid #1a1a1a !important; color: #3a3a3a !important; fill: #3a3a3a !important; transition: all 0.15s; }
        .react-flow__controls-button:hover { background: #141414 !important; fill: #f59e0b !important; }
        .react-flow__minimap        { background: #0d0d0d !important; border: 1px solid #1a1a1a !important; border-radius: 8px !important; }
        .react-flow__minimap-mask   { fill: rgba(8,8,8,0.85) !important; }
        .react-flow__edge-path      { stroke-linecap: round; }

        /* scrollbar */
        ::-webkit-scrollbar           { width: 4px; }
        ::-webkit-scrollbar-track     { background: transparent; }
        ::-webkit-scrollbar-thumb     { background: #2a2a2a; border-radius: 4px; }

        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }

        .translate-btn {
            background: linear-gradient(180deg, rgba(245,158,11,0.1) 0%, rgba(245,158,11,0) 100%);
            border: 1px solid rgba(245,158,11,0.25);
            border-top-color: rgba(245,158,11,0.5);
            color: #f59e0b;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 700;
            padding: 6px 14px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
            position: relative;
            overflow: hidden;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .translate-btn::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 1.5px;
            background: linear-gradient(90deg, transparent, rgba(245,158,11,0.6), transparent);
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        .translate-btn:hover {
            background: linear-gradient(180deg, rgba(245,158,11,0.2) 0%, rgba(245,158,11,0.05) 100%);
            border-color: rgba(245,158,11,0.4);
            border-top-color: rgba(245,158,11,0.8);
            color: #fbbf24;
            box-shadow: 0 6px 20px rgba(245,158,11,0.2), 0 0 12px rgba(245,158,11,0.1);
            transform: translateY(-1px);
        }
        .translate-btn:hover::before {
            opacity: 1;
        }
        .translate-btn:active {
            transform: translateY(1px);
            box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }
        .translate-btn.active {
            background: rgba(245,158,11,0.25);
            border-color: rgba(245,158,11,0.5);
            color: #f59e0b;
            box-shadow: 0 0 24px rgba(245,158,11,0.2) inset, 0 8px 32px rgba(0,0,0,0.8);
            transform: translateY(0);
        }
        .globe-icon {
            font-size: 13px;
            transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .translate-btn:hover .globe-icon {
            transform: scale(1.15) rotate(15deg);
        }
      `}</style>

            <div style={{ width: "100vw", height: "100vh", background: "#080808", position: "relative", overflow: "hidden" }}>

                {/* ── TOP BAR ─────────────────────────────────── */}
                <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 52,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0 20px",
                    background: "rgba(8,8,8,0.92)",
                    borderBottom: "1px solid #141414",
                    backdropFilter: "blur(16px)",
                    zIndex: 10,
                    fontFamily: "'JetBrains Mono', monospace",
                }}>
                    {/* Left */}
                    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                        <a href={`/changelog/${id}`} style={{
                            color: "#3a3a3a", textDecoration: "none", fontSize: 11,
                            display: "flex", alignItems: "center", gap: 6, transition: "color 0.15s",
                        }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#f59e0b")}
                            onMouseLeave={e => (e.currentTarget.style.color = "#3a3a3a")}
                        >
                            ← Back
                        </a>
                        <div style={{ width: 1, height: 16, background: "#1a1a1a" }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", letterSpacing: "0.08em" }}>
                            KNOWLEDGE GRAPH
                        </span>
                        <span style={{ fontSize: 11, color: "#2a2a2a" }}>{changelog.repoName}</span>

                        {translatedLocales.length > 1 && (
                            <select
                                value={locale}
                                onChange={e => setLocale(e.target.value)}
                                style={{
                                    background: "#111", border: "1px solid #1a1a1a", borderRadius: 6,
                                    color: "#e5e5e5", fontSize: 10, padding: "4px 8px",
                                    marginLeft: 6, fontFamily: "'JetBrains Mono', monospace",
                                }}
                            >
                                {translatedLocales.map(code => {
                                    const locInfo = getTranslatableLocales().find(l => l.code === code);
                                    return (
                                        <option key={code} value={code}>
                                            {locInfo?.nativeName ?? code}
                                        </option>
                                    );
                                })}
                            </select>
                        )}
                    </div>

                    {/* Right — stats + translate */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Pill label={`${stats.packageCount} packages`} color="#3b82f6" />
                        <Pill label={`${stats.totalFiles} files`} color="#525252" />
                        <Pill label={`+${stats.totalAdditions}`} color="#22c55e" />
                        <Pill label={`-${stats.totalDeletions}`} color="#ef4444" />
                        {stats.hotFiles.length > 0 &&
                            <Pill label={`${stats.hotFiles.length} hot 🔥`} color="#ef4444" />
                        }
                        <div style={{ width: 1, height: 16, background: "#1a1a1a", margin: "0 4px" }} />
                        <button
                            className={`translate-btn ${pickerOpen ? "active" : ""}`}
                            onClick={() => setPickerOpen(p => !p)}
                        >
                            <span className="globe-icon">🌍</span> Translate
                        </button>
                    </div>
                </div>

                {/* ── LEGEND ──────────────────────────────────── */}
                <div style={{
                    position: "absolute", bottom: 16, left: 16, zIndex: 10,
                    background: "rgba(13,13,13,0.92)",
                    border: "1px solid #141414", borderRadius: 10,
                    padding: "12px 16px", backdropFilter: "blur(12px)",
                    fontFamily: "'JetBrains Mono', monospace",
                }}>
                    <div style={{ fontSize: 8, color: "#2a2a2a", letterSpacing: "0.15em", marginBottom: 10 }}>LEGEND</div>
                    {[
                        { color: "#ef4444", dot: true, text: "Hot file — touched 3+ commits" },
                        { color: "#f59e0b", dot: true, text: "Modified — 2 commits" },
                        { color: "#22c55e", dot: true, text: "Stable — 1 commit" },
                        { color: "#f59e0b", dot: false, text: "📦 Package group" },
                        { color: "#e5e5e5", dot: false, text: "📄 File (click for details)" },
                    ].map(({ color, dot, text }) => (
                        <div key={text} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                            {dot
                                ? <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                : <div style={{ width: 7, height: 7, flexShrink: 0 }} />
                            }
                            <span style={{ fontSize: 9.5, color: "#3a3a3a" }}>{text}</span>
                        </div>
                    ))}
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #141414", fontSize: 9, color: "#2a2a2a" }}>
                        Click any node · Scroll to zoom · Drag to pan
                    </div>
                </div>

                {/* ── LANG PICKER ─────────────────────────────── */}
                {pickerOpen && (
                    <LangPicker
                        translatedLocales={translatedLocales}
                        onTranslate={handleTranslate}
                        onClose={() => setPickerOpen(false)}
                        translating={translating}
                    />
                )}

                {/* ── DETAIL PANEL ────────────────────────────── */}
                {selectedNode && (
                    <DetailPanel
                        node={selectedNode}
                        onClose={() => setSelectedNode(null)}
                        onExplain={handleExplain}
                        loading={explaining}
                    />
                )}

                {/* ── EMPTY STATE ─────────────────────────────── */}
                {graphData.nodes.length <= 1 && (
                    <div style={{
                        position: "absolute", inset: 0, display: "flex",
                        flexDirection: "column", alignItems: "center", justifyContent: "center",
                        fontFamily: "'JetBrains Mono', monospace", zIndex: 5,
                        pointerEvents: "none",
                    }}>
                        <div style={{ fontSize: 32, marginBottom: 16 }}>🔍</div>
                        <div style={{ fontSize: 13, color: "#3a3a3a" }}>No file changes found in this release.</div>
                        <div style={{ fontSize: 10, color: "#2a2a2a", marginTop: 8 }}>
                            This repo may not have detailed commit data available.
                        </div>
                    </div>
                )}

                {/* ── REACT FLOW ──────────────────────────────── */}
                <div style={{ paddingTop: 52, height: "100vh" }}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
                        minZoom={0.15}
                        maxZoom={2.5}
                        proOptions={{ hideAttribution: true }}
                        defaultEdgeOptions={{ type: "smoothEdge" }}
                    >
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={32} size={1} color="#161616"
                        />
                        <Controls position="bottom-right" />
                        <MiniMap
                            nodeColor={(n) => {
                                const d = n.data as GraphNodeData;
                                if (d.kind === "root") return "#f59e0b";
                                if (d.kind === "package") return C[d.churnScore].glow;
                                return C[d.churnScore]?.glow ?? "#525252";
                            }}
                            maskColor="rgba(8,8,8,0.85)"
                            position="bottom-right"
                            style={{ bottom: 52 }}
                        />
                    </ReactFlow>
                </div>
            </div>
        </>
    );
}
