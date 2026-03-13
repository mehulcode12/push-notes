// ─────────────────────────────────────────────────────────────
// lib/graph.ts  —  Knowledge Graph Data Transformer
// Radial layout: Root (centre) → Packages (ring 1) → Files (ring 2)
// MAX: 6 packages × 4 files = 25 nodes total — always readable
// ─────────────────────────────────────────────────────────────

import type { Commit } from "./github";
import type { ChangelogSections } from "./gemini";

// ─── Types ───────────────────────────────────────────────────

export type NodeKind = "root" | "package" | "file";

export interface CommitSummary {
    sha: string;
    message: string;
    additions: number;
    deletions: number;
}

export interface GraphNodeData {
    label: string;
    kind: NodeKind;
    additions: number;
    deletions: number;
    churnScore: 1 | 2 | 3;   // 1 stable · 2 moderate · 3 hot
    commitCount: number;
    commits: CommitSummary[];
    patch?: string;
    aiExplanation?: string;
    section?: "added" | "fixed" | "changed" | "breaking";
    fileCount?: number;       // package nodes
    typeLabel?: string;       // i18n display
}

export interface GraphNode {
    id: string;
    type: "rootNode" | "packageNode" | "fileNode";
    data: GraphNodeData;
    position: { x: number; y: number };
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    animated?: boolean;
    style?: Record<string, unknown>;
}

export interface GraphStats {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    hotFiles: string[];
    packageCount: number;
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    stats: GraphStats;
}

// ─── Constants ───────────────────────────────────────────────

const MAX_PACKAGES = 6;
const MAX_FILES_PER = 4;

const RING1_RADIUS = 260;   // packages orbit radius
const RING2_RADIUS = 480;   // files orbit radius

const SKIP = [
    /\.lock$/i, /package-lock\.json$/i, /yarn\.lock$/i,
    /pnpm-lock\.yaml$/i, /CHANGELOG\.md$/i, /\.changeset\//,
    /dist\//, /\.next\//, /node_modules\//, /\.min\.js$/,
    /coverage\//, /\.map$/,
];

// ─── Helpers ─────────────────────────────────────────────────

function skip(f: string) { return SKIP.some(r => r.test(f)); }

function pkgName(filename: string): string {
    const p = filename.split("/");
    if (p.length === 1) return "(root)";
    if ((p[0] === "packages" || p[0] === "apps") && p.length > 2)
        return `${p[0]}/${p[1]}`;
    return p[0];
}

function churn(n: number): 1 | 2 | 3 {
    return n >= 3 ? 3 : n >= 2 ? 2 : 1;
}

function section(
    filename: string,
    sections: ChangelogSections,
): GraphNodeData["section"] {
    const base = filename.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
    if (base.length < 4) return undefined;
    const all = [
        ...sections.added.map(e => ({ raw: e.raw, s: "added" as const })),
        ...sections.fixed.map(e => ({ raw: e.raw, s: "fixed" as const })),
        ...sections.changed.map(e => ({ raw: e.raw, s: "changed" as const })),
        ...sections.breaking.map(e => ({ raw: e.raw, s: "breaking" as const })),
    ];
    return all.find(e => e.raw.toLowerCase().includes(base.toLowerCase()))?.s;
}

