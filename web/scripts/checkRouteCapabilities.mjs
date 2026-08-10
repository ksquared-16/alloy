/**
 * W-14 — Declared route capability table (I-24), regression lock RL-10.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §8.
 *
 * **What this replaces.** `auditAuthorityPaths.mjs` classified a route by grepping its import
 * closure for authority primitives. C1 records the result: the census over-reported enforcement
 * by ~30×, because *mentioning* `permissionKeys` and *branching on* it are indistinguishable to
 * a text search. Its `/permissionKeys\b/` primitive credited 440 routes to a module that only
 * resolves and returns the bundle. A census that infers a gate cannot be made sound; the plan's
 * answer is to stop inferring. Every route **declares** the capability it requires as a value,
 * and conformance becomes a lookup.
 *
 * **The declaration grain is the exported HTTP method, not the file.** `05…§9`'s first limit:
 * one `route.ts` may export `GET`, `POST`, `PATCH` and `DELETE` with different gates, and a
 * file-grained table would inherit — and make structural — the single largest weakness of the
 * static census it replaces.
 *
 * **The subject is discovered, never enumerated.** The route set comes from disk on every run.
 * A new `route.ts`, or a new method on an existing one, is a violation on the commit that adds
 * it. That is RL-10, and it is the only form of the exit criterion that survives drift: the
 * plan sized this workstream against 539 routes, the M2 amendment re-measured 559, and this
 * check counts what is actually there today. A criterion phrased as a number is already stale
 * when it is read.
 *
 * **Three declaration states**, because "no gate" must be an auditable assertion rather than an
 * absence:
 *   - `declared` — the method requires `capability`, a key the permission catalog holds.
 *   - `none`     — the method legitimately requires no capability, and `reason` says why. This
 *                  is a reviewed assertion; it is what makes an ungated route auditable.
 *   - `pending`  — not yet reviewed. This is W-15's burndown backlog, and it is ratcheted: the
 *                  count may shrink and may never grow. W-14 delivers the mechanism and the
 *                  pilot slice; W-15's exit criterion is that `pending` reaches zero.
 *
 * Run: node web/scripts/checkRouteCapabilities.mjs [--json] [--pending] [--suggest] [--seed]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const WEB = resolve(import.meta.dirname, "..");
const API_ROOT = join(WEB, "app", "api");
const TABLE_PATH = join(WEB, "scripts", "routeCapabilities.declared.json");
const MAX_DEPTH = 6;

/** The HTTP verbs Next.js treats as route handlers. */
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

// ---------------------------------------------------------------------------
// Source access
// ---------------------------------------------------------------------------

const sourceCache = new Map();
function read(file) {
    let src = sourceCache.get(file);
    if (src === undefined) {
        src = readFileSync(file, "utf8");
        sourceCache.set(file, src);
    }
    return src;
}

/**
 * Comments are stripped before any declaration or capability literal is read. The permission
 * catalog discovery module paid for this lesson already: a key named only in a doc comment is
 * not an enforcement site, and W-8's own removal left doc-comment references behind that a
 * naive scan still counts.
 */
function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function walkRoutes(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walkRoutes(p, out);
        else if (/^route\.tsx?$/.test(entry.name)) out.push(p);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Method discovery
// ---------------------------------------------------------------------------

/**
 * Exported HTTP handlers, in every form Next.js accepts:
 *   export async function GET(…)      export function GET(…)
 *   export const GET = …              export { GET }      export { handler as POST }
 *
 * A verb that appears only in a string, a comment, or a local (unexported) helper is not a
 * handler. Over-reporting here would inflate the table with methods that do not exist and make
 * the stale check noisy; under-reporting would leave a real handler undeclared, which is the
 * failure this workstream exists to prevent — so the aliased `export { x as POST }` form is
 * matched explicitly rather than assumed absent.
 */
function exportedMethods(file) {
    const src = stripComments(read(file));
    const found = new Set();

    for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Z]+)\b/g)) {
        if (HTTP_METHODS.includes(m[1])) found.add(m[1]);
    }
    for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([A-Z]+)\s*[:=]/g)) {
        if (HTTP_METHODS.includes(m[1])) found.add(m[1]);
    }
    for (const block of src.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const clause of block[1].split(",")) {
            const parts = clause.trim().split(/\s+as\s+/);
            const exported = (parts[1] ?? parts[0] ?? "").trim();
            if (HTTP_METHODS.includes(exported)) found.add(exported);
        }
    }
    return [...found].sort();
}

