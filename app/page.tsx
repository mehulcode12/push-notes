import { fetchRepoAnalytics } from "@/lib/github";
import { generateChangelog } from "@/lib/gemini";

export default async function Home() {
  const data = await fetchRepoAnalytics("github.com/lingodotdev/lingo.dev");
  const result = await generateChangelog(
    data.commits,
    data.pullRequests,
    data.readme,
    data.latestRelease?.tagName ?? null
  );

  console.log("Tone:", result.tone);
  console.log("Version:", result.version);
  console.log("Added:", result.sections.added);
  console.log("Fixed:", result.sections.fixed);
  console.log("Changed:", result.sections.changed);
  console.log("Breaking:", result.sections.breaking);
  console.log("Total commits:", data.commits.length);
  console.log("All commit messages:");
  data.commits.forEach(c => console.log(" →", c.shortMessage));

  return <main>check terminal!</main>;
}