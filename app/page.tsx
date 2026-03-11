import { fetchRepoAnalytics } from "@/lib/github";

export default async function Home() {
  const data = await fetchRepoAnalytics("https://github.com/lingodotdev/lingo.dev");
  
  console.log("repo:", data.meta.fullName);
  console.log("Stars:", data.meta.stars);
  console.log("Commits-fetched:", data.commits.length);
  console.log("PRs fetched:", data.pullRequests.length);
  console.log("Latest release:", data.latestRelease?.tagName);
  console.log("ReadMe preview:", data.readme?.slice(0, 100));
  
  return <main>check terminal!</main>;
}