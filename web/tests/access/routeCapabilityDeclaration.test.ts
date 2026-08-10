/**
 * W-14 / RL-10 (tier A, discovered subject) — every exported API handler appears in the
 * declared route capability table, and the table's capabilities are real catalog keys.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §8.
 *
 * The check itself is `web/scripts/checkRouteCapabilities.mjs`, which also runs in `prebuild`.
 * This file locks the properties that make it worth running:
 *
 *   1. It is GREEN against the committed table.
 *   2. It is NOT VACUOUS — it genuinely fails for an undeclared route, an undeclared method on
 *      a declared route, and a declaration whose route has been deleted. §10.2 exists because a
 *      census that always passes was mistaken for verification for two phases.
 *   3. The subject is DISCOVERED from disk, so a route added tomorrow is a violation tomorrow.
 *      RL-1, RL-4 and RL-11 were each defeated by an enumerated subject; this is the same
 *      lesson applied before the fact rather than after.
 *   4. The pending backlog RATCHETS downward — W-15's exit is `pending === 0`.
 *   5. Every declared capability is a key the permission catalog actually seeds.
 *
 * Property 5 is W-11's tier A check, which `03…` §7 records as inexpressible until this
 * workstream supplied the declared set: *"This check is only meaningful after W-14 supplies the
 * declared set — so W-11 lands the data change and W-14 lands the check that keeps it true."*
 * It is expressible now, so it is here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { tmpdir } from "node:os";
// @ts-expect-error - .mjs check script, no type declarations
import { runRouteCapabilityCheck } from "../../scripts/checkRouteCapabilities.mjs";
import { discoverCatalog } from "./permissionCatalogDiscovery";

type Declaration =
    | { status: "declared"; capability: string; helper?: string; note?: string }
    | { status: "none"; reason: string }
    | { status: "pending"; note?: string };

type Report = {
    ok: boolean;
    counts: { routes: number; methods: number; declared: number; none: number; pending: number };
    ratchet: { max_pending: number | null };
    violations: { route: string; kind: string; detail: string }[];
    onDisk: [string, string[]][];
};

const TABLE_PATH = resolve(__dirname, "../../scripts/routeCapabilities.declared.json");
const table = JSON.parse(readFileSync(TABLE_PATH, "utf8")) as {
    reviewed: string;
    note: string;
    ratchet: { max_pending: number };
    routes: Record<string, Record<string, Declaration>>;
};

const report = runRouteCapabilityCheck() as Report;

/**
 * Re-run the check against a mutated copy of the table, to prove it can fail.
 *
 * The copy goes to a temp file and the committed table is never written. An earlier draft
 * mutate-and-restored the real file, which meant a run killed mid-test left the repository dirty
 * and the ratchet ceiling wrong — a negative fixture must not be able to damage the thing it tests.
 */
function checkWith(mutate: (t: typeof table) => void): Report {
    const copy = JSON.parse(readFileSync(TABLE_PATH, "utf8")) as typeof table;
    mutate(copy);
    const scratch = join(mkdtempSync(join(tmpdir(), "rl10-")), "routeCapabilities.declared.json");
    writeFileSync(scratch, JSON.stringify(copy, null, 2));
    try {
        return runRouteCapabilityCheck(scratch) as Report;
    } finally {
        rmSync(dirname(scratch), { recursive: true, force: true });
    }
}

