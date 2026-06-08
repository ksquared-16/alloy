import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo: avoid Next.js picking the repo-root lockfile on Vercel/local.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
