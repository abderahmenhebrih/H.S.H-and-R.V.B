import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Narrow icon imports to the used subset (lucide-react is imported across
  // ~30 files; without this each page pull can duplicate icon modules).
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
