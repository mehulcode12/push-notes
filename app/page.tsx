export default async function Home() {
  // Test /api/generate
  const genRes = await fetch("http://localhost:3000/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "github.com/lingodotdev/lingo.dev" }),
  });
  const genData = await genRes.json();
  console.log("✅ Generate:", genData.id, genData.version, "cached:", genData.cached);

  // Test /api/translate
  const transRes = await fetch("http://localhost:3000/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changelogId: genData.id, locales: ["hi", "es"] }),
  });
  const transData = await transRes.json();
  console.log("✅ Translate:", transData.translatedLocales, "reach:", transData.reachScore + "%");

  // Test cache — same repo again should be instant
  const cachedRes = await fetch("http://localhost:3000/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "github.com/lingodotdev/lingo.dev" }),
  });
  const cachedData = await cachedRes.json();
  console.log("⚡ Cached hit:", cachedData.cached);

  return <main>check terminal!</main>;
}