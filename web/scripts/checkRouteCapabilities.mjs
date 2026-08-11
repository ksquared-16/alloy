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
 * **W-15 prerequisite — a declaration is a CLAIM, and the claim is now checked against the source.**
 * As W-14 shipped it, `{"status":"declared","capability":"settings.users_roles"}` asserted nothing
 * about the handler. A refactor that deleted the guard left the table green and lying, and the
 * mission's requirement is that the declaration *become* enforcement. Driving 725 `pending` entries
 * to `declared` against an unbound table would have produced 751 unfalsifiable claims instead of 25.
 * So each `declared` entry naming a `helper` must now survive three joins:
 *
 *   1. the exported handler's own body calls that helper — method grain, not file grain, so a guard
 *      on `GET` cannot vouch for `DELETE` in the same file;
 *   2. if the helper's verdict is bound to an identifier, the handler TESTS it — a returned verdict
 *      nobody branches on is not a gate;
 *   3. the module the helper is imported from names the declared capability on an executable line.
 *
 * This is not the reachability inference the census got wrong (see below), and the difference is the
 * direction of travel. The census read source and *inferred a gate*. This reads a stated claim and
 * tries to *falsify* it. Inference invents authorization that was never written; falsification can
 * only ever remove a claim the table already makes. Where the census over-reported by ~30×, an
 * unfalsifiable declaration here fails loudly and names the join it broke.
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
// Declaration binding — the three joins that turn a claim into evidence
// ---------------------------------------------------------------------------

/**
 * A length-preserving source skeleton: comment and string bodies become spaces.
 *
 * Length preservation is what lets an offset found here be used against the ORIGINAL source, so a
 * violation can quote real code. Blanking matters for two reasons: an identifier inside a string is
 * not a call, and a brace inside a string would derail the handler-body match.
 *
 * `stripComments` above is regex-based and guards `https://` with a `[^:]` lookbehind — adequate for
 * counting keys, not for offset arithmetic. This scanner is a real one-pass tokenizer, and it is
 * deliberately conservative about template literals: a plain template is blanked, but one carrying
 * `${…}` is left intact, because its interpolation is executable code and brace-balanced. A template
 * whose interpolation held an unbalanced brace inside a nested string would truncate a handler body
 * and raise a violation — loud and investigable, never a silent pass. That is the safe direction for
 * a control whose failure mode is otherwise "authorization nobody wrote".
 */
export function skeleton(source) {
    const n = source.length;
    const out = source.split("");
    const blank = (from, to) => {
        for (let k = from; k < to && k < n; k += 1) if (out[k] !== "\n") out[k] = " ";
    };

    let i = 0;
    while (i < n) {
        const c = source[i];
        const d = source[i + 1];

        if (c === "/" && d === "/") {
            let j = i;
            while (j < n && source[j] !== "\n") j += 1;
            blank(i, j);
            i = j;
            continue;
        }
        if (c === "/" && d === "*") {
            let j = i + 2;
            while (j < n && !(source[j] === "*" && source[j + 1] === "/")) j += 1;
            j = Math.min(n, j + 2);
            blank(i, j);
            i = j;
            continue;
        }
        if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < n) {
                if (source[j] === "\\") {
                    j += 2;
                    continue;
                }
                if (source[j] === c || source[j] === "\n") break;
                j += 1;
            }
            const end = Math.min(j + 1, n);
            // The DELIMITERS survive; only the contents are blanked. Blanking the quotes too erases
            // the token structure that tells an import statement from prose.
            blank(i + 1, end - 1);
            i = end;
            continue;
        }
        if (c === "`") {
            let j = i + 1;
            let interpolated = false;
            while (j < n) {
                if (source[j] === "\\") {
                    j += 2;
                    continue;
                }
                if (source[j] === "$" && source[j + 1] === "{") interpolated = true;
                if (source[j] === "`") break;
                j += 1;
            }
            const end = Math.min(j + 1, n);
            if (!interpolated) blank(i + 1, end - 1);
            i = end;
            continue;
        }
        i += 1;
    }
    return out.join("");
}

/** The block opened by the `{` at `open`, and the index just past its match. */
function matchBlock(skel, open) {
    if (open < 0 || skel[open] !== "{") return null;
    let depth = 0;
    for (let k = open; k < skel.length; k += 1) {
        if (skel[k] === "{") depth += 1;
        else if (skel[k] === "}") {
            depth -= 1;
            if (depth === 0) return { start: open, end: k + 1 };
        }
    }
    return null;
}

