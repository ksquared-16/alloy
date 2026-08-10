/**
 * W-4 — Service-client principal check (tier A, build-time).
 *
 * Invariant I-3: a route that holds a service-role Supabase client (which bypasses RLS)
 * must resolve a principal separately, or be a reviewed exception.
 *
 * ## What this check is, and what it deliberately is not
 *
 * `auditAuthorityPaths.mjs` over-reported permission enforcement by ~30x because
 * `/permissionKeys\b/` cannot tell *mentioning* a symbol from *branching on* it, and because
 * it credited a route for anything any file in its whole import graph happened to contain
 * (phase 3 §10.2). This check is built to not repeat that:
 *
 *   1. **AST, not text.** Every edge is a real TypeScript binding, parsed with the compiler's
 *      own parser. No regex decides anything about authority.
 *   2. **Binding-level, not file-level.** A route is credited only through symbols it actually
 *      imports, and only if *that symbol's own declaration* (transitively, through its own
 *      bindings) reaches a principal resolution. Importing one function from a module that also
 *      exports a resolver credits nothing.
 *   3. **One terminal primitive, structurally defined.** The base case is a call to
 *      `.auth.getUser()` / `.auth.getClaims()` / `.auth.getSession()` — the only way this
 *      codebase turns a request into a principal (`lib/admin/cachedAuthSession.ts:17-48`).
 *      Wrappers (`getAdminContextCached`, `loadAdminRouteGate`, `requireAnalyticsReadAccess`, …)
 *      are *discovered* by the graph walk, not hand-listed, so the check cannot rot as
 *      wrappers are added or renamed.
 *
 * ## The honest limit — read this before citing the number
 *
 * This check proves a principal is **resolved**. It does not prove the result **gates** the
 * handler. W-1 found routes holding two access resolutions where only the first gated; a
 * resolution whose result is ignored still passes here. Proving the gate is W-14's declared
 * capability table and W-15's sweep. This check exists so the exception count stops growing
 * silently — that is its whole claim.
 *
 * ## The ratchet
 *
 * Three outcomes per route holding a service client:
 *   - resolves a principal        → pass
 *   - listed in `exceptions`      → pass; a reviewed, reasoned, permanent exemption
 *   - listed in `baseline`        → pass; the W-15 remediation backlog, frozen 2026-07-31
 *   - anything else               → FAIL
 *
 * Both lists may only shrink. A stale entry — the route is gone, no longer holds a service
 * client, or now resolves a principal — is itself a failure, so removing the last route from
 * a family forces the list to be updated rather than left as residue.
 *
 * Run: node web/scripts/checkServiceClientPrincipal.mjs [--json] [--report]
 * Exit: 0 clean · 1 violations or stale entries · 2 internal error
 */

import ts from "typescript";
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const WEB = resolve(import.meta.dirname, "..");
const API_ROOT = join(WEB, "app", "api");
const ALLOWLIST_PATH = join(import.meta.dirname, "serviceClientPrincipal.allowlist.json");

/** Modules whose exports construct a service-role (RLS-bypassing) client. */
const SERVICE_CLIENT_MODULES = [
    join(WEB, "lib", "supabaseAdmin.ts"),
    join(WEB, "lib", "supabase", "serverServiceClient.ts"),
];

/** The terminal principal-resolution primitives. Base case of the walk. */
const PRINCIPAL_METHODS = new Set(["getUser", "getClaims", "getSession"]);

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"];

// ---------------------------------------------------------------------------
// Module loading and parsing
// ---------------------------------------------------------------------------

const moduleCache = new Map();

