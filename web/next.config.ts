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
  async redirects() {
    return [
      /** Phase H1: transitional public routes → canonical `/admin`. */
      { source: "/adminV2", destination: "/admin", permanent: false },
      { source: "/adminV2/:path*", destination: "/admin/:path*", permanent: false },
      { source: "/admin/v2", destination: "/admin", permanent: false },
      { source: "/admin/v2/:path*", destination: "/admin/:path*", permanent: false },
      { source: "/adminv2", destination: "/admin", permanent: false },
      { source: "/adminv2/:path*", destination: "/admin/:path*", permanent: false },
      /** Phase G: settings hub alias → admin config landing (subpaths keep /admin/settings/...). */
      { source: "/admin/settings", destination: "/admin", permanent: false },
    ];
  },
  async rewrites() {
    return [
      /** Drawer VM routes live under /api/admin/view-models (not /api/admin/v2) — Turbopack dev mis-resolves nested v2 API segments. */
      {
        source: "/api/admin/v2/view-models/:path*",
        destination: "/api/admin/view-models/:path*",
      },
      /**
       * Phase G: canonical operator workspace at `/workspace` (browser URL; serves AdminV2 tree).
       */
      { source: "/workspace", destination: "/adminV2/workspace" },
      { source: "/workspace/work-unit/:workUnitSlug", destination: "/adminV2/workspace/work-unit/:workUnitSlug" },
      {
        source: "/workspace/work-unit/:workUnitSlug/:recordId",
        destination: "/adminV2/workspace/work-unit/:workUnitSlug/:recordId",
      },
      /**
       * Canonical `/admin` serves AdminV2 config landing; `/admin/*` rewrites to `app/adminV2/*`.
       * Legacy implementation is physical at `app/legacy-admin/` → `/legacy-admin/*`.
       */
      { source: "/admin", destination: "/adminV2/settings" },
      { source: "/admin/:path*", destination: "/adminV2/:path*" },
    ];
  },
};

export default nextConfig;
