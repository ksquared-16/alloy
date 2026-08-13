import { execSync } from "node:child_process";
import path from "path";
import { fileURLToPath } from "url";

import type { NextConfig } from "next";

/** App lives in `web/` while Alloy repo root also has package-lock.json; Turbopack must use this dir as root so chunks/runtime resolve correctly. */
const webRoot = path.dirname(fileURLToPath(import.meta.url));

// Loud, unmissable announcement when the in-build typecheck is skipped — a skipped typecheck must
// never pass silently. See `typescript.ignoreBuildErrors` below. Off by default.
if (process.env.SKIP_BUILD_TYPECHECK === "1") {
  console.warn(
    "\n⚠️  SKIP_BUILD_TYPECHECK=1 — next build's in-build typecheck is DISABLED for this build.\n" +
      "   Types are NOT gated by this build. Validate out-of-band: `tsc --noEmit`. Never use for CI/promotion/certification.\n",
  );
}

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
  /**
   * Production-cert build isolation: when `ALLOY_PROD_CERT_DIST` is set, build/serve from a SEPARATE
   * output dir so a `next build` for performance certification never clobbers the running `next dev`
   * server's `.next` (the one the operator's browser is on). Unset → default `.next` (dev unaffected).
   */
  ...(process.env.ALLOY_PROD_CERT_DIST ? { distDir: ".next-prodcert" } : {}),
  /**
   * Next 16 blocks cross-origin `/_next/*` in dev. Operators often open 127.0.0.1 while
   * NEXT_PUBLIC_APP_URL is localhost (or the reverse) — allow both so assets can load.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  /** Build SHA inlined for client + server (see resolveBuildSha) — proves the deployed commit. */
  env: {
    NEXT_PUBLIC_BUILD_SHA: BUILD_SHA,
  },
  /** Align with turbopack.root — avoids monorepo parent lockfile overriding trace root. */
  outputFileTracingRoot: webRoot,
  /**
   * OCR ships an English model at `ocr-data/eng.traineddata`, loaded at RUNTIME by a path string
   * (`process.cwd()/ocr-data` — see ocrExtract.ts). Next's file tracer cannot detect a dynamic path,
   * so on serverless (Vercel) the model would be missing from the function bundle → OCR fails with an
   * honest "couldn't read" state. Force-include it (and the tesseract.js WASM core + node worker
   * script, which are likewise loaded by path) for the upload route that performs OCR.
   */
  outputFileTracingIncludes: {
    "/api/admin/documents/upload": [
      "./ocr-data/**",
      "./node_modules/tesseract.js/src/worker-script/**",
      "./node_modules/tesseract.js-core/**",
      // mupdf loads its WASM binary by path at runtime — the tracer can't see a dynamic path.
      "./node_modules/mupdf/dist/*.wasm",
    ],
  },
  /**
   * Server-only packages loaded from node_modules at runtime rather than bundled:
   *  - `unpdf`      — text-only PDF text extraction (pdfTextExtract.ts).
   *  - `tesseract.js` — OCR engine. MUST be external: it spawns a Node worker thread that loads a
   *    sibling `worker-script/node/index.js` by path; bundling breaks that path (`/ROOT/node_modules/...`
   *    not found → worker hangs the upload). External keeps the on-disk layout intact.
   *  - `mupdf`      — scanned-PDF page rasterization (WASM). MUST be external: its `mupdf-wasm.wasm`
   *    is loaded by path at runtime, and (unlike pdf.js, which throws "Cannot transfer object of
   *    unsupported type" once bundled in the Next server) it renders reliably in-server.
   *  See lib/pos/processingCase/structure/{pdfTextExtract,ocrExtract}.ts.
   */
  serverExternalPackages: ["unpdf", "tesseract.js", "mupdf"],
  typescript: {
    /** Production build typecheck — app + API routes only (excludes tests/scripts). */
    tsconfigPath: "./tsconfig.build.json",
    /**
     * Opt-in escape hatch for the local certification loop, which rebuilds the production bundle
     * repeatedly and validates types out-of-band via `tsc --noEmit`. Setting SKIP_BUILD_TYPECHECK=1
     * skips `next build`'s redundant in-build typecheck to shave minutes per iteration.
     *
     * STRICT + OFF BY DEFAULT: only the exact string "1" enables it, so a stray "true"/"yes"/"0" does
     * NOT. It is set nowhere in CI, scripts, .env, or the toolkit config — a promotion/release build
     * cannot inherit it. When it IS active the build announces it loudly (below), so a skipped
     * typecheck can never pass silently. The final certification build must run WITHOUT this set.
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
       * Organization Financials — canonical under `/organization/financials`.
       * Legacy Commercial tool chapters redirect here. Programs catalog stays on `/organization/programs`.
       */
      { source: "/settings/commercial", destination: "/organization/financials", permanent: false },
      { source: "/settings/commercial/tuition", destination: "/organization/financials?chapter=tuition", permanent: false },
      { source: "/settings/commercial/programs", destination: "/organization/programs", permanent: false },
      { source: "/settings/commercial/programs/:path*", destination: "/organization/programs", permanent: false },
      { source: "/admin/commercial/programs", destination: "/organization/programs", permanent: false },
      { source: "/admin/commercial/programs/:path*", destination: "/organization/programs", permanent: false },
      { source: "/adminV2/commercial/programs", destination: "/organization/programs", permanent: false },
      { source: "/adminV2/settings/commercial/programs", destination: "/organization/programs", permanent: false },
      { source: "/adminV2/settings/commercial/programs/:path*", destination: "/organization/programs", permanent: false },
      { source: "/adminV2/settings/commercial", destination: "/organization/financials", permanent: false },
      { source: "/adminV2/settings/commercial/tuition", destination: "/organization/financials?chapter=tuition", permanent: false },
      /**
       * Organization productization — completed domains under `/organization/{name}`.
       * Legacy `/settings/…` bookmarks redirect here.
       */
      { source: "/settings/surfaces", destination: "/organization/surfaces", permanent: false },
      { source: "/settings/surfaces/:path*", destination: "/organization/surfaces", permanent: false },
      { source: "/settings/layouts", destination: "/organization/surfaces", permanent: false },
      { source: "/settings/layouts/:path*", destination: "/organization/surfaces", permanent: false },
      { source: "/settings/users-roles", destination: "/organization/access", permanent: false },
      { source: "/settings/users-roles/:path*", destination: "/organization/access", permanent: false },
      { source: "/settings/user-access", destination: "/organization/access", permanent: false },
      { source: "/settings/user-access/:path*", destination: "/organization/access", permanent: false },
      { source: "/settings/processes", destination: "/organization/processes", permanent: false },
      { source: "/settings/processes/:path*", destination: "/organization/processes", permanent: false },
      { source: "/settings/business-processes", destination: "/organization/processes", permanent: false },
      { source: "/settings/business-processes/:path*", destination: "/organization/processes", permanent: false },
      /**
       * Action Buttons developer CRUD — do not redirect to the rejected operator Commands product.
       * `/organization/commands` remains an internal capability diagnostics route only.
       */
      { source: "/settings/actions", destination: "/adminV2/settings/actions", permanent: false },
      { source: "/settings/actions/:path*", destination: "/adminV2/settings/actions", permanent: false },
      { source: "/configuration/commands", destination: "/organization/commands", permanent: false },
      { source: "/configuration/commands/:path*", destination: "/organization/commands", permanent: false },
      { source: "/settings/financials", destination: "/organization/financials", permanent: false },
      { source: "/settings/financials/:path*", destination: "/organization/financials", permanent: false },
      { source: "/settings/locations", destination: "/organization/locations", permanent: false },
      { source: "/settings/locations/:path*", destination: "/organization/locations", permanent: false },
      /**
       * Data Model productization — canonical `/organization/data-model?section=…`.
       * List pages redirect into the shell; option-set detail `[setKey]` stays until embedded.
       */
      { source: "/settings/entities", destination: "/organization/data-model?section=entities", permanent: false },
      { source: "/settings/fields", destination: "/organization/data-model?section=fields", permanent: false },
      { source: "/settings/statuses", destination: "/organization/data-model?section=statuses", permanent: false },
      { source: "/settings/option-sets", destination: "/organization/data-model?section=option-sets", permanent: false },
      { source: "/settings/relationships", destination: "/organization/data-model?section=relationships", permanent: false },
      { source: "/settings/calculations", destination: "/organization/operational-intelligence", permanent: false },
      { source: "/settings/data-model", destination: "/organization/data-model", permanent: false },
      { source: "/settings/data-model/:path*", destination: "/organization/data-model", permanent: false },
      /**
       * Operational Calculations rename — analytics aliases into Data Model Calculations.
       */
      { source: "/settings/analytics", destination: "/organization/data-model?section=calculations", permanent: false },
      { source: "/settings/analytics/:path*", destination: "/organization/data-model?section=calculations", permanent: false },
      /** Legacy Settings aliases → canonical Platform Configuration routes. */
      { source: "/settings/entity-labels", destination: "/organization/data-model?section=entities", permanent: false },
      { source: "/settings/entity-labels/:path*", destination: "/organization/data-model?section=entities", permanent: false },
      { source: "/settings/label-entities", destination: "/organization/data-model?section=entities", permanent: false },
      { source: "/settings/label-entities/:path*", destination: "/organization/data-model?section=entities", permanent: false },
      { source: "/settings/kpis", destination: "/organization/data-model?section=calculations", permanent: false },
      { source: "/settings/kpis/:path*", destination: "/organization/data-model?section=calculations", permanent: false },
      /** Legacy admin system hub → Platform Configuration equivalents. */
      { source: "/legacy-admin/system/person-fields", destination: "/organization/data-model?section=fields&entity=person", permanent: false },
      { source: "/legacy-admin/system/location-fields", destination: "/organization/data-model?section=fields&entity=location", permanent: false },
      { source: "/legacy-admin/system/customer-fields", destination: "/organization/data-model?section=fields&entity=customer", permanent: false },
      { source: "/legacy-admin/system/job-fields", destination: "/organization/data-model?section=fields&entity=opportunity", permanent: false },
      { source: "/legacy-admin/system/opportunity-fields", destination: "/organization/data-model?section=fields&entity=opportunity", permanent: false },
      { source: "/legacy-admin/system/vendor-fields", destination: "/organization/data-model?section=fields", permanent: false },
      { source: "/legacy-admin/system/schedule-fields", destination: "/organization/data-model?section=fields", permanent: false },
      { source: "/legacy-admin/system/document-fields", destination: "/settings/documents/document-fields", permanent: false },
      { source: "/legacy-admin/system/entity-labels", destination: "/organization/data-model?section=entities", permanent: false },
      { source: "/legacy-admin/system/statuses", destination: "/settings/statuses", permanent: false },
      { source: "/legacy-admin/system/option-sets", destination: "/settings/option-sets", permanent: false },
      { source: "/legacy-admin/system/option-sets/:setKey", destination: "/settings/option-sets/:setKey", permanent: false },
      { source: "/legacy-admin/system/field-sections", destination: "/settings/field-sections", permanent: false },
      { source: "/legacy-admin/system/layouts", destination: "/organization/surfaces", permanent: false },
      { source: "/legacy-admin/system/layouts/:path*", destination: "/organization/surfaces", permanent: false },
      { source: "/legacy-admin/system", destination: "/organization", permanent: false },
      { source: "/legacy-admin/system/access-control", destination: "/organization/access", permanent: false },
      { source: "/legacy-admin/system/roles", destination: "/organization/access", permanent: false },
      { source: "/legacy-admin/system/departments", destination: "/settings/departments", permanent: false },
      { source: "/legacy-admin/system/work-units", destination: "/settings/work-units", permanent: false },
      { source: "/legacy-admin/system/pipelines", destination: "/organization/processes", permanent: false },
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
      { source: "/admin/system/entity-labels", destination: "/organization/data-model?section=entities", permanent: false },
      { source: "/admin/system/statuses", destination: "/settings/statuses", permanent: false },
      { source: "/admin/system/option-sets", destination: "/settings/option-sets", permanent: false },
      { source: "/admin/system/option-sets/:setKey", destination: "/settings/option-sets/:setKey", permanent: false },
      { source: "/admin/system/field-sections", destination: "/settings/field-sections", permanent: false },
      { source: "/admin/system/layouts", destination: "/organization/surfaces", permanent: false },
      { source: "/admin/system/access-control", destination: "/organization/access", permanent: false },
      { source: "/admin/system/roles", destination: "/organization/access", permanent: false },
      { source: "/admin/system/departments", destination: "/settings/departments", permanent: false },
      { source: "/admin/system/work-units", destination: "/settings/work-units", permanent: false },
      { source: "/admin/system/pipelines", destination: "/organization/processes", permanent: false },
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
       * Organization Surfaces / Access / Processes — browser URLs under `/organization/*`.
       * Must precede the exact `/organization` rewrite.
       */
      { source: "/organization/surfaces", destination: "/adminV2/settings/organization/surfaces" },
      { source: "/organization/surfaces/:path*", destination: "/adminV2/settings/organization/surfaces/:path*" },
      /**
       * Organization Staff — employment, deliberately a sibling of Access rather
       * than a section inside it. Must precede the exact `/organization` rewrite.
       */
      { source: "/organization/staff", destination: "/adminV2/settings/organization/staff" },
      { source: "/organization/staff/:path*", destination: "/adminV2/settings/organization/staff/:path*" },
      { source: "/organization/access", destination: "/adminV2/settings/organization/access" },
      { source: "/organization/access/:path*", destination: "/adminV2/settings/organization/access/:path*" },
      { source: "/organization/processes", destination: "/adminV2/settings/organization/processes" },
      { source: "/organization/processes/:path*", destination: "/adminV2/settings/organization/processes/:path*" },
      { source: "/organization/commands", destination: "/adminV2/settings/organization/commands" },
      { source: "/organization/commands/:path*", destination: "/adminV2/settings/organization/commands/:path*" },
      { source: "/organization/data-model", destination: "/adminV2/settings/organization/data-model" },
      { source: "/organization/data-model/:path*", destination: "/adminV2/settings/organization/data-model/:path*" },
      { source: "/organization/operational-intelligence", destination: "/adminV2/settings/organization/operational-intelligence" },
      {
        source: "/organization/operational-intelligence/:path*",
        destination: "/adminV2/settings/organization/operational-intelligence/:path*",
      },
      /** Organization Calculations — Path B authoring surface (not OI). */
      { source: "/organization/calculations", destination: "/adminV2/settings/organization/calculations" },
      {
        source: "/organization/calculations/:path*",
        destination: "/adminV2/settings/organization/calculations/:path*",
      },

      /**
       * Organization Programs & Locations — relationship landing.
       * Must precede exact `/organization` rewrite. Collections remain at
       * `/organization/programs` and `/organization/locations`.
       */
      { source: "/organization/programs-locations", destination: "/adminV2/settings/organization/programs-locations" },
      { source: "/organization/programs-locations/:path*", destination: "/adminV2/settings/organization/programs-locations/:path*" },
      /**
       * Organization Locations — browser URL `/organization/locations`.
       * Must precede the exact `/organization` rewrite. Compatibility `/settings/locations`
       * remains via the generic `/settings/:path*` rewrite.
       */
      { source: "/organization/locations", destination: "/adminV2/settings/locations" },
      { source: "/organization/locations/:path*", destination: "/adminV2/settings/locations/:path*" },
      /**
       * Organization Programs — browser URL `/organization/programs` (and optional
       * `?programId=` selection). Must precede the exact `/organization` rewrite.
       */
      { source: "/organization/programs", destination: "/adminV2/settings/organization/programs" },
      { source: "/organization/programs/:path*", destination: "/adminV2/settings/organization/programs/:path*" },
      /**
       * Organization Financials — browser URL `/organization/financials`.
       * Must precede the exact `/organization` rewrite.
       */
      { source: "/organization/financials", destination: "/adminV2/settings/organization/financials" },
      { source: "/organization/financials/:path*", destination: "/adminV2/settings/organization/financials/:path*" },
      { source: "/organization", destination: "/adminV2/settings/organization" },
      { source: "/settings/:path*", destination: "/adminV2/settings/:path*" },
      /**
       * Phase G: canonical operator workspace at `/workspace` (browser URL; serves AdminV2 tree).
       */
      { source: "/workspace", destination: "/adminV2/workspace" },
      { source: "/workspace/work-unit/:workUnitSlug", destination: "/adminV2/workspace/work-unit/:workUnitSlug" },
      // RA-2: the legacy `/:recordId` path form is retired — a selected record is the `?subject_id`
      // query, which rides along the base rewrite above. No path-recordId rewrite.
      /**
       * Legacy `/admin/*` (non-settings) rewrites to `app/adminV2/*`.
       * Settings hub is served via `/settings` rewrite above.
       */
      { source: "/admin/:path*", destination: "/adminV2/:path*" },
    ];
  },
};

export default nextConfig;
