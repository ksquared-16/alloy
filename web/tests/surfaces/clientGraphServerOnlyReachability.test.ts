/**
 * NO "use client" MODULE MAY REACH A `server-only` MODULE. THE WHOLE REPOSITORY, NOT A LIST.
 *
 * This defect class has now shipped THREE times, and every time the answer looked green:
 *
 *   1. `server-only` added to `focusPanelOperationalProjection`, reached from shared graphs.
 *   2. `focusPanelCardProducers` imported as a VALUE beneath `workUnitProvisioningAnswer`.
 *   3. The settled frame's producers imported into `composeOpportunityDrawerViewModel` — which
 *      `ChildDrawerRuntimeProofClient` reaches through the `lib/layout/runtime` barrel. All thirteen
 *      required checks passed; the STAGING DEPLOYMENT failed, because no required check runs a real
 *      `next build`.
 *
 * The third one is why this file exists rather than more entries in a list. `focusPanelModuleBoundary`
 * enumerates entry points by hand, so it can only ever catch a path somebody remembered to add — and
 * nobody remembers a proof page importing a barrel. The offending edge was four hops from anything
 * that test names.
 *
 * ── WHY A GRAPH WALK RATHER THAN A BUNDLER ──
 *
 * The question is entirely about IN-REPO edges: every `server-only` module is in this repository, and
 * so is every module that reaches one. esbuild across ~1,500 client entries fails on loader and
 * resolution details that have nothing to do with the question. A direct walk over the repo's own
 * import statements answers it exactly, in seconds.
 *
 * The walk OVER-approximates (it follows every static import it can see, including ones a bundler
 * might tree-shake). That is the safe direction for a guard: it can ask for an edge to be broken that
 * a bundler might have tolerated, but it cannot miss one that a bundler would follow.
 *
 * `import type` is excluded, because TypeScript erases it and the bundler never resolves it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../..");
const SOURCE_DIRS = ["app", "components", "lib", "contexts", "hooks"].filter((d) =>
    existsSync(resolve(webRoot, d)),
);

function listFiles(): string[] {
    const out = execFileSync(
        "find",
        [...SOURCE_DIRS, "-type", "f", "(", "-name", "*.ts", "-o", "-name", "*.tsx", ")"],
        { cwd: webRoot, encoding: "utf8", maxBuffer: 1 << 28 },
    );
    return out.split("\n").filter(Boolean);
}

const read = (rel: string): string => {
    try {
        return readFileSync(resolve(webRoot, rel), "utf8");
    } catch {
        return "";
    }
};

/** The marker, at the head of the file where a side-effect import lives. */
const declaresServerOnly = (rel: string): boolean =>
    /^\s*import\s+["']server-only["']/m.test(read(rel).slice(0, 4000));

/** `"use client"` must be the first statement for Next to treat the module as a client entry. */
const declaresUseClient = (rel: string): boolean => /^\s*["']use client["']/.test(read(rel).slice(0, 200));

const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

/** Resolve one import specifier to a repo-relative file, or null when it leaves the repo. */
function resolveSpecifier(fromRel: string, spec: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = resolve(webRoot, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(webRoot, dirname(fromRel), spec);
    else return null; // a package — not an in-repo edge

    for (const candidate of [
        ...EXTS.map((e) => base + e),
        ...EXTS.map((e) => resolve(base, "index" + e)),
        base,
    ]) {
        if (existsSync(candidate) && !candidate.endsWith("/")) {
            try {
                if (readFileSync(candidate).length >= 0) return relative(webRoot, candidate);
            } catch {
                /* a directory — keep looking */
            }
        }
    }
    return null;
}

/**
 * Every in-repo module this file imports for its VALUES.
 *
 * `import type {...}` and `export type {...}` are erased by TypeScript, so they are not edges. A
 * bare `import "x"` and a re-export (`export * from`, `export {x} from`) are.
 */
function valueImports(rel: string): string[] {
    const src = read(rel);
    const specs: string[] = [];
    const re = /(^|\n)\s*(?:import|export)\s+([\s\S]*?)from\s*["']([^"']+)["']|(^|\n)\s*import\s*["']([^"']+)["']/g;
    for (let m = re.exec(src); m; m = re.exec(src)) {
        const clause = m[2] ?? "";
        const spec = m[3] ?? m[5];
        if (!spec) continue;
        // `import type X from` / `export type {…} from` are erased; a per-specifier `{ type X }` is
        // not the whole clause, so only a leading `type` keyword disqualifies the edge.
        if (/^\s*type\s/.test(clause)) continue;
        specs.push(spec);
    }
    return specs.map((s) => resolveSpecifier(rel, s)).filter((s): s is string => s !== null);
}

describe("the client module graph reaches no server-only module", () => {
    it("holds across every \"use client\" module in the repository", () => {
        const files = listFiles();
        const clients = files.filter(declaresUseClient);
        const serverOnly = new Set(files.filter(declaresServerOnly));

        // Both ends must be non-trivial, or an empty result would be a no-op that passes forever.
        expect(clients.length, "no client modules found — the walk is not looking at the repo").toBeGreaterThan(100);
        expect(serverOnly.size, "no server-only modules found — the marker check is broken").toBeGreaterThan(0);

        const edges = new Map<string, string[]>();
        const importsOf = (rel: string): string[] => {
            let e = edges.get(rel);
            if (!e) {
                e = valueImports(rel);
                edges.set(rel, e);
            }
            return e;
        };

        // BFS from every client entry at once, recording the first path that reaches a marker.
        const seen = new Set<string>(clients);
        const queue: { file: string; path: string[] }[] = clients.map((f) => ({ file: f, path: [f] }));
        const violations: string[][] = [];

        while (queue.length > 0) {
            const { file, path } = queue.shift()!;
            if (serverOnly.has(file)) {
                violations.push(path);
                continue; // the edge is already reported; do not walk past it
            }
            for (const next of importsOf(file)) {
                if (seen.has(next)) continue;
                seen.add(next);
                queue.push({ file: next, path: [...path, next] });
            }
        }

        const rendered = violations
            .slice(0, 10)
            .map((p) => `  ${p.join("\n    → ")}`)
            .join("\n\n");

        expect(
            violations.map((p) => p[p.length - 1]),
            violations.length === 0
                ? ""
                : `A "use client" module reaches a server-only module through its VALUE graph.\n` +
                      `Next's loader rejects this at BUILD time — not tsc, not vitest, not esbuild — so the\n` +
                      `deployment fails while every required check is green. Move the execution above the\n` +
                      `contract boundary: an App Route or a server-only composer can own it, a shared\n` +
                      `library that a client component can reach cannot.\n\n${rendered}`,
        ).toEqual([]);
    }, 120_000);
});
