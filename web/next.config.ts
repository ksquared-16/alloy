import path from "path";
import { fileURLToPath } from "url";

import type { NextConfig } from "next";

/** App lives in `web/` while Alloy repo root also has package-lock.json; Turbopack must use this dir as root so chunks/runtime resolve correctly. */
const webRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /** Align with turbopack.root — avoids monorepo parent lockfile overriding trace root. */
  outputFileTracingRoot: webRoot,
  /** Load `unpdf` (server-only, text-only PDF extraction) from node_modules at runtime
   *  rather than bundling it — see lib/pos/processingCase/structure/pdfTextExtract.ts. */
  serverExternalPackages: ["unpdf"],
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
      { source: "/adminV2", destination: "/settings", permanent: false },
      { source: "/adminV2/:path*", destination: "/admin/:path*", permanent: false },
      { source: "/admin/v2", destination: "/settings", permanent: false },
      { source: "/admin/v2/:path*", destination: "/admin/:path*", permanent: false },
      { source: "/adminv2", destination: "/settings", permanent: false },
      { source: "/adminv2/:path*", destination: "/admin/:path*", permanent: false },
      /** Configuration Runtime Phase 2A — canonical Settings at `/settings`. */
      { source: "/admin", destination: "/settings", permanent: false },
      { source: "/admin/settings", destination: "/settings", permanent: false },
      { source: "/admin/settings/:path*", destination: "/settings/:path*", permanent: false },
      /**
       * Surfaces rename — `/settings/layouts` is no longer product IA. Canonical
       * user-facing route is `/settings/surfaces`. Storage terms (entity_layouts,
       * LayoutDoc, surface, layout_key) are unchanged implementation details.
       */
      { source: "/settings/layouts", destination: "/settings/surfaces", permanent: false },
      { source: "/settings/layouts/:path*", destination: "/settings/surfaces/:path*", permanent: false },
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
       * Configuration Runtime Phase 2A — canonical Settings URLs.
       *
       * Surfaces workspace: the canonical user-facing route `/settings/surfaces`
       * serves the Surfaces Configuration page (Context → Queue → Workspace).
       * Must precede the generic `/settings/:path*` rewrite so it matches first.
       * URL stays `/settings/surfaces` (rewrite, not redirect), so `usePathname()`
       * sees it. The legacy `/adminV2/settings/layouts` tree remains as
       * compatibility for queue/drawer layout authoring, but is no longer product IA.
       */
      { source: "/settings/surfaces", destination: "/adminV2/settings/surfaces" },
      { source: "/settings/surfaces/:path*", destination: "/adminV2/settings/surfaces/:path*" },
      { source: "/settings", destination: "/adminV2/settings" },
      { source: "/settings/:path*", destination: "/adminV2/settings/:path*" },
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
       * Legacy `/admin/*` (non-settings) rewrites to `app/adminV2/*`.
       * Settings hub is served via `/settings` rewrite above.
       */
      { source: "/admin/:path*", destination: "/adminV2/:path*" },
    ];
  },
};

export default nextConfig;