function resolveSpecifier(spec, fromFile) {
    let base;
    if (spec.startsWith("@/")) base = join(WEB, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
    else return null; // third-party — outside the first-party authority graph

    const candidates = [base, ...RESOLVE_EXTENSIONS.map((e) => `${base}${e}`)];
    for (const ext of RESOLVE_EXTENSIONS) candidates.push(join(base, `index${ext}`));
    for (const cand of candidates) {
        if (existsSync(cand) && statSync(cand).isFile()) return cand;
    }
    return null;
}

/**
 * Parse one module into the binding tables the walk needs.
 *
 * `importsByLocal` — local name → { file, exported }. Type-only imports are dropped: a type
 * cannot resolve a principal, and following them is how a file-level check over-credits.
 * `localDecls`     — top-level name → declaration node, for wrappers defined in the same file.
 * `exportsByName`  — exported name → local name, or a re-export edge to another module.
 */
function loadModule(file) {
    if (moduleCache.has(file)) return moduleCache.get(file);

    const text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const mod = {
        file,
        text,
        sf,
        importsByLocal: new Map(),
        localDecls: new Map(),
        exportsByName: new Map(),
        starReexports: [],
        importsServiceClient: false,
        firstPartyImports: new Set(),
    };

    const addImport = (local, spec, exported) => {
        const target = resolveSpecifier(spec, file);
        if (!target) return;
        mod.firstPartyImports.add(target);
        if (SERVICE_CLIENT_MODULES.includes(target)) mod.importsServiceClient = true;
        mod.importsByLocal.set(local, { file: target, exported });
    };

    for (const stmt of sf.statements) {
        // import … from "…"
        if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
            const spec = stmt.moduleSpecifier.text;
            const clause = stmt.importClause;
            if (!clause) {
                const target = resolveSpecifier(spec, file);
                if (target) {
                    mod.firstPartyImports.add(target);
                    if (SERVICE_CLIENT_MODULES.includes(target)) mod.importsServiceClient = true;
                }
                continue;
            }
            if (clause.isTypeOnly) continue;
            if (clause.name) addImport(clause.name.text, spec, "default");
            const bindings = clause.namedBindings;
            if (bindings && ts.isNamespaceImport(bindings)) {
                addImport(bindings.name.text, spec, "*");
            } else if (bindings && ts.isNamedImports(bindings)) {
                for (const el of bindings.elements) {
                    if (el.isTypeOnly) continue;
                    addImport(el.name.text, spec, (el.propertyName ?? el.name).text);
                }
            }
            continue;
        }

        // export … from "…"  /  export { … }
        if (ts.isExportDeclaration(stmt)) {
            if (stmt.isTypeOnly) continue;
            const spec =
                stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)
                    ? stmt.moduleSpecifier.text
                    : null;
            if (spec) {
                const target = resolveSpecifier(spec, file);
                if (target) {
                    mod.firstPartyImports.add(target);
                    if (SERVICE_CLIENT_MODULES.includes(target)) mod.importsServiceClient = true;
                }
                if (!stmt.exportClause) {
                    if (target) mod.starReexports.push(target);
                } else if (ts.isNamedExports(stmt.exportClause) && target) {
                    for (const el of stmt.exportClause.elements) {
                        if (el.isTypeOnly) continue;
                        mod.exportsByName.set(el.name.text, {
                            kind: "reexport",
                            file: target,
                            exported: (el.propertyName ?? el.name).text,
                        });
                    }
                }
            } else if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
                for (const el of stmt.exportClause.elements) {
                    if (el.isTypeOnly) continue;
                    mod.exportsByName.set(el.name.text, {
                        kind: "local",
                        local: (el.propertyName ?? el.name).text,
                    });
                }
            }
            continue;
        }

        const exported = ts.canHaveModifiers(stmt)
            ? ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
            : false;

        if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
            const name = stmt.name?.text;
            if (name) {
                mod.localDecls.set(name, stmt);
                if (exported) mod.exportsByName.set(name, { kind: "local", local: name });
            }
            continue;
        }

        if (ts.isVariableStatement(stmt)) {
            for (const decl of stmt.declarationList.declarations) {
                if (!ts.isIdentifier(decl.name)) continue;
                mod.localDecls.set(decl.name.text, decl);
                if (exported) {
                    mod.exportsByName.set(decl.name.text, { kind: "local", local: decl.name.text });
                }
            }
            continue;
        }

        if (ts.isExportAssignment(stmt)) {
            mod.localDecls.set("__default", stmt);
            mod.exportsByName.set("default", { kind: "local", local: "__default" });
        }
    }

    moduleCache.set(file, mod);
    return mod;
}

// ---------------------------------------------------------------------------
// Does this bind, transitively, to a principal resolution?
// ---------------------------------------------------------------------------

const symbolMemo = new Map();

