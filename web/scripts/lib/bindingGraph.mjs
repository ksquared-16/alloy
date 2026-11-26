/**
 * The binding-level authority graph — shared by the tier A access checks.
 *
 * Extracted verbatim from `checkServiceClientPrincipal.mjs` (W-4) so that `W-40`'s check can ask a
 * DIFFERENT question of the SAME graph without a second copy of the walker drifting away from the
 * first. The three properties that made the W-4 check trustworthy are the reason it is worth
 * sharing rather than reimplementing, and they are preserved exactly:
 *
 *   1. **AST, not text.** Every edge is a real TypeScript binding, parsed with the compiler's own
 *      parser. No regex decides anything about authority. `auditAuthorityPaths.mjs` over-reported
 *      enforcement by ~30x because `/permissionKeys\b/` cannot tell *mentioning* a symbol from
 *      *branching on* it (phase 3 §10.2).
 *   2. **Binding-level, not file-level.** A route is credited only through symbols it actually
 *      imports, and only if *that symbol's own declaration* (transitively, through its own
 *      bindings) reaches a terminal. Importing one function from a module that also exports a
 *      resolver credits nothing.
 *   3. **Terminals are structural, and wrappers are DISCOVERED.** The caller supplies a predicate
 *      over AST nodes; every wrapper above it is found by the walk rather than hand-listed, so a
 *      check built on this cannot rot as helpers are added or renamed.
 *
 * ## Why the caches are per-instance and not module-level
 *
 * The W-4 check memoised `file#export → bool` in a module-scoped `Map`. That is correct while one
 * predicate exists and silently wrong the moment two do: the second check's question would be
 * answered from the first check's cache, and the answer would look authoritative. `createBindingGraph`
 * therefore returns a closure owning its own caches, and the memo key is scoped to that instance.
 * Two graphs over the same files, asking different questions, cannot see each other's answers.
 */

import ts from "typescript";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"];

/**
 * Create a graph rooted at `webRoot`.
 *
 * @param {object} opts
 * @param {string} opts.webRoot — absolute path of `web/`; `@/` specifiers resolve against it.
 * @param {(node: import("typescript").Node) => boolean} opts.isTerminal — the base case.
 * @param {string[]} [opts.markerModules] — modules whose import sets a per-module flag
 *   (`importsMarker`), e.g. the service-client constructors.
 * @param {string} [opts.markerText] — a text needle that also sets `importsMarker`
 *   (`SUPABASE_SERVICE_ROLE_KEY` is not always reached through an import).
 */
