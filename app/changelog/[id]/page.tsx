// app/changelog/[id]/page.tsx — Server Component
"use server";

import { notFound } from "next/navigation";
import { getChangelogById, getTranslations, TranslatedContent } from "@/lib/db";
import { SupportedLocale } from "@/lib/lingo-client";
import ChangelogClient from "./ChangelogClient";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string; new?: string }>;
}

export default async function ChangelogPage({ params, searchParams }: Props) {
  const { id }   = await params;
  const sParams  = await searchParams;
  const lang     = sParams.lang;
  const isNew    = sParams.new === "1";

  // Robust fetcher: If this is a 'new' generation, the background DB save 
  // might still be in flight. We wait and retry for a few seconds if not found.
  async function fetchWithRetry<T>(fetcher: () => Promise<T | null>): Promise<T | null> {
    let data = await fetcher();
    if (!data && isNew) {
      console.log(`[changelog page] Records not ready for ${id}, retrying...`);
      for (let i = 0; i < 8; i++) { // try for ~6 seconds total
        await new Promise(r => setTimeout(r, 800));
        data = await fetcher();
        if (data) break;
      }
    }
    return data;
  }

  const changelog = await fetchWithRetry(() => getChangelogById(id));
  if (!changelog) {
    console.log("[changelog page] not found:", id);
    notFound();
  }

  const allTranslations = await getTranslations(id);
  const englishContent = allTranslations["en"];
  
  if (!englishContent) {
    console.log("[changelog page] english sections not found for:", id);
    notFound();
  }

  const translatedLocales = Object.keys(allTranslations);

  let initialContent = englishContent;
  let initialLocale  = "en";

  if (lang && lang !== "en" && translatedLocales.includes(lang)) {
    const translated = allTranslations[lang as SupportedLocale];
    if (translated) {
      initialContent = translated;
      initialLocale  = lang;
    }
  }

  // Log so we can verify data is flowing correctly
  console.log("[changelog page] serving:", {
    id,
    repoName: changelog.repoName,
    title:    initialContent.title,
    sections: Object.values(initialContent.sections).flat().length,
    locales:  translatedLocales,
  });

  return (
    <ChangelogClient
      id={id}
      changelog={changelog}
      initialContent={initialContent}
      initialLocale={initialLocale}
      translatedLocales={translatedLocales}
      allTranslations={allTranslations}
    />
  );
}
