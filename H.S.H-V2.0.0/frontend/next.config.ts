import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production server (`server.js` + minimal node_modules) for
  // the HSH Desktop client, which spawns it on loopback. Additive: `next start`
  // and the web deployment behave exactly as before.
  output: "standalone",
  // Narrow icon imports to the used subset (lucide-react is imported across
  // ~30 files; without this each page pull can duplicate icon modules).
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
