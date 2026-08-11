/**
 * W-40 — Every unauthenticated side-effect route authenticates its sender (tier A, build-time).
 * Regression lock `RL-30`.
 *
 * Invariant `S-1` (`01…§17`): *"any endpoint that accepts a request from an unauthenticated party
 * and produces a side effect MUST authenticate the sender before the side effect — by signature, by
 * hashed token, or by an explicit, reviewed exemption. **Held today** by both webhook families and
 * the delegated-link family; V2 must make it a **property, not a pattern**."*
 *
 * This file is the "property, not a pattern" half. Until it existed, S-1 was held by convention:
 * every family that held it held it because someone had written it that way, and nothing in the
 * build could tell the difference between a route that verifies its sender and one that forgot.
 *
 * ## Why W-4's check does not already cover this
 *
 * `checkServiceClientPrincipal.mjs` is the closest thing in the tree and it answers a DIFFERENT
 * question. Its subject is *"this route holds a service-role client"*; this one's subject is
 * *"this route is reachable without a session and produces a side effect"*. Neither set contains
 * the other, and the gap between them is the exposure:
 *
 *   - A route that mutates through the ANON client, or through no Supabase client at all — one that
 *     sends mail, enqueues a job, calls a third party, writes a file — is invisible to W-4's
 *     predicate entirely. It holds no service client, so it is never the subject of anything.
 *   - A route that holds a service client but only READS is W-4's subject and not this one.
 *
 * W-4's own header states its limit: *"This check proves a principal is resolved. It does not prove
 * the result gates the handler."* This check proves something W-4 does not attempt — that a caller
 * who presents no session is nonetheless identified before the handler changes state.
 *
 * ## The subject, and how a side effect is recognised
 *
 * Next.js route modules export one function per HTTP method. A module exporting `POST`, `PUT`,
 * `PATCH` or `DELETE` produces a side effect **by declaration** — that is the framework's own
 * contract, not an inference about the body — so the subject is derived from the export table
 * rather than from what the handler appears to do. A route exporting only `GET`/`HEAD`/`OPTIONS`
 * is out of scope here; disclosure by unauthenticated read is `W-39`'s question, not `S-1`'s.
 *
 * Bare re-export routes (`export { POST } from "…"`) are followed, for the reason W-4 records: an
 * `ExportDeclaration` carries no identifier reference in the module body, and three admin routes
 * once read as ungated purely because the walker never followed that edge.
 *
 * ## The three ways a sender may be authenticated
 *
 * Each is a STRUCTURAL terminal, discovered through real bindings by the shared graph walker, so
 * wrappers above it are found rather than hand-listed:
 *
 *   1. `session`   — `x.auth.getUser()` / `.getClaims()` / `.getSession()`. The caller presented a
 *                    session; the route is not unauthenticated at all and leaves the subject.
 *   2. `signature` — a constant-time comparison or a webhook signature verification:
 *                    `new Webhook(secret).verify(…)` (svix), `crypto.timingSafeEqual(…)`, or the
 *                    first-party `timingSafeEqualHex(…)`. This is the webhook family's model.
 *   3. `credential`— the row is selected BY the bearer credential: a PostgREST `.eq()` whose column
 *                    is `token`, `token_hash`, `secret` or `api_key`. This is the delegated-link
 *                    family's model, and it is the property the allow-list already reasons in
 *                    ("Row selected by the bearer token"). A caller-supplied id filtered on `id`
 *                    is deliberately NOT a credential — that is the obscurity-not-authorization
 *                    shape `W-4`'s baseline was frozen over.
 *
 * ## The honest limit — read this before citing the number
 *
 * This check proves the sender is **authenticated**; it does not prove the check **precedes** the
 * side effect, and it does not prove the credential is bound to the SUBJECT being mutated. Ordering
 * is `RL-32`'s tier C question (*"webhook signature rejection before any side effect"*), and
 * subject-binding is `I-4`'s, verified per-route in the exemption register's reasons. A route that
 * hashes a token after it has already written would pass here. That is a narrower claim than the
 * invariant, and the register carries the rest.
 *
 * ## The ratchet
 *
 * Three outcomes per side-effecting route:
 *   - authenticates its sender    → pass
 *   - listed in `exemptions`      → pass; a reviewed, reasoned exemption naming its model
 *   - anything else               → FAIL
 *
 * The list may only shrink, and the ceiling is enforced here rather than only in the lock — the
 * fix W-4 had to make after `e7e585010` grew a list in an allow-list-only commit with `prebuild`
 * still green. Over the ceiling is a violation; under it is stale, because a ceiling left above a
 * fallen floor hands out that many free exemptions.
 *
 * Run: node web/scripts/checkUnauthenticatedSideEffects.mjs [--json] [--out <path>]
 * Exit: 0 clean · 1 violations or stale entries · 2 internal error
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { createBindingGraph, isSessionPrincipalCall, ts } from "./lib/bindingGraph.mjs";

const WEB = resolve(import.meta.dirname, "..");
const API_ROOT = join(WEB, "app", "api");
const REGISTER_PATH = join(import.meta.dirname, "unauthenticatedSideEffects.allowlist.json");

/** Methods whose export declares a side effect. Next.js's contract, not our inference. */
const SIDE_EFFECT_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Columns whose equality filter means "the row is selected BY the credential". */
const CREDENTIAL_COLUMNS = new Set(["token", "token_hash", "secret", "api_key"]);

