import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["lingo.dev", "@lingo.dev/sdk", "jsdom", "ws"],
};

export default nextConfig;