/**
 * The function BODY following a signature that starts at `from`.
 *
 * The first `{` after a handler's name is very often not its body: `GET(request, { params })`
 * destructures in the parameter list, and taking that brace yields a two-token "body" that contains
 * no gate — which is exactly how a guarded route would be convicted of being unguarded. So the body
 * is the first `{` at paren-depth zero. A `;` at depth zero means the declaration ended without a
 * body at all (`export const GET = handler;`), which is reported rather than searched past.
 */
function bodyBlock(skel, from) {
    let paren = 0;
    for (let k = from; k < skel.length; k += 1) {
        const ch = skel[k];
        if (ch === "(") paren += 1;
        else if (ch === ")") paren -= 1;
        else if (ch === "{" && paren <= 0) return matchBlock(skel, k);
        else if (ch === ";" && paren <= 0) return null;
    }
    return null;
}

/**
 * The body of one exported handler, at method grain.
 *
 * Every export form `exportedMethods` recognises is resolved, including the aliased
 * `export { handler as POST }` — which is followed back to the local declaration, because a handler
 * reached through an alias is no less a handler. A form that cannot be resolved is reported as a
 * violation rather than skipped: "I could not read this one" must never be indistinguishable from
 * "this one is fine", which is the exact confusion §10.2 records.
 */
export function handlerBody(file, method) {
    const skel = skeleton(read(file));

    const direct = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`).exec(skel);
    if (direct) {
        const block = bodyBlock(skel, direct.index + direct[0].length);
        if (block) return skel.slice(block.start, block.end);
    }

    const assigned = new RegExp(`export\\s+(?:const|let|var)\\s+${method}\\s*[:=]`).exec(skel);
    if (assigned) {
        const block = bodyBlock(skel, assigned.index + assigned[0].length);
        if (block) return skel.slice(block.start, block.end);
    }

    // export { local as METHOD } — resolve `local`, then read its declaration.
    for (const block of skel.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const clause of block[1].split(",")) {
            const parts = clause.trim().split(/\s+as\s+/);
            const exported = (parts[1] ?? parts[0] ?? "").trim();
            const local = (parts[0] ?? "").trim();
            if (exported !== method || !local) continue;
            const decl = new RegExp(`(?:async\\s+)?function\\s+${local}\\b|(?:const|let|var)\\s+${local}\\s*[:=]`).exec(skel);
            if (!decl) continue;
            const body = bodyBlock(skel, decl.index + decl[0].length);
            if (body) return skel.slice(body.start, body.end);
        }
    }

    return null;
}

/** The identifier a call's verdict is bound to, if it is bound at all. */
function verdictBinding(body, helper) {
    const m = new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:await\\s+)?${helper}\\s*\\(`).exec(body);
    return m ? m[1] : null;
}

/**
 * The module a helper enters the route from — an import if it is imported, otherwise the route file
 * itself, since a route may define its own gate (`canReadProgramPublication` does).
 */