describe("W-14 · RL-10 — the declared route capability table", () => {
    it("passes against the committed table", () => {
        expect(report.violations).toEqual([]);
        expect(report.ok).toBe(true);
    });

    it("declares at METHOD grain, not file grain", () => {
        // 05…§9: "A gated file does not mean every method in it is gated." A file-grained table
        // would inherit the single largest weakness of the census it replaces. The handler count
        // must genuinely exceed the file count, or the grain has silently collapsed.
        expect(report.counts.methods).toBeGreaterThan(report.counts.routes);
    });

    it("discovers its subject from disk rather than enumerating it", () => {
        const onDisk = new Map(report.onDisk);
        expect(onDisk.size).toBeGreaterThan(300);
        expect(Object.keys(table.routes).sort()).toEqual([...onDisk.keys()].sort());
    });

    it("fails when a route file is not declared", () => {
        const victim = Object.keys(table.routes)[0]!;
        const result = checkWith((t) => {
            delete t.routes[victim];
        });
        expect(result.ok).toBe(false);
        expect(result.violations.some((v) => v.kind === "undeclared-route" && v.route === victim)).toBe(true);
    });

    it("fails when an exported method is not declared", () => {
        // The failure a file-grained table cannot produce.
        const [victim, methods] = report.onDisk.find(([, m]) => m.length > 1)!;
        const result = checkWith((t) => {
            delete t.routes[victim]![methods[0]!];
        });
        expect(result.ok).toBe(false);
        expect(result.violations.some((v) => v.kind === "undeclared-method" && v.route === victim)).toBe(true);
    });

    it("fails when a declaration outlives its route", () => {
        const result = checkWith((t) => {
            t.routes["app/api/__deleted__/route.ts"] = { GET: { status: "pending" } };
        });
        expect(result.ok).toBe(false);
        expect(result.violations.some((v) => v.kind === "stale-route")).toBe(true);
    });

    it("fails when 'no capability required' is asserted without a reason", () => {
        const victim = Object.keys(table.routes)[0]!;
        const method = Object.keys(table.routes[victim]!)[0]!;
        const result = checkWith((t) => {
            t.routes[victim]![method] = { status: "none", reason: "n/a" } as Declaration;
        });
        expect(result.ok).toBe(false);
        expect(result.violations.some((v) => v.kind === "unreasoned-none")).toBe(true);
    });

    it("ratchets the pending backlog downward", () => {
        expect(report.counts.pending).toBeLessThanOrEqual(table.ratchet.max_pending);
        const result = checkWith((t) => {
            t.ratchet.max_pending = Math.max(0, t.ratchet.max_pending - 1);
        });
        expect(result.violations.some((v) => v.kind === "ratchet-pending")).toBe(true);
    });

    it("every declared capability is a key the permission catalog seeds", () => {
        // W-11's tier A check, expressible for the first time. A route declaring a capability the
        // catalog does not hold can never be satisfied by any grant — it is a permanent 403 that
        // reads like a gate.
        const catalog = new Set(discoverCatalog().keys());
        const undeclared: { route: string; method: string; capability: string }[] = [];
        for (const [route, methods] of Object.entries(table.routes)) {
            for (const [method, decl] of Object.entries(methods)) {
                if (decl.status === "declared" && !catalog.has(decl.capability)) {
                    undeclared.push({ route, method, capability: decl.capability });
                }
            }
        }
        expect(undeclared, "declared capabilities absent from the seeded catalog").toEqual([]);
    });

    it("the pilot slice is genuinely declared, not all-pending", () => {
        // W-14 delivers the mechanism AND a pilot. A table of 751 `pending` entries would satisfy
        // every structural property above while asserting nothing about enforcement.
        expect(report.counts.declared).toBeGreaterThanOrEqual(20);
        expect(report.counts.none).toBeGreaterThanOrEqual(1);
    });

    it("the retired census is gone", () => {
        // 03…§8: "Retire auditAuthorityPaths.mjs in this workstream — leaving a known-30×-wrong
        // census in the repo invites someone to cite it." C1 is that citation happening.
        expect(existsSync(resolve(__dirname, "../../scripts/auditAuthorityPaths.mjs"))).toBe(false);
        const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
            scripts: Record<string, string>;
        };
        expect(Object.keys(pkg.scripts)).not.toContain("audit:authority-paths");
        expect(pkg.scripts.prebuild).toContain("check:route-capabilities");
    });
});
