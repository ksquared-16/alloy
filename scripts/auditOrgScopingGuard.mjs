#!/usr/bin/env node
/**
 * auditOrgScopingGuard.mjs
 *
 * Phase 2 spike: a HEURISTIC scan that flags API route handlers which appear to
 * read/write tenant tables through a service-role Supabase client without a
 * visible org-scope signal (`.eq("org_id", …)`, an `org_id` filter inside `.or`,
 * an `org_id` value on insert/update, or a known assertion helper).
 *
 * This is intentionally a WARNING tool, not a linter:
 * - It is purely textual. It cannot follow helpers, variables, or RPCs, and it
 *   does not understand RLS, FK-chain assertions in other modules, or global/
 *   catalog tables that legitimately have no `org_id`.
 * - False positives are expected (e.g. scope enforced in an imported helper).
 * - False negatives are possible (e.g. a stringly-built `.eq` or dynamic table).
 *
 * It does NOT fail CI on its own. The Phase 2 contract test asserts only that the
 * migrated route subset is clean; the global list is advisory until a later phase.
 *
 * Usage:
 *   node scripts/auditOrgScopingGuard.mjs            # print a report
 *   node scripts/auditOrgScopingGuard.mjs --json     # emit JSON
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const apiRoot = path.join(repoRoot, "web/app/api");

/**
 * Curated set of known tenant-scoped tables (rows belong to a single org).
 * Global/catalog tables (verticals, *_statuses, discount_codes, pricing_addons,
 * location_types, action_definitions/action_placements — which carry nullable
 * org_id for system defaults) are intentionally excluded to reduce noise.
 */
const TENANT_TABLES = new Set([
    "opportunities",
    "jobs",
    "contacts",
    "customers",
    "customer_persons",
    "customer_members",
    "persons",
    "schedules",
    "workflows",
    "workflow_runs",
    "vendors",
    "subscriptions",
    "locations",
    "payments",
    "documents",
    "form_submissions",
    "messages",
    "communications",
    "metric_definitions",
    "metric_snapshots",
    "events",
    "audit_logs",
    "notes",
    "tasks",
]);

const ORG_SCOPE_SIGNALS = [
    /\.eq\(\s*["'`]org_id["'`]/,
    /org_id\.eq\./,
    /org_id\.is\.null/,
    /org_id\s*:/, // insert/update payload sets org_id
    /assertRowOrg\b/,
    /assertEntityDrawerRecordReadable\b/,
    /[A-Za-z]+InOrg\b/,
    /scopeDimensionsFromAccess\b/,
    /requireAdminOrgContextLight\b/,
];

function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name === "route.ts" || entry.name === "route.tsx") out.push(full);
    }
    return out;
}

function apiPathFor(file) {
    const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
    return "/" + rel.replace(/^web\/app\//, "").replace(/\/route\.tsx?$/, "");
}

const fromTableRe = /\.from\(\s*["'`]([a-z_]+)["'`]/g;

function analyzeSource(src) {
    const usesServiceRole = /createAdminClient\b|supabaseAdmin/.test(src);

    const tablesTouched = new Set();
    let m;
    fromTableRe.lastIndex = 0;
    while ((m = fromTableRe.exec(src))) {
        if (TENANT_TABLES.has(m[1])) tablesTouched.add(m[1]);
    }

    const hasOrgScopeSignal = ORG_SCOPE_SIGNALS.some((re) => re.test(src));

    const risk = usesServiceRole && tablesTouched.size > 0 && !hasOrgScopeSignal ? "warn" : "ok";

    return {
        usesServiceRole,
        tenantTables: [...tablesTouched].sort(),
        hasOrgScopeSignal,
        risk,
    };
}

/** Scan every API route file and return one finding per file. */
export function scanOrgScoping() {
    const files = walk(apiRoot);
    return files.map((file) => {
        const src = fs.readFileSync(file, "utf8");
        return {
            file: path.relative(repoRoot, file).replace(/\\/g, "/"),
            route: apiPathFor(file),
            ...analyzeSource(src),
        };
    });
}

/** Convenience accessor for a single route by its API path (used by tests). */
export function findingForRoute(routePath) {
    return scanOrgScoping().find((f) => f.route === routePath) ?? null;
}

function main() {
    const findings = scanOrgScoping();
    const warns = findings.filter((f) => f.risk === "warn");
    if (process.argv.includes("--json")) {
        process.stdout.write(JSON.stringify({ total: findings.length, warnings: warns }, null, 2) + "\n");
        return;
    }
    console.log(`Org-scoping guard (heuristic) — scanned ${findings.length} route files.`);
    console.log(`Flagged ${warns.length} route(s) using a service-role client on tenant tables`);
    console.log(`without a visible org-scope signal. These are WARNINGS, not failures.\n`);
    for (const f of warns) {
        console.log(`  ⚠ ${f.route}`);
        console.log(`     tables: ${f.tenantTables.join(", ")}`);
    }
    console.log(`\nLimitations: textual heuristic; scope enforced in imported helpers,`);
    console.log(`FK-chain assertions, and RLS are not detected. Verify before acting.`);
}

const invokedDirectly = path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
