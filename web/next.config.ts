import path from "path";
import { fileURLToPath } from "url";

import type { NextConfig } from "next";

/** App lives in `web/` while Alloy repo root also has package-lock.json; Turbopack must use this dir as root so chunks/runtime resolve correctly. */
const webRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /** Align with turbopack.root — avoids monorepo parent lockfile overriding trace root. */
  outputFileTracingRoot: webRoot,
  typescript: {
    /** Production build typecheck — app + API routes only (excludes tests/scripts). */
    tsconfigPath: "./tsconfig.build.json",
  },
  turbopack: {
    root: webRoot,
  },
  async rewrites() {
    return [
      /** Drawer VM routes live under /api/admin/view-models (not /api/admin/v2) — Turbopack dev mis-resolves nested v2 API segments. */
      {
        source: "/api/admin/v2/view-models/:path*",
        destination: "/api/admin/view-models/:path*",
      },
      /** UI V2 lives under `app/adminV2/`; serve it under `/admin/v2` so middleware’s `/admin/*` allowlist applies (no separate /adminV2 rules needed). */
      { source: "/admin/v2", destination: "/adminV2/workspace" },
      { source: "/admin/v2/:path*", destination: "/adminV2/:path*" },
      /** Allow lowercase bookmarks in case-sensitive deploys. */
      { source: "/adminv2", destination: "/adminV2/workspace" },
      { source: "/adminv2/:path*", destination: "/adminV2/:path*" },
    ];
  },
};

export default nextConfig;
