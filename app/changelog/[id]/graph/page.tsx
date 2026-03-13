
import { notFound } from "next/navigation";
import { getChangelogById, getTranslation, getTranslatedLocales, getTranslations } from "@/lib/db";
import { fetchRepoAnalytics } from "@/lib/github";
import { buildGraphData } from "@/lib/graph";
import GraphClient from "./GraphClient";

interface Props {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ lang?: string }>;
}

export default async function GraphPage({ params, searchParams }: Props) {
    const { id } = await params;
    const { lang } = await searchParams;

    const changelog = await getChangelogById(id);
    if (!changelog) notFound();

    const englishContent = await getTranslation(id, "en");
    if (!englishContent) notFound();

    // fetch all available translations for instant switching
    const translatedLocales = await getTranslatedLocales(id);
    const allTranslations = await getTranslations(id);

    // determine initial language
    let initialLocale = "en";
    if (lang && lang !== "en" && translatedLocales.includes(lang as any)) {
        initialLocale = lang;
    }

    // fetch commits for graph — re-use github fetcher
    // (we don't store raw commits in DB, so we re-fetch)
    let commits: any[] = [];
    try {
        const analytics = await fetchRepoAnalytics(changelog.repoUrl);
        commits = analytics.commits;
    } catch {
        // if fetch fails, show graph with just the sections data
        commits = [];
    }

    const sections = englishContent.sections;

    // build graph data on the server — no client computation needed
    const graphData = buildGraphData(
        commits,
        sections,
        englishContent.title ?? changelog.repoName,
    );

    console.log("[graph] built:", {
        nodes: graphData.nodes.length,
        edges: graphData.edges.length,
        files: graphData.stats.totalFiles,
        hotFiles: graphData.stats.hotFiles,
    });

    return (
        <GraphClient
            id={id}
            changelog={changelog}
            graphData={graphData}
            sections={sections}
            allTranslations={allTranslations}
            initialLocale={initialLocale}
            translatedLocales={translatedLocales}
            commits={commits}
        />
    );
}