// ---------------------------------------------------------------------------
// The three terminals
// ---------------------------------------------------------------------------

/** `new Webhook(secret).verify(…)`, `timingSafeEqual(…)`, `timingSafeEqualHex(…)`. */
function isSignatureVerification(node) {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (ts.isIdentifier(callee)) {
        return callee.text === "timingSafeEqual" || callee.text === "timingSafeEqualHex";
    }
    if (!ts.isPropertyAccessExpression(callee)) return false;
    if (callee.name.text === "timingSafeEqual") return true;
    // `new Webhook(secret).verify(payload, headers)` — the svix family.
    if (callee.name.text !== "verify") return false;
    const owner = callee.expression;
    if (ts.isNewExpression(owner) && ts.isIdentifier(owner.expression)) {
        return owner.expression.text === "Webhook";
    }
    return ts.isIdentifier(owner) && /webhook/i.test(owner.text);
}

/** `.eq("token_hash", …)` — the row is selected by the bearer credential. */
function isCredentialSelection(node) {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "eq") return false;
    const first = node.arguments[0];
    if (!first || !ts.isStringLiteralLike(first)) return false;
    return CREDENTIAL_COLUMNS.has(first.text);
}

// ---------------------------------------------------------------------------
// Route method detection
// ---------------------------------------------------------------------------

/**
 * Which HTTP methods does this route module export?
 *
 * Follows bare re-export edges, because a re-export route IS the handler it re-exports.
 */
function exportedMethods(graph, file, seen = new Set()) {
    if (seen.has(file)) return new Set();
    seen.add(file);
    const mod = graph.loadModule(file);
    const methods = new Set();
    for (const [name, entry] of mod.exportsByName) {
        if (!SIDE_EFFECT_METHODS.has(name) && !["GET", "HEAD", "OPTIONS"].includes(name)) continue;
        methods.add(name);
        // A re-export edge still declares the method on THIS route; nothing more to follow.
        void entry;
    }
    for (const target of mod.starReexports) {
        for (const m of exportedMethods(graph, target, seen)) methods.add(m);
    }
    return methods;
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

function walkRoutes(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walkRoutes(p, out);
        else if (entry.name === "route.ts" || entry.name === "route.tsx") out.push(p);
    }
    return out;
}

function loadRegister(override) {
    const raw = override ?? JSON.parse(readFileSync(REGISTER_PATH, "utf8"));
    const exemptions = new Map();
    for (const e of raw.exemptions ?? []) exemptions.set(e.route, e);
    return { raw, exemptions, ratchet: raw.ratchet ?? null };
}

/**
 * @param {object} [registerOverride] — substitute the register instead of reading the committed
 *   file. Used by the regression lock to demonstrate the red state: the check is only meaningful
 *   if an empty register actually fails it.
 */
