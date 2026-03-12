// app/changelog/[id]/page.tsx — Server Component
"use server";

import { notFound } from "next/navigation";
import { getChangelogById, getTranslation, getTranslatedLocales } from "@/lib/db";
import ChangelogClient from "./ChangelogClient";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}

export default async function ChangelogPage({ params, searchParams }: Props) {
  const { id }   = await params;
  const { lang } = await searchParams;

  const changelog = await getChangelogById(id);
  if (!changelog) {
    console.log("[changelog page] not found:", id);
    notFound();
  }

  const englishSections = await getTranslation(id, "en");
  if (!englishSections) {
    console.log("[changelog page] english sections not found for:", id);
    notFound();
  }

  const translatedLocales = await getTranslatedLocales(id);

  let initialSections = englishSections;
  let initialLocale   = "en";

  if (lang && lang !== "en" && translatedLocales.includes(lang as any)) {
    const translated = await getTranslation(id, lang as any);
    if (translated) {
      initialSections = translated;
      initialLocale   = lang;
    }
  }

  // Log so we can verify data is flowing correctly
  console.log("[changelog page] serving:", {
    id,
    repoName: changelog.repoName,
    version:  changelog.version,
    sections: Object.values(initialSections).flat().length,
    locales:  translatedLocales,
  });

  return (
    <ChangelogClient
      id={id}
      changelog={changelog}
      initialSections={initialSections}
      initialLocale={initialLocale}
      translatedLocales={translatedLocales}
      englishSections={englishSections}
    />
  );
}
