/**
 * Authority Path Inventory — transitive authority-tier classification for every API route.
 *
 * Alloy has no server actions, so `web/app/api/**\/route.ts` is the whole mutation and
 * read surface. Middleware does not gate `/api/*` (see `requiresOperatorSession`), and
 * ~96% of routes hold a service-role Supabase client that bypasses RLS. Therefore the
 * authority a route enforces *in its own module graph* is the only authority it has.
 *
 * A route's tier is the strongest authority primitive reachable from it by following
 * first-party imports (`@/…`), so gates that live behind wrappers such as
 * `canManageUsersAndRoles` or `requireAnalyticsV2AdminContext` are credited correctly.
 *
 * Tiers (monotonic):
 *   0 none        — no authority primitive reachable
 *   1 session     — an authenticated user is resolved and absence is rejected
 *   2 role        — org membership / portal eligibility / admin-vs-ops role keys
 *   3 permission  — a `permissionKeys` grant is consulted
 *
 * Orthogonal authorization models (a route may be tier 0 and still be governed):
 *   token   — bearer capability token in the URL (public forms, action links, tour booking)
 *   webhook — provider callback verified out-of-band
 *   envflag — gated behind an environment flag
 *
 * Run: node web/scripts/auditAuthorityPaths.mjs [--json]
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const WEB = resolve(import.meta.dirname, "..");
const API_ROOT = join(WEB, "app", "api");
const MAX_DEPTH = 6;

/** Terminal authority primitives, matched against module source. */
const PRIMITIVES = [
    // tier 3 — permission grants
    { tier: 3, name: "permissionKeys", re: /permissionKeys\b/ },
    { tier: 3, name: "hasPermission", re: /has[A-Za-z]*Permission\s*\(|assert[A-Za-z]*Permission\s*\(|forbidUnless[A-Za-z]*Permission\s*\(/ },
    // tier 2 — role / membership
    { tier: 2, name: "portalEligible", re: /portalEligible\b/ },
    { tier: 2, name: "roleKeys", re: /\broleKeys\b/ },
    { tier: 2, name: "roleCompare", re: /\b(role|ctx\.role|auth\.role)\s*!==\s*["']admin["']/ },
    { tier: 2, name: "compatibilityPortalRole", re: /compatibilityPortalRole\s*\(/ },
    { tier: 2, name: "ALLOWED_ROLES", re: /ALLOWED_ROLES\b/ },
    // tier 1 — authenticated session
    { tier: 1, name: "getCachedAuthUser", re: /getCachedAuthUser(Id)?\s*\(/ },
    { tier: 1, name: "auth.getUser", re: /auth\s*\.\s*getUser\s*\(/ },
    { tier: 1, name: "getAdminContext", re: /getAdminContext(Cached)?\s*\(/ },
];

/** Orthogonal models. */
const MODELS = [
    { name: "token", re: /resolvePublicForm|resolveTourPublicBookingLink|actionLink|action_token|\btoken\b\s*:\s*string|params.*\btoken\b/ },
    { name: "webhook", re: /twilio|resend|x-twilio-signature|svix|webhook/i },
    { name: "envflag", re: /process\.env\.[A-Z0-9_]*(ENABLED|ALLOW|DEV)[A-Z0-9_]*/ },
];

function walk(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p, out);
        else if (entry.name === "route.ts") out.push(p);
    }
    return out;
}

/** Resolve a first-party specifier (`@/lib/x`) or relative import to a file on disk. */
function resolveSpecifier(spec, fromFile) {
    let base;
    if (spec.startsWith("@/")) base = join(WEB, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
    else return null; // third-party — not part of the first-party authority graph
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, join(base, "index.ts"), join(base, "index.tsx")]) {
        if (existsSync(cand) && statSync(cand).isFile()) return cand;
    }
    return null;
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
const sourceCache = new Map();

function readSource(file) {
    if (!sourceCache.has(file)) sourceCache.set(file, readFileSync(file, "utf8"));
    return sourceCache.get(file);
}

/**
 * Strongest tier reachable from `file`, plus the module and primitive that supplied it.
 * `seen` prevents cycles; depth bounds the walk.
 */
function analyze(file, seen = new Set(), depth = 0) {
    if (depth > MAX_DEPTH || seen.has(file)) return { tier: 0, via: null, primitive: null };
    seen.add(file);

    const src = readSource(file);
    let best = { tier: 0, via: null, primitive: null };

    for (const p of PRIMITIVES) {
        if (p.tier > best.tier && p.re.test(src)) {
            best = { tier: p.tier, via: file, primitive: p.name };
        }
    }
    if (best.tier === 3) return best;

    for (const m of src.matchAll(IMPORT_RE)) {
        const target = resolveSpecifier(m[1], file);
        if (!target) continue;
        const sub = analyze(target, seen, depth + 1);
        if (sub.tier > best.tier) best = sub;
        if (best.tier === 3) break;
    }
    return best;
}

const routes = walk(API_ROOT).sort();
const rows = routes.map((file) => {
    const src = readSource(file);
    const { tier, via, primitive } = analyze(file);
    const models = MODELS.filter((m) => m.re.test(src)).map((m) => m.name);
    return {
        route: file.slice(WEB.length + 1),
        tier,
        primitive,
        via: via ? via.slice(WEB.length + 1) : null,
        serviceRole: /supabaseAdmin|serverServiceClient/.test(src),
        models,
    };
});

const TIER_LABEL = ["none", "session", "role", "permission"];
const byTier = [0, 1, 2, 3].map((t) => rows.filter((r) => r.tier === t));

if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ total: rows.length, rows }, null, 2));
} else {
    console.log(`Authority Path Inventory — ${rows.length} API routes\n`);
    for (const t of [0, 1, 2, 3]) {
        console.log(`tier ${t} ${TIER_LABEL[t].padEnd(10)} ${String(byTier[t].length).padStart(4)}`);
    }
    const svc = rows.filter((r) => r.serviceRole);
    console.log(`\nservice-role (RLS-bypassing): ${svc.length}`);
    console.log(`service-role AND tier 0:      ${svc.filter((r) => r.tier === 0).length}`);

    console.log(`\n--- tier 0 (no authority primitive reachable) ---`);
    for (const r of byTier[0]) {
        const tags = [r.serviceRole ? "service-role" : "", ...r.models].filter(Boolean).join(",");
        console.log(`  ${r.route}${tags ? `  [${tags}]` : ""}`);
    }

    console.log(`\n--- tier 3 (permission-gated) ---`);
    for (const r of byTier[3]) console.log(`  ${r.route}  (${r.primitive} @ ${r.via})`);
}