// ---------------------------------------------------------------------------
// Capability-key evidence (advisory — for authoring the table, never for passing it)
// ---------------------------------------------------------------------------

/** A permission key: lowercase dotted segments. Matches the catalog's own grammar. */
const PERMISSION_KEY_GRAMMAR = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;
const TS_KEY_LITERAL = /["'`]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["'`]/g;

function resolveImport(spec, fromFile) {
    let base;
    if (spec.startsWith("@/")) base = join(WEB, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
    else return null;
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, join(base, "index.ts"), join(base, "index.tsx")]) {
        if (existsSync(cand) && statSync(cand).isFile()) return cand;
    }
    return null;
}

const IMPORT_SPEC = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;

/**
 * Capability keys reachable from a route by first-party imports.
 *
 * This is EVIDENCE FOR A HUMAN AUTHORING THE TABLE, and it is deliberately not consulted by the
 * check. Wiring it into pass/fail would rebuild exactly the inference the census got wrong —
 * reachability is not enforcement. `--suggest` prints it; nothing else reads it.
 */
function reachableCapabilityKeys(file, seen = new Set(), depth = 0) {
    if (depth > MAX_DEPTH || seen.has(file)) return new Set();
    seen.add(file);
    const src = stripComments(read(file));
    const keys = new Set();
    for (const m of src.matchAll(TS_KEY_LITERAL)) {
        if (PERMISSION_KEY_GRAMMAR.test(m[1])) keys.add(m[1]);
    }
    for (const m of src.matchAll(IMPORT_SPEC)) {
        const target = resolveImport(m[1], file);
        if (!target) continue;
        for (const k of reachableCapabilityKeys(target, seen, depth + 1)) keys.add(k);
    }
    return keys;
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/**
 * @param tablePath - override, used only by the negative fixtures in RL-10. They must be able to
 *   prove this check FAILS without mutating the committed table: a run killed between the mutation
 *   and its restore would otherwise leave the repository dirty and the ratchet wrong.
 */
export function runRouteCapabilityCheck(tablePath = TABLE_PATH) {
    const table = JSON.parse(readFileSync(tablePath, "utf8"));
    const declared = table.routes ?? {};

    const onDisk = new Map();
    for (const abs of walkRoutes(API_ROOT).sort()) {
        onDisk.set(relative(WEB, abs).split("\\").join("/"), exportedMethods(abs));
    }

    const violations = [];
    const counts = { routes: onDisk.size, methods: 0, declared: 0, none: 0, pending: 0 };

    for (const [route, methods] of onDisk) {
        const entry = declared[route];
        if (!entry) {
            violations.push({
                route,
                kind: "undeclared-route",
                detail: `route file is not in the declared table (methods: ${methods.join(", ") || "none exported"})`,
            });
            continue;
        }
        for (const method of methods) {
            counts.methods += 1;
            const decl = entry[method];
            if (!decl) {
                violations.push({ route, kind: "undeclared-method", detail: `${method} is exported but not declared` });
                continue;
            }
            if (decl.status === "declared") {
                counts.declared += 1;
                if (!decl.capability || !PERMISSION_KEY_GRAMMAR.test(decl.capability)) {
                    violations.push({
                        route,
                        kind: "malformed-capability",
                        detail: `${method} is status 'declared' but capability ${JSON.stringify(decl.capability)} is not a catalog key`,
                    });
                }
            } else if (decl.status === "none") {
                counts.none += 1;
                // The plan's clause: `capability: null` is only auditable if it carries a stated
                // reason. An empty or perfunctory reason is the same hole with a nicer shape.
                if (!decl.reason || decl.reason.trim().length < 40) {
                    violations.push({
                        route,
                        kind: "unreasoned-none",
                        detail: `${method} declares no capability but gives no substantive reason`,
                    });
                }
            } else if (decl.status === "pending") {
                counts.pending += 1;
            } else {
                violations.push({
                    route,
                    kind: "unknown-status",
                    detail: `${method} has status ${JSON.stringify(decl.status)} (expected declared | none | pending)`,
                });
            }
        }
        // A declaration for a method the file no longer exports is dead weight that hides the
        // method's later return. The lists may only shrink.
        for (const method of Object.keys(entry)) {
            if (!methods.includes(method)) {
                violations.push({ route, kind: "stale-method", detail: `${method} is declared but not exported` });
            }
        }
    }

    for (const route of Object.keys(declared)) {
        if (!onDisk.has(route)) {
            violations.push({ route, kind: "stale-route", detail: "declared but no such route file exists" });
        }
    }

    // The pending backlog is ratcheted so W-15 can only make progress. Without this, the table
    // passes forever by declaring every new route `pending`.
    const ceiling = table.ratchet?.max_pending;
    if (typeof ceiling === "number" && counts.pending > ceiling) {
        violations.push({
            route: "(ratchet)",
            kind: "ratchet-pending",
            detail: `${counts.pending} pending declarations exceeds the ceiling of ${ceiling}; lower the ceiling as routes are reviewed, never raise it`,
        });
    }

    return { ok: violations.length === 0, counts, ratchet: { max_pending: ceiling ?? null }, violations, onDisk: [...onDisk] };
}

/** Route → methods → suggested capability evidence. Authoring aid only. */
export function suggestCapabilities() {
    return walkRoutes(API_ROOT)
        .sort()
        .map((abs) => ({
            route: relative(WEB, abs).split("\\").join("/"),
            methods: exportedMethods(abs),
            reachableKeys: [...reachableCapabilityKeys(abs)].sort(),
        }));
}

/**
 * Rewrite the table from disk, preserving every existing declaration and adding `pending` for
 * anything new. Never downgrades a reviewed entry — seeding is additive by construction, so a
 * careless `--seed` cannot silently erase a `declared` or `none` decision.
 */
export function seedTableForGeneration() {
    return seedTable();
}

function seedTable() {
    const table = existsSync(TABLE_PATH)
        ? JSON.parse(readFileSync(TABLE_PATH, "utf8"))
        : { reviewed: "", note: "", ratchet: { max_pending: 0 }, routes: {} };
    const routes = {};
    let pending = 0;

    for (const abs of walkRoutes(API_ROOT).sort()) {
        const rel = relative(WEB, abs).split("\\").join("/");
        const prior = table.routes?.[rel] ?? {};
        const entry = {};
        for (const method of exportedMethods(abs)) {
            entry[method] = prior[method] ?? { status: "pending" };
            if (entry[method].status === "pending") pending += 1;
        }
        routes[rel] = entry;
    }

    table.routes = routes;
    table.ratchet = { ...(table.ratchet ?? {}), max_pending: Math.min(table.ratchet?.max_pending ?? Infinity, pending) };
    writeFileSync(TABLE_PATH, `${JSON.stringify(table, null, 2)}\n`);
    return { routes: Object.keys(routes).length, pending };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("checkRouteCapabilities.mjs");
if (invokedDirectly) {
    if (process.argv.includes("--seed")) {
        const { routes, pending } = seedTable();
        console.log(`seeded ${routes} routes into scripts/routeCapabilities.declared.json (${pending} pending)`);
        process.exit(0);
    }
    if (process.argv.includes("--suggest")) {
        console.log(JSON.stringify(suggestCapabilities(), null, 2));
        process.exit(0);
    }

    let report;
    try {
        report = runRouteCapabilityCheck();
    } catch (e) {
        console.error("[route-capabilities] check failed to run:", e);
        process.exit(2);
    }

    if (process.argv.includes("--json")) {
        const { onDisk, ...rest } = report;
        console.log(JSON.stringify(rest, null, 2));
    } else {
        const c = report.counts;
        console.log(`Declared route capability table (W-14 · I-24) — ${c.routes} API routes, ${c.methods} handlers\n`);
        console.log(`  declared (requires a capability)   ${String(c.declared).padStart(4)}`);
        console.log(`  none (reviewed, reason recorded)   ${String(c.none).padStart(4)}`);
        console.log(`  pending (W-15 backlog)             ${String(c.pending).padStart(4)}   ceiling ${report.ratchet.max_pending}`);

        if (process.argv.includes("--pending")) {
            console.log(`\n--- pending ---`);
            const table = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
            for (const [route, entry] of Object.entries(table.routes ?? {})) {
                const methods = Object.entries(entry)
                    .filter(([, d]) => d.status === "pending")
                    .map(([m]) => m);
                if (methods.length) console.log(`  ${route}  [${methods.join(", ")}]`);
            }
        }

        if (report.violations.length) {
            console.log(`\n✗ ${report.violations.length} violation(s):`);
            for (const v of report.violations) console.log(`    [${v.kind}] ${v.route} — ${v.detail}`);
            console.log(
                `\n  Every exported handler under web/app/api must appear in\n` +
                    `  scripts/routeCapabilities.declared.json with status 'declared', 'none' (with a reason),\n` +
                    `  or 'pending'. Run with --seed to add newly-added routes as pending.`
            );
        } else {
            console.log(`\n✓ every exported API handler is declared.`);
        }
    }

    process.exit(report.ok ? 0 : 1);
}