/** `x.auth.getUser()` — the base case. */
function isPrincipalCall(node) {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee)) return false;
    if (!PRINCIPAL_METHODS.has(callee.name.text)) return false;
    const owner = callee.expression;
    return ts.isPropertyAccessExpression(owner) && owner.name.text === "auth";
}

/** An identifier in a type position is not an authority edge. */
function isTypePosition(id) {
    let p = id.parent;
    while (p) {
        if (
            ts.isTypeReferenceNode(p) ||
            ts.isTypeQueryNode(p) ||
            ts.isTypeAliasDeclaration(p) ||
            ts.isInterfaceDeclaration(p) ||
            ts.isImportTypeNode(p)
        ) {
            return true;
        }
        if (ts.isBlock(p) || ts.isSourceFile(p) || ts.isFunctionLike(p)) return false;
        p = p.parent;
    }
    return false;
}

/**
 * True if this declaration subtree reaches a principal resolution, following only real
 * bindings: identifiers declared in this module, and identifiers imported into it.
 */
function subtreeResolvesPrincipal(mod, node, stack, trace) {
    let found = false;

    const visit = (n) => {
        if (found) return;
        if (isPrincipalCall(n)) {
            trace.push(`${relative(WEB, mod.file)}:${lineOf(mod, n)} ${n.getText().slice(0, 60)}`);
            found = true;
            return;
        }
        if (ts.isIdentifier(n) && !isTypePosition(n)) {
            const name = n.text;
            const parent = n.parent;
            const isPropertyName =
                (ts.isPropertyAccessExpression(parent) && parent.name === n) ||
                (ts.isPropertyAssignment(parent) && parent.name === n) ||
                ((ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) && parent.name === n);
            if (!isPropertyName) {
                const imported = mod.importsByLocal.get(name);
                if (imported) {
                    if (exportResolvesPrincipal(imported.file, imported.exported, stack, trace)) {
                        trace.push(`${relative(WEB, mod.file)} → ${name}`);
                        found = true;
                        return;
                    }
                } else {
                    const local = mod.localDecls.get(name);
                    if (local && local !== node) {
                        const key = `${mod.file}#local:${name}`;
                        if (!stack.has(key)) {
                            stack.add(key);
                            if (subtreeResolvesPrincipal(mod, local, stack, trace)) {
                                found = true;
                                return;
                            }
                        }
                    }
                }
            }
        }
        ts.forEachChild(n, visit);
    };

    visit(node);
    return found;
}

function lineOf(mod, node) {
    return mod.sf.getLineAndCharacterOfPosition(node.getStart(mod.sf)).line + 1;
}

function exportResolvesPrincipal(file, exportName, stack, trace) {
    const key = `${file}#${exportName}`;
    if (stack.has(key)) return false; // cycle — treat as no evidence
    if (symbolMemo.has(key)) return symbolMemo.get(key);
    stack.add(key);

    const mod = loadModule(file);
    let result = false;

    if (exportName === "*") {
        // namespace import — any export of the module may be the one used; be conservative
        // and check them all, since the binding is genuinely to the whole module object.
        for (const name of mod.exportsByName.keys()) {
            if (exportResolvesPrincipal(file, name, stack, trace)) {
                result = true;
                break;
            }
        }
    } else {
        const entry = mod.exportsByName.get(exportName);
        if (entry?.kind === "reexport") {
            result = exportResolvesPrincipal(entry.file, entry.exported, stack, trace);
        } else if (entry?.kind === "local") {
            const decl = mod.localDecls.get(entry.local);
            if (decl) result = subtreeResolvesPrincipal(mod, decl, stack, trace);
        } else {
            for (const target of mod.starReexports) {
                if (exportResolvesPrincipal(target, exportName, stack, trace)) {
                    result = true;
                    break;
                }
            }
        }
    }

    stack.delete(key);
    symbolMemo.set(key, result);
    return result;
}

/**
 * A route file: the whole module is the subject, not one exported symbol.
 *
 * Some routes are a bare re-export of another route module
 * (`app/api/admin/v2/view-models/drawer/person/[id]/route.ts` is one line:
 * `export { GET } from "@/app/api/admin/view-models/drawer/person/[id]/route"`).
 * An ExportDeclaration carries no identifier reference in the module body, so the
 * subtree walk alone misses it entirely. Walk the export table as well.
 */