export function createBindingGraph({ webRoot, isTerminal, markerModules = [], markerText = null }) {
    const moduleCache = new Map();
    const symbolMemo = new Map();
    const markerMemo = new Map();

    function resolveSpecifier(spec, fromFile) {
        let base;
        if (spec.startsWith("@/")) base = join(webRoot, spec.slice(2));
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
     * cannot resolve authority, and following them is how a file-level check over-credits.
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
            importsMarker: false,
            firstPartyImports: new Set(),
        };

        const noteTarget = (target) => {
            if (!target) return;
            mod.firstPartyImports.add(target);
            if (markerModules.includes(target)) mod.importsMarker = true;
        };

        const addImport = (local, spec, exported) => {
            const target = resolveSpecifier(spec, file);
            if (!target) return;
            noteTarget(target);
            mod.importsByLocal.set(local, { file: target, exported });
        };

        for (const stmt of sf.statements) {
            // import … from "…"
            if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
                const spec = stmt.moduleSpecifier.text;
                const clause = stmt.importClause;
                if (!clause) {
                    noteTarget(resolveSpecifier(spec, file));
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
                    noteTarget(target);
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

    function lineOf(mod, node) {
        return mod.sf.getLineAndCharacterOfPosition(node.getStart(mod.sf)).line + 1;
    }

    /**
     * True if this declaration subtree reaches a terminal, following only real bindings:
     * identifiers declared in this module, and identifiers imported into it.
     */
    function subtreeReaches(mod, node, stack, trace) {
        let found = false;

        const visit = (n) => {
            if (found) return;
            if (isTerminal(n)) {
                trace.push(`${relative(webRoot, mod.file)}:${lineOf(mod, n)} ${n.getText().slice(0, 60)}`);
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
                        if (exportReaches(imported.file, imported.exported, stack, trace)) {
                            trace.push(`${relative(webRoot, mod.file)} → ${name}`);
                            found = true;
                            return;
                        }
                    } else {
                        const local = mod.localDecls.get(name);
                        if (local && local !== node) {
                            const key = `${mod.file}#local:${name}`;
                            if (!stack.has(key)) {
                                stack.add(key);
                                if (subtreeReaches(mod, local, stack, trace)) {
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

    function exportReaches(file, exportName, stack, trace) {
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
                if (exportReaches(file, name, stack, trace)) {
                    result = true;
                    break;
                }
            }
        } else {
            const entry = mod.exportsByName.get(exportName);
            if (entry?.kind === "reexport") {
                result = exportReaches(entry.file, entry.exported, stack, trace);
            } else if (entry?.kind === "local") {
                const decl = mod.localDecls.get(entry.local);
                if (decl) result = subtreeReaches(mod, decl, stack, trace);
            } else {
                for (const target of mod.starReexports) {
                    if (exportReaches(target, exportName, stack, trace)) {
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
    function fileReaches(file) {
        const mod = loadModule(file);
        const trace = [];
        let found = subtreeReaches(mod, mod.sf, new Set([`${file}#__route__`]), trace);
        if (!found) {
            for (const name of mod.exportsByName.keys()) {
                if (exportReaches(file, name, new Set(), trace)) {
                    found = true;
                    break;
                }
            }
        }
        if (!found) {
            for (const target of mod.starReexports) {
                const targetMod = loadModule(target);
                for (const name of targetMod.exportsByName.keys()) {
                    if (exportReaches(target, name, new Set(), trace)) {
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
        }
        return { found, trace: trace.slice(-3) };
    }

    /**
     * Direct: the file itself imports a marker module, or names the marker text.
     *
     * A bare re-export route *is* the handler it re-exports, so it inherits the target's holding.
     * This is a precise edge (one named re-export), not the general transitive walk below.
     */
    function holdsMarkerDirect(file, seen = new Set()) {
        if (seen.has(file)) return false;
        seen.add(file);
        const mod = loadModule(file);
        if (mod.importsMarker || (markerText && mod.text.includes(markerText))) return true;
        for (const entry of mod.exportsByName.values()) {
            if (entry.kind === "reexport" && holdsMarkerDirect(entry.file, seen)) return true;
        }
        for (const target of mod.starReexports) {
            if (holdsMarkerDirect(target, seen)) return true;
        }
        return false;
    }

    /** Transitive: a marker module is reachable through the first-party import graph. */
    function reachesMarker(file, stack = new Set()) {
        if (markerMemo.has(file)) return markerMemo.get(file);
        if (stack.has(file)) return false;
        stack.add(file);

        const mod = loadModule(file);
        let result = mod.importsMarker || (markerText && mod.text.includes(markerText));
        if (!result) {
            for (const target of mod.firstPartyImports) {
                if (reachesMarker(target, stack)) {
                    result = true;
                    break;
                }
            }
        }
        stack.delete(file);
        if (stack.size === 0) markerMemo.set(file, result);
        return result;
    }

    return { loadModule, fileReaches, holdsMarkerDirect, reachesMarker, resolveSpecifier };
}

/** `x.auth.getUser()` / `.getClaims()` / `.getSession()` — the session-principal base case. */
const PRINCIPAL_METHODS = new Set(["getUser", "getClaims", "getSession"]);

export function isSessionPrincipalCall(node) {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee)) return false;
    if (!PRINCIPAL_METHODS.has(callee.name.text)) return false;
    const owner = callee.expression;
    return ts.isPropertyAccessExpression(owner) && owner.name.text === "auth";
}

export { ts };