// Polar → Cartesian
function polar(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = (angleDeg - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function getHandles(sourceCenter: {x: number, y: number}, targetCenter: {x: number, y: number}) {
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    
    if (angle >= 315 || angle < 45) return { s: "s-right", t: "t-left" };
    if (angle >= 45 && angle < 135) return { s: "s-bottom", t: "t-top" };
    if (angle >= 135 && angle < 225) return { s: "s-left", t: "t-right" };
    return { s: "s-top", t: "t-bottom" };
}

// ─── Main Builder ────────────────────────────────────────────

export function buildGraphData(
    commits: Commit[],
    sections: ChangelogSections,
    releaseTitle: string,
): GraphData {

    // 1. Aggregate file stats
    const fileMap = new Map<string, {
        additions: number;
        deletions: number;
        commits: CommitSummary[];
        patch: string;
    }>();

    for (const c of commits.filter(c => c.filesChanged?.length)) {
        for (const f of c.filesChanged!) {
            if (skip(f.filename)) continue;
            const ex = fileMap.get(f.filename);
            const cs: CommitSummary = {
                sha: c.sha.slice(0, 7),
                message: c.shortMessage,
                additions: f.additions,
                deletions: f.deletions,
            };
            if (ex) {
                ex.additions += f.additions;
                ex.deletions += f.deletions;
                ex.commits.push(cs);
                if (!ex.patch && f.patch) ex.patch = f.patch;
            } else {
                fileMap.set(f.filename, {
                    additions: f.additions,
                    deletions: f.deletions,
                    commits: [cs],
                    patch: f.patch ?? "",
                });
            }
        }
    }

    // 2. Group into packages, pick top N by total churn
    const pkgMap = new Map<string, string[]>();
    for (const fn of fileMap.keys()) {
        const p = pkgName(fn);
        pkgMap.set(p, [...(pkgMap.get(p) ?? []), fn]);
    }

    const topPkgs = [...pkgMap.entries()]
        .sort((a, b) => {
            const score = (files: string[]) =>
                files.reduce((s, f) => s + (fileMap.get(f)?.commits.length ?? 0), 0);
            return score(b[1]) - score(a[1]);
        })
        .slice(0, MAX_PACKAGES);

    // 3. Build nodes with radial positions
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    const cx = 0, cy = 0;   // graph centre

    // ── Root ──
    nodes.push({
        id: "root",
        type: "rootNode",
        data: {
            label: releaseTitle,
            kind: "root",
            additions: 0,
            deletions: 0,
            churnScore: 1,
            commitCount: commits.length,
            commits: [],
            fileCount: fileMap.size,
        },
        position: { x: cx - 130, y: cy - 50 },
    });

    // ── Packages + Files ──
    topPkgs.forEach(([pkg, allFiles], pkgIdx) => {
        const pkgAngle = (pkgIdx / topPkgs.length) * 360;
        const pkgPos = polar(cx, cy, RING1_RADIUS, pkgAngle);

        const topFiles = allFiles
            .sort((a, b) =>
                (fileMap.get(b)?.commits.length ?? 0) - (fileMap.get(a)?.commits.length ?? 0)
            )
            .slice(0, MAX_FILES_PER);

        const allCommits = topFiles.flatMap(f => fileMap.get(f)?.commits ?? []);
        const uniqueCommits = new Map<string, CommitSummary>();
        for (const c of allCommits) {
            const ex = uniqueCommits.get(c.sha);
            if (ex) {
                ex.additions += c.additions;
                ex.deletions += c.deletions;
            } else {
                uniqueCommits.set(c.sha, { ...c });
            }
        }
        const pkgCommits = Array.from(uniqueCommits.values());

        const pkgAdd = topFiles.reduce((s, f) => s + (fileMap.get(f)?.additions ?? 0), 0);
        const pkgDel = topFiles.reduce((s, f) => s + (fileMap.get(f)?.deletions ?? 0), 0);
        const pkgId = `pkg-${pkgIdx}`;

        nodes.push({
            id: pkgId,
            type: "packageNode",
            data: {
                label: pkg,
                kind: "package",
                additions: pkgAdd,
                deletions: pkgDel,
                churnScore: churn(pkgCommits.length),
                commitCount: pkgCommits.length,
                commits: pkgCommits.slice(0, 6),
                fileCount: allFiles.length,
            },
            position: { x: pkgPos.x - 90, y: pkgPos.y - 45 },
        });

        const h = getHandles({x: 0, y: 0}, pkgPos);

        // root → package
        edges.push({
            id: `e-root-${pkgId}`,
            source: "root",
            sourceHandle: h.s,
            target: pkgId,
            targetHandle: h.t,
            style: { stroke: "#2a2a2a", strokeWidth: 2 },
        });

        // ── File nodes ──
        topFiles.forEach((fn, fIdx) => {
            const fd = fileMap.get(fn)!;
            const fChurn = churn(fd.commits.length);

            // spread files around their package angle
            const spread = topFiles.length > 1 ? 40 : 0;
            const fAngle = pkgAngle + (fIdx - (topFiles.length - 1) / 2) * (spread / (topFiles.length - 1 || 1));
            const fPos = polar(cx, cy, RING2_RADIUS, fAngle);
            const fileId = `file-${pkgIdx}-${fIdx}`;
            const shortName = fn.split("/").pop() ?? fn;

            nodes.push({
                id: fileId,
                type: "fileNode",
                data: {
                    label: shortName,
                    kind: "file",
                    additions: fd.additions,
                    deletions: fd.deletions,
                    churnScore: fChurn,
                    commitCount: fd.commits.length,
                    commits: fd.commits,
                    patch: fd.patch,
                    section: section(fn, sections),
                },
                position: { x: fPos.x - 80, y: fPos.y - 42 },
            });

            const edgeColor = fChurn === 3 ? "#ef4444" : fChurn === 2 ? "#f59e0b" : "#22c55e";
            const fh = getHandles(pkgPos, fPos);

            edges.push({
                id: `e-${pkgId}-${fileId}`,
                source: pkgId,
                sourceHandle: fh.s,
                target: fileId,
                targetHandle: fh.t,
                animated: fChurn === 3,
                style: { stroke: edgeColor, strokeWidth: 1.5, opacity: 0.7 },
            });
        });
    });

    // 4. Stats
    const allFiles = [...fileMap.values()];
    const hotFiles = [...fileMap.entries()]
        .filter(([, v]) => v.commits.length >= 3)
        .map(([k]) => k);

    return {
        nodes,
        edges,
        stats: {
            totalFiles: fileMap.size,
            totalAdditions: allFiles.reduce((s, f) => s + f.additions, 0),
            totalDeletions: allFiles.reduce((s, f) => s + f.deletions, 0),
            hotFiles,
            packageCount: topPkgs.length,
        },
    };
}