function routeResolvesPrincipal(file) {
    const mod = loadModule(file);
    const trace = [];
    let found = subtreeResolvesPrincipal(mod, mod.sf, new Set([`${file}#__route__`]), trace);
    if (!found) {
        for (const name of mod.exportsByName.keys()) {
            if (exportResolvesPrincipal(file, name, new Set(), trace)) {
                found = true;
                break;
            }
        }
    }
    if (!found) {
        for (const target of mod.starReexports) {
            const targetMod = loadModule(target);
            for (const name of targetMod.exportsByName.keys()) {
                if (exportResolvesPrincipal(target, name, new Set(), trace)) {
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
    }
    return { found, trace: trace.slice(-3) };
}

// ---------------------------------------------------------------------------
// Service-client detection
// ---------------------------------------------------------------------------

/**
 * Direct: the route file itself imports a service-client constructor, or builds one inline.
 *
 * A bare re-export route *is* the handler it re-exports, so it inherits the target's holding.
 * This is a precise edge (one named re-export), not the general transitive walk below.
 */
function holdsServiceClientDirect(file, seen = new Set()) {
    if (seen.has(file)) return false;
    seen.add(file);
    const mod = loadModule(file);
    if (mod.importsServiceClient || mod.text.includes("SUPABASE_SERVICE_ROLE_KEY")) return true;
    for (const entry of mod.exportsByName.values()) {
        if (entry.kind === "reexport" && holdsServiceClientDirect(entry.file, seen)) return true;
    }
    for (const target of mod.starReexports) {
        if (holdsServiceClientDirect(target, seen)) return true;
    }
    return false;
}

const transitiveMemo = new Map();

/** Transitive: a service client is reachable through the first-party import graph. */
function reachesServiceClient(file, stack = new Set()) {
    if (transitiveMemo.has(file)) return transitiveMemo.get(file);
    if (stack.has(file)) return false;
    stack.add(file);

    const mod = loadModule(file);
    let result = mod.importsServiceClient || mod.text.includes("SUPABASE_SERVICE_ROLE_KEY");
    if (!result) {
        for (const target of mod.firstPartyImports) {
            if (reachesServiceClient(target, stack)) {
                result = true;
                break;
            }
        }
    }
    stack.delete(file);
    if (stack.size === 0) transitiveMemo.set(file, result);
    return result;
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

function loadAllowlist(override) {
    const raw = override ?? JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
    const exceptions = new Map();
    for (const e of raw.exceptions) exceptions.set(e.route, e);
    const baseline = new Map();
    for (const e of raw.baseline) baseline.set(e.route, e);
    const advisory = new Set(raw.advisory_transitive_only.map((e) => e.route));
    return { raw, exceptions, baseline, advisory, ratchet: raw.ratchet ?? null };
}

/**
 * @param {object} [allowlistOverride] — substitute lists instead of reading the committed file.
 *   Used by the regression lock to demonstrate the red state: the check is only meaningful if
 *   an empty allow-list actually fails it.
 */
export function runServiceClientPrincipalCheck(allowlistOverride) {
    const { raw, exceptions, baseline, advisory, ratchet } = loadAllowlist(allowlistOverride);
    const routes = walkRoutes(API_ROOT).sort();

    const rows = routes.map((file) => {
        const route = relative(WEB, file);
        const direct = holdsServiceClientDirect(file);
        const { found, trace } = routeResolvesPrincipal(file);
        return {
            route,
            holdsServiceClient: direct,
            reachesServiceClient: direct || reachesServiceClient(file),
            resolvesPrincipal: found,
            evidence: found ? trace : [],
        };
    });

    const subject = rows.filter((r) => r.holdsServiceClient);
    const unresolved = subject.filter((r) => !r.resolvesPrincipal);

    const violations = [];
    for (const r of unresolved) {
        if (exceptions.has(r.route) || baseline.has(r.route)) continue;
        violations.push({
            route: r.route,
            kind: "unlisted",
            detail:
                "holds a service-role client and resolves no principal, and is in neither the reviewed exception list nor the frozen W-15 baseline",
        });
    }

    // The ratchet: both lists may only shrink. A stale entry is a failure.
    const byRoute = new Map(rows.map((r) => [r.route, r]));
    const stale = [];
    for (const [listName, list] of [
        ["exceptions", exceptions],
        ["baseline", baseline],
    ]) {
        for (const route of list.keys()) {
            const row = byRoute.get(route);
            if (!row) {
                stale.push({ route, kind: "stale-missing", list: listName, detail: "route file no longer exists" });
            } else if (!row.holdsServiceClient) {
                stale.push({
                    route,
                    kind: "stale-no-service-client",
                    list: listName,
                    detail: "route no longer holds a service-role client",
                });
            } else if (row.resolvesPrincipal) {
                stale.push({
                    route,
                    kind: "stale-now-resolves",
                    list: listName,
                    detail: "route now resolves a principal — remove it from the list",
                });
            }
        }
    }

    const transitiveOnly = rows.filter(
        (r) => !r.holdsServiceClient && r.reachesServiceClient && !r.resolvesPrincipal
    );

    // The advisory set is outside the enforced predicate, but it may not grow silently either:
    // it must match the recorded list exactly, in both directions.
    for (const r of transitiveOnly) {
        if (!advisory.has(r.route)) {
            violations.push({
                route: r.route,
                kind: "advisory-unlisted",
                detail:
                    "reaches a service-role client through a helper and resolves no principal — record it under advisory_transitive_only with a reason, or gate it",
            });
        }
    }
    const transitiveOnlyRoutes = new Set(transitiveOnly.map((r) => r.route));
    for (const route of advisory) {
        if (!transitiveOnlyRoutes.has(route)) {
            stale.push({
                route,
                kind: "stale-advisory",
                list: "advisory_transitive_only",
                detail: "no longer reaches a service client without resolving a principal — remove it",
            });
        }
    }

    // The numeric ceilings. Set membership above stops a list growing without an edit; it does
    // NOT stop the edit. Only a ceiling does that, and until 2026-08-06 the ceilings lived solely
    // in the vitest lock — so `e7e585010` grew the advisory set 3 → 9 in an allow-list-only commit,
    // `prebuild` stayed green, and the breach sat latent until someone ran the lock on a base that
    // contained both lines. Enforcing here puts it in front of `next build`, where it belongs.
    //
    // Over the ceiling is a VIOLATION: the count grew, which is the thing being prevented.
    // Under the ceiling is STALE: the floor dropped and nobody followed it down, which silently
    // hands out that many free exceptions. A ratchet is only a ratchet if it follows the floor.
    for (const [key, live] of [
        ["max_subject_unresolved", unresolved.length],
        ["max_transitive_only_unresolved", transitiveOnly.length],
    ]) {
        const ceiling = ratchet?.[key];
        if (typeof ceiling !== "number") {
            violations.push({
                route: `ratchet.${key}`,
                kind: "ratchet-missing",
                detail: `no numeric ceiling recorded under "ratchet" in the allow-list — the count is unbounded`,
            });
        } else if (live > ceiling) {
            violations.push({
                route: `ratchet.${key}`,
                kind: "ratchet-exceeded",
                detail: `${live} exceeds the recorded ceiling of ${ceiling} — gate the route, or raise the ceiling deliberately and say why`,
            });
        } else if (live < ceiling) {
            stale.push({
                route: `ratchet.${key}`,
                kind: "ratchet-slack",
                list: "ratchet",
                detail: `ceiling is ${ceiling} but the live floor is ${live} — re-tighten it to ${live}, or it hands out ${ceiling - live} free exception(s)`,
            });
        }
    }

    return {
        generated_by: "web/scripts/checkServiceClientPrincipal.mjs",
        counts: {
            routes: rows.length,
            holds_service_client_direct: subject.length,
            reaches_service_client_transitive: rows.filter((r) => r.reachesServiceClient).length,
            resolves_principal: rows.filter((r) => r.resolvesPrincipal).length,
            subject_resolves_principal: subject.filter((r) => r.resolvesPrincipal).length,
            subject_unresolved: unresolved.length,
            listed_exceptions: exceptions.size,
            listed_baseline: baseline.size,
            transitive_only_unresolved: transitiveOnly.length,
            listed_advisory: advisory.size,
        },
        ratchet: {
            max_subject_unresolved: ratchet?.max_subject_unresolved ?? null,
            max_transitive_only_unresolved: ratchet?.max_transitive_only_unresolved ?? null,
        },
        ok: violations.length === 0 && stale.length === 0,
        violations,
        stale,
        unresolved: unresolved.map((r) => ({
            route: r.route,
            list: exceptions.has(r.route) ? "exceptions" : baseline.has(r.route) ? "baseline" : null,
        })),
        transitive_only_unresolved: transitiveOnly.map((r) => r.route),
        allowlist_reviewed: raw.reviewed,
        rows,
    };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("checkServiceClientPrincipal.mjs");
if (invokedDirectly) {
    let report;
    try {
        report = runServiceClientPrincipalCheck();
    } catch (e) {
        console.error("[service-client-principal] check failed to run:", e);
        process.exit(2);
    }

    const outIdx = process.argv.indexOf("--out");
    if (outIdx !== -1 && process.argv[outIdx + 1]) {
        const { rows, ...rest } = report;
        const payload = process.argv.includes("--rows") ? report : rest;
        writeFileSync(resolve(process.argv[outIdx + 1]), `${JSON.stringify(payload, null, 2)}\n`);
        console.log(`wrote ${process.argv[outIdx + 1]}`);
    }

    if (process.argv.includes("--json")) {
        const { rows, ...rest } = report;
        console.log(JSON.stringify(process.argv.includes("--rows") ? report : rest, null, 2));
    } else {
        const c = report.counts;
        console.log(`Service-client principal check (W-4 · I-3) — ${c.routes} API routes\n`);
        console.log(`  holds a service-role client (direct import)   ${String(c.holds_service_client_direct).padStart(4)}`);
        console.log(`    …of those, resolves a principal             ${String(c.subject_resolves_principal).padStart(4)}`);
        console.log(`    …of those, resolves none                    ${String(c.subject_unresolved).padStart(4)}`);
        console.log(`      reviewed exceptions                       ${String(c.listed_exceptions).padStart(4)}`);
        console.log(`      W-15 baseline (frozen)                    ${String(c.listed_baseline).padStart(4)}`);
        console.log(`  reaches a service client transitively         ${String(c.reaches_service_client_transitive).padStart(4)}`);
        console.log(`    transitive-only and unresolved (advisory)   ${String(c.transitive_only_unresolved).padStart(4)}`);
        console.log(
            `\n  ratchet ceilings                    ` +
                `unresolved ≤ ${report.ratchet.max_subject_unresolved} · advisory ≤ ${report.ratchet.max_transitive_only_unresolved}`
        );

        if (report.violations.length) {
            // Ratchet breaches are not routes and must not be given the route remediation, which
            // would send the reader looking for a file that does not exist.
            const routeViolations = report.violations.filter((v) => !v.kind.startsWith("ratchet-"));
            const ratchetViolations = report.violations.filter((v) => v.kind.startsWith("ratchet-"));
            if (routeViolations.length) {
                console.log(`\n✗ ${routeViolations.length} unlisted violation(s):`);
                for (const v of routeViolations) console.log(`    ${v.route}`);
                console.log(
                    `\n  A route holding a service-role client bypasses RLS, so it must resolve a principal itself.\n` +
                        `  Gate it, or add it to "exceptions" in scripts/serviceClientPrincipal.allowlist.json with a reason.\n` +
                        `  The "baseline" list is frozen and may not be added to.`
                );
            }
            if (ratchetViolations.length) {
                console.log(`\n✗ ${ratchetViolations.length} ratchet breach(es) — a bounded count grew:`);
                for (const v of ratchetViolations) console.log(`    ${v.route} — ${v.detail}`);
            }
        }
        if (report.stale.length) {
            console.log(`\n✗ ${report.stale.length} stale list entr(ies) — the lists may only shrink:`);
            for (const s of report.stale) console.log(`    [${s.list}] ${s.route} — ${s.detail}`);
        }
        if (report.ok) console.log(`\n✓ no unlisted service-role route without a principal resolution.`);
    }

    process.exit(report.ok ? 0 : 1);
}
