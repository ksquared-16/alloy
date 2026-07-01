#!/usr/bin/env node
/**
 * generate-api-inventory.mjs
 *
 * Static inventory of Next.js App Router API routes under web/app/api/**.
 * Emits docs/api/api-index.md (the authoritative auto-generated route table)
 * and prints per-domain table fragments for the curated domain docs.
 *
 * This is a DOCS tool only — it reads route source and never changes runtime
 * behavior. Extraction is heuristic; treat the output as a starting map and
 * verify auth/scoping against the handler when it matters.
 *
 * Usage:
 *   node scripts/generate-api-inventory.mjs            # write docs/api/api-index.md
 *   node scripts/generate-api-inventory.mjs --tables   # also write /tmp domain fragments
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const apiRoot = path.join(repoRoot, "web/app/api");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name === "route.ts" || entry.name === "route.tsx") out.push(full);
  }
  return out;
}

const methodRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
const constMethodRe = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*[:=]/g;
const reexportRe = /export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

function apiPathFor(file) {
  const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
  return "/" + rel.replace(/^web\/app\//, "").replace(/\/route\.tsx?$/, "");
}

function detectMethods(src) {
  const methods = new Set();
  let m;
  methodRe.lastIndex = 0;
  while ((m = methodRe.exec(src))) methods.add(m[1]);
  constMethodRe.lastIndex = 0;
  while ((m = constMethodRe.exec(src))) methods.add(m[1]);
  // re-export style: export { GET } from "..."
  reexportRe.lastIndex = 0;
  while ((m = reexportRe.exec(src))) {
    for (const name of m[1].split(",").map((s) => s.trim())) {
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)) methods.add(name);
    }
  }
  return [...methods];
}

function detectAuth(src) {
  const labels = [];
  if (/\bloadAdminRouteGate\b/.test(src)) labels.push("route-gate");
  if (/\bgetAdminAccessContextCached\b|\bloadAdminAccessBundleCached\b/.test(src)) labels.push("access-scope");
  if (/\bgetAdminContextCached\b|\bgetAdminContext\b/.test(src)) labels.push("admin-context");
  if (/requireAdminOrgContextLight|getAdminOrgContextLight/.test(src)) labels.push("admin-context-light");
  if (/\brequireAdminOrOps\b/.test(src)) labels.push("admin-or-ops");
  if (/\brequireAdmin\b/.test(src)) labels.push("require-admin");
  if (/\brequirePortalAdmin\b/.test(src)) labels.push("portal-admin");
  if (/UsersRolesManageAuth|canManageUsersAndRoles/.test(src)) labels.push("users-roles-gate");
  if (/requireAnalytics\w*|AnalyticsV2Admin/.test(src)) labels.push("analytics-gate");
  if (/getBosAuthContext|bosAuth|assertCapability|resolveCapability|requireCapability|capabilityRegistry/.test(src))
    labels.push("bos-capability");
  if (/verifyTwilio|TWILIO_AUTH_TOKEN|svix|verifyWebhook|Webhook\(/.test(src)) labels.push("provider-signature");
  if (/x-cron-token|CRON_TOKEN|INTERNAL_.*TOKEN/.test(src)) labels.push("cron-token");
  if (/ALLOY_PUBLIC_ORG_ID|resolvePublicOrg|publicOrgId/.test(src)) labels.push("public-org");
  if (/\btoken\b/.test(src) && /\/(public|action|forms|tour-booking)\//.test(src)) labels.push("token");
  // Generic scoped gate helpers not matched above (e.g. require*Auth, load*AdminContext, forbidUnless*).
  if (
    !labels.length &&
    (/\brequire[A-Z][A-Za-z]*(Auth|Context|Access|Mutate|Gate)\b/.test(src) ||
      /\bload[A-Z][A-Za-z]*AdminContext\b/.test(src) ||
      /\bforbidUnless[A-Z]\w+\b/.test(src))
  )
    labels.push("scoped-gate");
  // Re-export routes inherit auth from the target module.
  if (!labels.length && /export\s*\{[^}]*\}\s*from/.test(src)) labels.push("re-export");
  return labels;
}

function detectValidation(src) {
  if (/from\s+["']zod["']|\bz\.(object|string|number|enum|array|boolean|union|literal)/.test(src)) return "zod";
  if (/\.safeParse\(|\.parse\(|zodErrorResponse|validate[A-Z]\w+\(/.test(src)) return "schema";
  if (/status:\s*400/.test(src)) return "manual";
  return "none";
}

function detectTables(src) {
  const tables = new Set();
  let m;
  const tableRe = /\.from\(\s*["'`]([a-zA-Z0-9_]+)["'`]\s*\)/g;
  while ((m = tableRe.exec(src))) tables.add(m[1]);
  return [...tables].sort();
}

function detectRpcs(src) {
  const rpcs = new Set();
  let m;
  const rpcRe = /\.rpc\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g;
  while ((m = rpcRe.exec(src))) rpcs.add(m[1]);
  return [...rpcs].sort();
}

function detectWrites(src) {
  return /\.(insert|update|upsert|delete)\(/.test(src) || /\.rpc\(/.test(src);
}

function detectEvents(src) {
  return /workflow_events|emitWorkflowEvent|recordWorkflowEvent|enqueueWorkflow|runWorkflow|revalidateTag|executeAdminAction|canonicalOutboundEnqueue/.test(
    src
  );
}

function detectServiceRole(src) {
  return /createAdminClient|createServiceClient|createServiceRoleClient|getServiceRoleClient|SUPABASE_SERVICE_ROLE/.test(
    src
  );
}

// Domain classification — ordered; first match wins.
const DOMAIN_RULES = [
  ["AI / BOS", (p) => /^\/api\/admin\/(ai|agent)\//.test(p) || /^\/api\/admin\/config-layout-assist\//.test(p)],
  [
    "Communications",
    (p) =>
      /^\/api\/admin\/communications?\//.test(p) ||
      /^\/api\/admin\/communication-scheduled-sends/.test(p) ||
      /^\/api\/admin\/inbox\//.test(p) ||
      /^\/api\/webhooks\/(twilio|resend)/.test(p),
  ],
  [
    "Documents / Forms",
    (p) =>
      /^\/api\/admin\/forms\//.test(p) ||
      /^\/api\/admin\/forms$/.test(p) ||
      /^\/api\/admin\/documents?\//.test(p) ||
      /^\/api\/admin\/document-field-definitions/.test(p) ||
      /^\/api\/admin\/pos\//.test(p) ||
      /^\/api\/public\/forms\//.test(p),
  ],
  [
    "Actions / Workflows",
    (p) =>
      /^\/api\/admin\/actions?\b/.test(p) ||
      /^\/api\/admin\/action-(definitions|placements)\b/.test(p) ||
      /^\/api\/admin\/workflows?\b/.test(p) ||
      /^\/api\/admin\/workflow-(runs|events)\b/.test(p) ||
      /^\/api\/admin\/record-actions\b/.test(p) ||
      /^\/api\/admin\/relationship-actions\//.test(p) ||
      /^\/api\/action\//.test(p) ||
      /^\/api\/action-links\//.test(p),
  ],
  [
    "Business Process / Status / Lifecycle",
    (p) =>
      /^\/api\/admin\/lifecycle(-builder|-catalog)?\//.test(p) ||
      /^\/api\/admin\/enrollment-process\//.test(p) ||
      /^\/api\/admin\/enrollment-status-transition\//.test(p) ||
      /^\/api\/admin\/status-(options|definitions|transition-rules)\b/.test(p) ||
      /^\/api\/admin\/job-statuses\b/.test(p) ||
      /^\/api\/admin\/schedule-statuses\b/.test(p) ||
      /^\/api\/admin\/vendor-statuses\b/.test(p) ||
      /^\/api\/admin\/pipelines?\b/.test(p) ||
      /^\/api\/admin\/pipeline-stages\b/.test(p) ||
      /^\/api\/admin\/business-process-layout-assignments\b/.test(p) ||
      /^\/api\/admin\/departments\//.test(p),
  ],
  [
    "Workspace / Queue / Focus Panel",
    (p) =>
      /^\/api\/admin\/work-units\//.test(p) ||
      /^\/api\/admin\/work-units$/.test(p) ||
      /^\/api\/admin\/queues\//.test(p) ||
      /^\/api\/admin\/workspace/.test(p) ||
      /^\/api\/admin\/layout-(runtime|proof)\//.test(p) ||
      /^\/api\/admin\/(v2\/)?view-models\//.test(p) ||
      /^\/api\/admin\/operational-enrollment\//.test(p) ||
      /^\/api\/admin\/global-search\b/.test(p) ||
      /^\/api\/admin\/(analytics|metrics)\//.test(p),
  ],
  [
    "Entity / Record / Resolver",
    (p) =>
      /^\/api\/admin\/entity\//.test(p) ||
      /^\/api\/admin\/related\//.test(p) ||
      /^\/api\/admin\/intake\//.test(p) ||
      /^\/api\/admin\/processing\//.test(p) ||
      /^\/api\/admin\/(persons?|contacts?|customers?|customer-[a-z-]+|opportunit[a-z-]+|jobs?|schedules?|schedule-[a-z-]+|locations?|vendors?|subscriptions?|payments?|financials|operational-tasks|child-[a-z-]+|placement-candidates|tours|deletion-eligibility)\b/.test(
        p
      ),
  ],
  [
    "Internal / System / Diagnostics",
    (p) =>
      /^\/api\/admin\/(debug|dev)\//.test(p) ||
      /^\/api\/admin\/access-scope-debug\b/.test(p) ||
      /^\/api\/admin\/db-relationships\b/.test(p) ||
      /^\/api\/admin\/(tenant|vertical)-bootstrap\b/.test(p) ||
      /^\/api\/admin\/send-password-reset\b/.test(p) ||
      /^\/api\/(book-v2|leads|marketing|vendor-application|verticals)\b/.test(p) ||
      /^\/api\/public\/(booking-config|field-definitions|tour-booking)\b/.test(p),
  ],
  // Everything else under /api/admin is configuration control-plane.
  ["Admin / Configuration", () => true],
];

function classifyDomain(p) {
  for (const [name, test] of DOMAIN_RULES) if (test(p)) return name;
  return "Admin / Configuration";
}

function classifyStability(p, src) {
  if (/\/(debug|dev)\//.test(p) || /access-scope-debug|db-relationships|layout-proof|-shadow\b|cleanup-test|persistence-audit|debug-vendor-enrichment/.test(p))
    return "internal";
  if (/^\/api\/admin\/(agent\/v[012]|config-layout-assist)\b/.test(p)) return "experimental";
  if (/^\/api\/webhooks\//.test(p)) return "webhook";
  if (/^\/api\/(public|book-v2|action|action-links)\b/.test(p) || /^\/api\/(leads|marketing|vendor-application|verticals)\b/.test(p))
    return "public/tokenized";
  return "admin-only";
}

const files = walk(apiRoot).sort();
const rows = files.map((file) => {
  const src = fs.readFileSync(file, "utf8");
  const p = apiPathFor(file);
  return {
    apiPath: p,
    file: path.relative(repoRoot, file).replace(/\\/g, "/"),
    methods: detectMethods(src),
    auth: detectAuth(src),
    validation: detectValidation(src),
    serviceRole: detectServiceRole(src),
    writes: detectWrites(src),
    events: detectEvents(src),
    tables: detectTables(src),
    rpcs: detectRpcs(src),
    domain: classifyDomain(p),
    stability: classifyStability(p, src),
    lines: src.split("\n").length,
  };
});

// ---- write docs/api/api-index.md ----
const DOMAIN_ORDER = [
  "Admin / Configuration",
  "Workspace / Queue / Focus Panel",
  "Entity / Record / Resolver",
  "Business Process / Status / Lifecycle",
  "Actions / Workflows",
  "Documents / Forms",
  "Communications",
  "AI / BOS",
  "Internal / System / Diagnostics",
];

const DOMAIN_DOC = {
  "Admin / Configuration": "admin-configuration-api.md",
  "Workspace / Queue / Focus Panel": "workspace-api.md",
  "Entity / Record / Resolver": "entity-record-api.md",
  "Business Process / Status / Lifecycle": "business-process-api.md",
  "Actions / Workflows": "actions-workflows-api.md",
  "Documents / Forms": "documents-forms-api.md",
  Communications: "communications-api.md",
  "AI / BOS": "ai-bos-api.md",
  "Internal / System / Diagnostics": "internal-system-api.md",
};

function esc(s) {
  return String(s).replace(/\|/g, "\\|");
}

function methodsCell(r) {
  return r.methods.length ? r.methods.join(" ") : "—";
}
function authCell(r) {
  return r.auth.length ? r.auth.join(", ") : "none-detected";
}
function tablesCell(r) {
  const all = [...r.tables, ...r.rpcs.map((x) => `rpc:${x}`)];
  if (!all.length) return "—";
  const shown = all.slice(0, 6).join(", ");
  return all.length > 6 ? `${shown}, +${all.length - 6}` : shown;
}

const now = new Date().toISOString().slice(0, 10);
let out = "";
out += "# API index (generated)\n\n";
out += `**Generated:** ${now} by \`scripts/generate-api-inventory.mjs\`. Do not edit by hand — re-run the script.\n\n`;
out += `**Routes:** ${rows.length} \`route.ts\` handlers under \`web/app/api/**\`.\n\n`;
out += "This is a static, heuristic inventory. Columns are extracted from source text:\n\n";
out +=
  "- **Auth** — detected gate helpers (`route-gate`, `admin-context`, `access-scope`, `admin-or-ops`, `provider-signature`, `token`, …). `none-detected` means no known helper matched (verify manually — may delegate to a shared loader).\n";
out += "- **Val** — validation signal: `zod`, `schema`, `manual` (explicit 400 checks), or `none`.\n";
out += "- **SR** — uses the service-role Supabase client (`createAdminClient`). Org scoping is then the handler's responsibility.\n";
out += "- **W** — performs writes (insert/update/upsert/delete/rpc). **E** — emits events / revalidation / workflow side effects.\n";
out += "- **Tables** — first tables/RPCs referenced via `.from()` / `.rpc()` (truncated).\n\n";

// summary by domain + stability
out += "## Counts\n\n";
out += "| Domain | Routes |\n|---|---|\n";
for (const d of DOMAIN_ORDER) {
  const c = rows.filter((r) => r.domain === d).length;
  out += `| [${d}](${DOMAIN_DOC[d]}) | ${c} |\n`;
}
out += `| **Total** | **${rows.length}** |\n\n`;

out += "| Stability | Routes |\n|---|---|\n";
const stabilities = [...new Set(rows.map((r) => r.stability))].sort();
for (const s of stabilities) out += `| ${s} | ${rows.filter((r) => r.stability === s).length} |\n`;
out += "\n";

for (const d of DOMAIN_ORDER) {
  const drows = rows.filter((r) => r.domain === d).sort((a, b) => a.apiPath.localeCompare(b.apiPath));
  if (!drows.length) continue;
  out += `## ${d}\n\n`;
  out += `Detailed conventions: [\`${DOMAIN_DOC[d]}\`](${DOMAIN_DOC[d]}).\n\n`;
  out += "| Methods | Path | Auth | Val | SR | W | E | Stability | Tables / RPC |\n";
  out += "|---|---|---|---|---|---|---|---|---|\n";
  for (const r of drows) {
    out += `| ${methodsCell(r)} | \`${r.apiPath}\` | ${authCell(r)} | ${r.validation} | ${
      r.serviceRole ? "y" : "—"
    } | ${r.writes ? "y" : "—"} | ${r.events ? "y" : "—"} | ${r.stability} | ${esc(tablesCell(r))} |\n`;
  }
  out += "\n";
}

const outDir = path.join(repoRoot, "docs/api");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "api-index.md"), out);

// machine-readable copy for the audit / other tooling
fs.writeFileSync(path.join(outDir, "api-inventory.json"), JSON.stringify(rows, null, 2));

console.log(`Wrote docs/api/api-index.md (${rows.length} routes) and docs/api/api-inventory.json`);
for (const d of DOMAIN_ORDER) {
  console.log(`  ${String(rows.filter((r) => r.domain === d).length).padStart(3)}  ${d}`);
}
