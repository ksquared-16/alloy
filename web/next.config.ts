import { execSync } from "node:child_process";
import path from "path";
import { fileURLToPath } from "url";

import type { NextConfig } from "next";

/** App lives in `web/` while Alloy repo root also has package-lock.json; Turbopack must use this dir as root so chunks/runtime resolve correctly. */
const webRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * The commit this bundle was built from — inlined at build time so the RUNNING deploy can prove its
 * own SHA (data-build-sha in the DOM, GET /api/runtime-info, a console line). Prefers the host's git
 * env (Vercel/CI), falls back to `git rev-parse`. This is the single answer to "is staging actually
 * running the committed fix?" — no more guessing between code and deploy.
 */
function resolveBuildSha(): string {
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_BUILD_SHA;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim().slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { cwd: webRoot }).toString().trim();
  } catch {
    return "unknown";
  }
}

const BUILD_SHA = resolveBuildSha();

const nextConfig: NextConfig = {
  /** Build SHA inlined for client + server (see resolveBuildSha) — proves the deployed commit. */
  env: {
    NEXT_PUBLIC_BUILD_SHA: BUILD_SHA,
  },
  /** Align with turbopack.root — avoids monorepo parent lockfile overriding trace root. */
  outputFileTracingRoot: webRoot,
  /** Load `unpdf` (server-only, text-only PDF extraction) from node_modules at runtime
   *  rather than bundling it — see lib/pos/processingCase/structure/pdfTextExtract.ts. */
  serverExternalPackages: ["unpdf"],
  typescript: {
    /** Production build typecheck — app + API routes only (excludes tests/scripts). */
    tsconfigPath: "./tsconfig.build.json",
    /**
     * Opt-in escape hatch for the local certification loop, which rebuilds the production bundle
     * repeatedly and validates types out-of-band via `tsc --noEmit`. Setting SKIP_BUILD_TYPECHECK=1
     * skips `next build`'s redundant in-build typecheck to shave minutes per iteration. OFF by default,
     * so CI and every normal build still fail on type errors.
     */
    ignoreBuildErrors: process.env.SKIP_BUILD_TYPECHECK === "1",
  },
  turbopack: {
    root: webRoot,
  },
  async redirects() {
    return [
      /** Phase H1: transitional public routes → canonical `/admin`. */
      { source: "/adminV2", destination: "/organization", permanent: false },
      { source: "/adminV2/:path*", destination: "/admin/:path*", permanent: false },
      { source: "/admin/v2", destination: "/organization", permanent: false },
      { source: "/admin/v2/:path*", destination: "/admin/:path*", permanent: false },
      { source: "/adminv2", destination: "/organization", permanent: false },
      { source: "/adminv2/:path*", destination: "/admin/:path*", permanent: false },
      /** Organization is the canonical configuration landing; Settings remains the sub-surface namespace. */
      { source: "/admin", destination: "/organization", permanent: false },
      { source: "/admin/settings", destination: "/organization", permanent: false },
      { source: "/admin/settings/:path*", destination: "/settings/:path*", permanent: false },
      { source: "/settings", destination: "/organization", permanent: false },
      { source: "/settings/organization", destination: "/organization", permanent: false },
      /**
       * Surfaces rename — `/settings/layouts` is no longer product IA. Canonical
       * user-facing route is `/settings/surfaces`. Storage terms (entity_layouts,
       * LayoutDoc, surface, layout_key) are unchanged implementation details.
       */
      { source: "/settings/layouts", destination: "/settings/surfaces", permanent: false },
      { source: "/settings/layouts/:path*", destination: "/settings/surfaces/:path*", permanent: false },
      /**
       * Operational Calculations rename — the canonical route is `/settings/calculations`.
       * `/settings/analytics` aliases to it for compatibility. (`analytics` remains the
       * storage/route folder; the visible product path is calculations.)
       */
      { source: "/settings/analytics", destination: "/settings/calculations", permanent: false },
      { source: "/settings/analytics/:path*", destination: "/settings/calculations/:path*", permanent: false },
      /** Data Model workspace — canonical route is `/settings/fields`. */
      { source: "/settings/data-model", destination: "/settings/fields", permanent: false },
      { source: "/settings/data-model/:path*", destination: "/settings/fields/:path*", permanent: false },
      /** Legacy Settings aliases → canonical Platform Configuration routes. */
      { source: "/settings/entity-labels", destination: "/settings/entities", permanent: false },
      { source: "/settings/entity-labels/:path*", destination: "/settings/entities", permanent: false },
      { source: "/settings/label-entities", destination: "/settings/entities", permanent: false },
      { source: "/settings/label-entities/:path*", destination: "/settings/entities", permanent: false },
      { source: "/settings/user-access", destination: "/settings/users-roles", permanent: false },
      { source: "/settings/user-access/:path*", destination: "/settings/users-roles", permanent: false },
      { source: "/settings/kpis", destination: "/settings/calculations?tab=visibility", permanent: false },
      { source: "/settings/kpis/:path*", destination: "/settings/calculations?tab=visibility", permanent: false },
      /** Legacy admin system hub → Platform Configuration equivalents. */
      { source: "/legacy-admin/system/person-fields", destination: "/settings/fields?entity=person", permanent: false },
      { source: "/legacy-admin/system/location-fields", destination: "/settings/fields?entity=location", permanent: false },
      { source: "/legacy-admin/system/customer-fields", destination: "/settings/fields?entity=customer", permanent: false },
      { source: "/legacy-admin/system/job-fields", destination: "/settings/fields?entity=opportunity", permanent: false },
      { source: "/legacy-admin/system/opportunity-fields", destination: "/settings/fields?entity=opportunity", permanent: false },
      { source: "/legacy-admin/system/vendor-fields", destination: "/settings/fields", permanent: false },
      { source: "/legacy-admin/system/schedule-fields", destination: "/settings/fields", permanent: false },
      { source: "/legacy-admin/system/document-fields", destination: "/settings/documents/document-fields", permanent: false },
      { source: "/legacy-admin/system/entity-labels", destination: "/settings/entities", permanent: false },
      { source: "/legacy-admin/system/statuses", destination: "/settings/statuses", permanent: false },
      { source: "/legacy-admin/system/option-sets", destination: "/settings/option-sets", permanent: false },
      { source: "/legacy-admin/system/option-sets/:setKey", destination: "/settings/option-sets/:setKey", permanent: false },
      { source: "/legacy-admin/system/field-sections", destination: "/settings/field-sections", permanent: false },
      { source: "/legacy-admin/system/layouts", destination: "/settings/surfaces", permanent: false },
      { source: "/legacy-admin/system/layouts/:path*", destination: "/settings/surfaces", permanent: false },
      { source: "/legacy-admin/system", destination: "/organization", permanent: false },
      { source: "/legacy-admin/system/access-control", destination: "/settings/users-roles", permanent: false },
      { source: "/legacy-admin/system/roles", destination: "/settings/users-roles", permanent: false },
      { source: "/legacy-admin/system/departments", destination: "/settings/departments", permanent: false },
      { source: "/legacy-admin/system/work-units", destination: "/settings/work-units", permanent: false },
      { source: "/legacy-admin/system/pipelines", destination: "/settings/processes", permanent: false },
      { source: "/legacy-admin/system/customer-person-roles", destination: "/settings/relationships", permanent: false },
      { source: "/legacy-admin/system/person-relationship-types", destination: "/settings/relationships?tab=person-relationships", permanent: false },
      /** Broken legacy hub links under /admin/system → Platform Configuration. */
      { source: "/admin/system", destination: "/organization", permanent: false },
      { source: "/admin/system/person-fields", destination: "/settings/fields?entity=person", permanent: false },
      { source: "/admin/system/location-fields", destination: "/settings/fields?entity=location", permanent: false },
      { source: "/admin/system/customer-fields", destination: "/settings/fields?entity=customer", permanent: false },
      { source: "/admin/system/job-fields", destination: "/settings/fields?entity=opportunity", permanent: false },
      { source: "/admin/system/opportunity-fields", destination: "/settings/fields?entity=opportunity", permanent: false },
      { source: "/admin/system/vendor-fields", destination: "/settings/fields", permanent: false },
      { source: "/admin/system/schedule-fields", destination: "/settings/fields", permanent: false },
      { source: "/admin/system/document-fields", destination: "/settings/documents/document-fields", permanent: false },
      { source: "/admin/system/entity-labels", destination: "/settings/entities", permanent: false },
      { source: "/admin/system/statuses", destination: "/settings/statuses", permanent: false },
      { source: "/admin/system/option-sets", destination: "/settings/option-sets", permanent: false },
      { source: "/admin/system/option-sets/:setKey", destination: "/settings/option-sets/:setKey", permanent: false },
      { source: "/admin/system/field-sections", destination: "/settings/field-sections", permanent: false },
      { source: "/admin/system/layouts", destination: "/settings/surfaces", permanent: false },
      { source: "/admin/system/access-control", destination: "/settings/users-roles", permanent: false },
      { source: "/admin/system/roles", destination: "/settings/users-roles", permanent: false },
      { source: "/admin/system/departments", destination: "/settings/departments", permanent: false },
      { source: "/admin/system/work-units", destination: "/settings/work-units", permanent: false },
      { source: "/admin/system/pipelines", destination: "/settings/processes", permanent: false },
      { source: "/admin/system/customer-person-roles", destination: "/settings/relationships", permanent: false },
      { source: "/admin/system/person-relationship-types", destination: "/settings/relationships?tab=person-relationships", permanent: false },
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
      { source: "/organization", destination: "/adminV2/settings/organization" },
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
