import { generateChangelogId, saveChangelog, getChangelogById } from "@/lib/db";

export default async function Home() {
  try {
    const id = generateChangelogId("facebook/react");
    console.log("🆔 Generated ID:", id);

    const saved = await saveChangelog({
      id,
      repoUrl: "github.com/facebook/react",
      repoName: "facebook/react",
      version: "v19.0.0",
      tone: "technical",
    });
    console.log("💾 Saved:", saved);

    const found = await getChangelogById(id);
    console.log("📖 Fetched:", found);

  } catch (error: any) {
    console.error("❌ Full error:", JSON.stringify(error, null, 2));
    console.error("❌ Message:", error?.message);
    console.error("❌ Cause:", error?.cause);
    console.error("❌ Stack:", error?.stack);
  }

  return <main>check terminal!</main>;
}