function helperModule(file, helper) {
    const skel = skeleton(read(file));
    for (const stmt of skel.matchAll(/import\s+([\s\S]*?)\s+from\s*["']([^"']*)["']/g)) {
        if (!new RegExp(`\\b${helper}\\b`).test(stmt[1])) continue;
        // The specifier lives in the ORIGINAL source: the skeleton blanked its contents.
        const spec = /from\s*["']([^"']+)["']/.exec(read(file).slice(stmt.index, stmt.index + stmt[0].length + 2));
        const target = spec ? resolveImport(spec[1], file) : null;
        if (target) return target;
    }
    if (new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${helper}\\b|(?:const|let|var)\\s+${helper}\\s*[:=]`).test(skel)) {
        return file;
    }
    return null;
}

/**
 * The three joins, for one declared handler. Returns the violations it fails, and the evidence it
 * passes on — the evidence is what makes a green run reviewable rather than merely quiet.
 */
export function bindDeclaration(file, route, method, decl) {
    const violations = [];
    const helper = decl.helper;
    if (!helper) {
        // A `declared` entry with no named helper cannot be bound to anything. It is a claim about
        // enforcement with no address, and W-15 may not add more of them.
        return { violations: [{ route, kind: "unaddressed-declaration", detail: `${method} declares ${decl.capability} but names no helper to bind it to` }], evidence: null };
    }

    const body = handlerBody(file, method);
    if (body === null) {
        return { violations: [{ route, kind: "unresolvable-handler", detail: `${method} is declared but its body could not be located to verify the ${helper} gate` }], evidence: null };
    }

    // Join 1 — this handler, not merely this file, calls the helper.
    const calls = new RegExp(`\\b${helper}\\s*\\(`).test(body);
    if (!calls) {
        violations.push({ route, kind: "unbound-declaration", detail: `${method} declares capability ${decl.capability} via ${helper}, but ${method}'s body never calls ${helper}` });
    }

    // Join 2 — a verdict that is bound must be tested. A helper that throws binds nothing and needs
    // no test; one that returns `{ok:false, response}` and is ignored is a gate in name only.
    const bound = calls ? verdictBinding(body, helper) : null;
    if (bound && !new RegExp(`if\\s*\\([^)]*\\b${bound}\\b`).test(body)) {
        violations.push({ route, kind: "untested-verdict", detail: `${method} calls ${helper} and binds its verdict to '${bound}', but never tests '${bound}' — the verdict is discarded` });
    }

    // Join 3 — the helper's module actually names the declared capability.
    const mod = helperModule(file, helper);
    if (!mod) {
        violations.push({ route, kind: "unresolvable-helper", detail: `${method} names helper ${helper}, which is neither imported nor defined in the route` });
        return { violations, evidence: null };
    }
    const modSource = stripComments(read(mod));
    if (!modSource.includes(`"${decl.capability}"`) && !modSource.includes(`'${decl.capability}'`)) {
        violations.push({
            route,
            kind: "capability-not-enforced",
            detail: `${method} declares ${decl.capability}, but ${relative(WEB, mod).split("\\").join("/")} (which defines ${helper}) never names that key on an executable line`,
        });
    }

    return { violations, evidence: { route, method, helper, capability: decl.capability, enforcedIn: relative(WEB, mod).split("\\").join("/") } };
}

/**
 * W-15's burndown, discovered rather than hand-listed.
 *
 * A `pending` handler whose body already calls one of the helpers the table uses elsewhere is a
 * route that is *enforced but undeclared* — the table under-reporting rather than over-reporting.
 * `persons/[id]/profile-photo` is the case that motivated this: all three of its methods sat
 * `pending` while calling the very `assertDocumentAccess` that `documents/[id]/signed-url` declares
 * as `documents.read`. This is advisory output, never a pass/fail input — the capability such a
 * route requires is still a reviewed decision, and inferring it is the mistake this file replaces.
 */
export function pendingWithKnownGates(table) {
    const helpers = new Map();
    for (const methods of Object.values(table.routes ?? {})) {
        for (const decl of Object.values(methods)) {
            if (decl.status === "declared" && decl.helper) helpers.set(decl.helper, decl.capability);
        }
    }

    const found = [];
    for (const [route, methods] of Object.entries(table.routes ?? {})) {
        const abs = join(WEB, route);
        if (!existsSync(abs)) continue;
        for (const [method, decl] of Object.entries(methods)) {
            if (decl.status !== "pending") continue;
            const body = handlerBody(abs, method);
            if (!body) continue;
            for (const [helper, capability] of helpers) {
                if (new RegExp(`\\b${helper}\\s*\\(`).test(body)) {
                    found.push({ route, method, helper, capabilityElsewhere: capability });
                    break;
                }
            }
        }
    }
    return found;
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
    const counts = { routes: onDisk.size, methods: 0, declared: 0, none: 0, pending: 0, bound: 0 };
    const bindings = [];

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
                } else {
                    // The claim is checked against the source. A declaration that survives this is
                    // evidence; one that does not is a route the table describes and the code does
                    // not implement.
                    const bind = bindDeclaration(join(WEB, route), route, method, decl);
                    violations.push(...bind.violations);
                    if (bind.evidence && bind.violations.length === 0) {
                        counts.bound += 1;
                        bindings.push(bind.evidence);
                    }
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

    return { ok: violations.length === 0, counts, ratchet: { max_pending: ceiling ?? null }, violations, bindings, onDisk: [...onDisk] };
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
        console.log(`    ↳ bound to source (3 joins)      ${String(c.bound).padStart(4)}`);
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

        if (process.argv.includes("--enforced-but-pending")) {
            // W-15's burndown, ordered by evidence rather than by directory listing.
            const table = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
            const found = pendingWithKnownGates(table);
            console.log(`\n--- pending handlers that already call a known gate (${found.length}) ---`);
            for (const f of found) {
                console.log(`  ${f.route}  ${f.method}  calls ${f.helper}  (declared elsewhere as ${f.capabilityElsewhere})`);
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