export function runUnauthenticatedSideEffectCheck(registerOverride) {
    const { raw, exemptions, ratchet } = loadRegister(registerOverride);

    // ONE GRAPH PER TERMINAL, deliberately, and this is not an optimisation left on the table.
    //
    // The first version of this check used a single graph whose predicate matched any of the three
    // and recorded which one via a side-channel variable. It reported `session: 0` while crediting
    // 373 routes — because `exportReaches` MEMOISES `file#export → bool`, so every cache hit
    // returns without ever re-running the predicate, and the side-channel keeps whatever the last
    // uncached walk happened to leave in it. The binary answer was right and the attribution was
    // silently fiction. A separate graph per terminal has its own cache and its own question, so
    // the attribution is as sound as the binary answer.
    const graphs = {
        session: createBindingGraph({ webRoot: WEB, isTerminal: isSessionPrincipalCall }),
        signature: createBindingGraph({ webRoot: WEB, isTerminal: isSignatureVerification }),
        credential: createBindingGraph({ webRoot: WEB, isTerminal: isCredentialSelection }),
    };

    const routes = walkRoutes(API_ROOT).sort();

    const rows = routes.map((file) => {
        const route = relative(WEB, file);
        const methods = [...exportedMethods(graphs.session, file)].sort();
        const sideEffecting = methods.some((m) => SIDE_EFFECT_METHODS.has(m));

        // Priority-ordered, and it short-circuits. `session` is asked first because a route the
        // caller reaches WITH a session is not an unauthenticated surface at all — it leaves S-1's
        // subject, and whether its session then gates correctly is W-15's question, not this one's.
        // The short-circuit is also what keeps this affordable: 358 of 376 side-effecting routes
        // answer on the first graph, so the other two only ever walk the public surface.
        let model = null;
        let evidence = [];
        for (const kind of ["session", "signature", "credential"]) {
            const { found, trace } = graphs[kind].fileReaches(file);
            if (found) {
                model = kind;
                evidence = trace;
                break;
            }
        }

        return { route, methods, sideEffecting, authenticatesSender: model !== null, model, evidence };
    });

    const subject = rows.filter((r) => r.sideEffecting);
    const unauthenticated = subject.filter((r) => !r.authenticatesSender);
    // S-1's actual population: side-effecting, and reachable WITHOUT a session.
    const sessionless = subject.filter((r) => r.model !== "session");

    const violations = [];
    for (const r of unauthenticated) {
        if (exemptions.has(r.route)) continue;
        violations.push({
            route: r.route,
            kind: "unlisted",
            detail:
                "exports a side-effecting method and authenticates no sender — no session, no signature " +
                "verification, and no credential-bound row selection — and is not a reviewed exemption",
        });
    }

    // The ratchet: the list may only shrink. A stale entry is a failure, so fixing the last route
    // of a family forces the register to be updated rather than left as residue.
    const byRoute = new Map(rows.map((r) => [r.route, r]));
    const stale = [];
    for (const route of exemptions.keys()) {
        const row = byRoute.get(route);
        if (!row) {
            stale.push({
                route,
                kind: "stale-missing",
                list: "exemptions",
                detail: "route file no longer exists",
            });
        } else if (!row.sideEffecting) {
            stale.push({
                route,
                kind: "stale-no-side-effect",
                list: "exemptions",
                detail: "route no longer exports a side-effecting method — remove it",
            });
        } else if (row.authenticatesSender) {
            stale.push({
                route,
                kind: "stale-now-authenticates",
                list: "exemptions",
                detail: `route now authenticates its sender (${row.model}) — remove it from the register`,
            });
        }
    }

    const ceiling = ratchet?.max_unauthenticated_side_effect_routes;
    if (typeof ceiling !== "number") {
        violations.push({
            route: "ratchet.max_unauthenticated_side_effect_routes",
            kind: "ratchet-missing",
            detail: 'no numeric ceiling recorded under "ratchet" — the count is unbounded',
        });
    } else if (unauthenticated.length > ceiling) {
        violations.push({
            route: "ratchet.max_unauthenticated_side_effect_routes",
            kind: "ratchet-exceeded",
            detail: `${unauthenticated.length} exceeds the recorded ceiling of ${ceiling} — authenticate the sender, or raise the ceiling deliberately and say why`,
        });
    } else if (unauthenticated.length < ceiling) {
        stale.push({
            route: "ratchet.max_unauthenticated_side_effect_routes",
            kind: "ratchet-slack",
            list: "ratchet",
            detail: `ceiling is ${ceiling} but the live floor is ${unauthenticated.length} — re-tighten it, or it hands out ${ceiling - unauthenticated.length} free exemption(s)`,
        });
    }

    const byModel = { session: 0, signature: 0, credential: 0 };
    for (const r of subject) if (r.model) byModel[r.model] += 1;

    return {
        generated_by: "web/scripts/checkUnauthenticatedSideEffects.mjs",
        counts: {
            routes: rows.length,
            side_effecting: subject.length,
            side_effecting_authenticated: subject.length - unauthenticated.length,
            side_effecting_unauthenticated: unauthenticated.length,
            // The S-1 population proper: side-effecting AND sessionless. The ones that hold do so
            // by signature or by credential; the ones that do not are the violations.
            sessionless_side_effecting: sessionless.length,
            sessionless_sender_verified: sessionless.filter((r) => r.authenticatesSender).length,
            listed_exemptions: exemptions.size,
            by_model: byModel,
        },
        sessionless_side_effecting_routes: sessionless.map((r) => ({
            route: r.route,
            methods: r.methods,
            model: r.model,
        })),
        ratchet: { max_unauthenticated_side_effect_routes: ceiling ?? null },
        ok: violations.length === 0 && stale.length === 0,
        violations,
        stale,
        unauthenticated: unauthenticated.map((r) => ({
            route: r.route,
            methods: r.methods,
            exempted: exemptions.has(r.route) ? exemptions.get(r.route).model : null,
        })),
        register_reviewed: raw.reviewed ?? null,
        rows,
    };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedDirectly =
    process.argv[1] && process.argv[1].endsWith("checkUnauthenticatedSideEffects.mjs");
if (invokedDirectly) {
    let report;
    try {
        report = runUnauthenticatedSideEffectCheck();
    } catch (e) {
        console.error("[unauthenticated-side-effects] check failed to run:", e);
        process.exit(2);
    }

    const outIdx = process.argv.indexOf("--out");
    if (outIdx !== -1 && process.argv[outIdx + 1]) {
        const { rows, ...rest } = report;
        writeFileSync(resolve(process.argv[outIdx + 1]), `${JSON.stringify(rest, null, 2)}\n`);
        console.log(`wrote ${process.argv[outIdx + 1]}`);
    }

    if (process.argv.includes("--json")) {
        const { rows, ...rest } = report;
        console.log(JSON.stringify(process.argv.includes("--rows") ? report : rest, null, 2));
    } else {
        const c = report.counts;
        console.log(`Unauthenticated side-effect check (W-40 · S-1) — ${c.routes} API routes\n`);
        console.log(`  exports a side-effecting method              ${String(c.side_effecting).padStart(4)}`);
        console.log(`    …authenticates its sender                  ${String(c.side_effecting_authenticated).padStart(4)}`);
        console.log(`        by session                             ${String(c.by_model.session).padStart(4)}`);
        console.log(`        by signature                           ${String(c.by_model.signature).padStart(4)}`);
        console.log(`        by credential-bound selection          ${String(c.by_model.credential).padStart(4)}`);
        console.log(`    …authenticates none                        ${String(c.side_effecting_unauthenticated).padStart(4)}`);
        console.log(`      reviewed exemptions                      ${String(c.listed_exemptions).padStart(4)}`);
        console.log(`\n  ratchet ceiling  ≤ ${report.ratchet.max_unauthenticated_side_effect_routes}`);

        if (report.violations.length) {
            const routeViolations = report.violations.filter((v) => !v.kind.startsWith("ratchet-"));
            const ratchetViolations = report.violations.filter((v) => v.kind.startsWith("ratchet-"));
            if (routeViolations.length) {
                console.log(`\n✗ ${routeViolations.length} unlisted violation(s):`);
                for (const v of routeViolations) console.log(`    ${v.route}`);
                console.log(
                    `\n  A route that changes state for a caller it cannot identify has no way to refuse one.\n` +
                        `  Verify a signature, resolve the row by its credential, or add it to "exemptions" in\n` +
                        `  scripts/unauthenticatedSideEffects.allowlist.json with the model that holds instead.`
                );
            }
            if (ratchetViolations.length) {
                console.log(`\n✗ ${ratchetViolations.length} ratchet breach(es) — a bounded count grew:`);
                for (const v of ratchetViolations) console.log(`    ${v.route} — ${v.detail}`);
            }
        }
        if (report.stale.length) {
            console.log(`\n✗ ${report.stale.length} stale register entr(ies) — the list may only shrink:`);
            for (const s of report.stale) console.log(`    [${s.list}] ${s.route} — ${s.detail}`);
        }
        if (report.ok) console.log(`\n✓ every side-effecting route authenticates its sender, or is reviewed.`);
    }

    process.exit(report.ok ? 0 : 1);
}
