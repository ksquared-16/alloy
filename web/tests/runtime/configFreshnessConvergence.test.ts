/**
 * CONFIG FRESHNESS — ONE AUTHORITY, AND NO TTL STANDING IN FOR CORRECTNESS
 * (P0-7.6 · Step 1-prime).
 *
 * The defect this repairs was live and silent: an operator could edit stage/status assignments,
 * commit canonical truth, read again, and be served the PRE-EDIT definitions — because no writer on
 * that path bumped the caches in front of `status_definitions`. Nothing errored. Nothing logged. The
 * stale value looked authoritative until a timer expired.
 *
 * The two gates that matter hardest are the two whose failure is invisible in production:
 * a committed write that leaves a warm cache authoritative, and a NEW writer added later with no
 * freshness obligation at all.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
    invalidateLocationProgramCategoriesCache,
    loadLocationProgramCategoriesForOrg,
} from "@/lib/locations/loadLocationProgramCategoriesForOrg";
import { bumpOrgConfigFreshness } from "@/lib/admin/configFreshness";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** A client whose rows can change between reads, so a stale cache is observable. */
function clientReturning(rowsRef: { rows: Array<Record<string, unknown>> }, hits: { n: number }) {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "in", "is"]) chain[m] = () => chain as never;
    chain.then = (res: (v: { data: unknown; error: null }) => unknown) => {
        hits.n += 1;
        return Promise.resolve({ data: rowsRef.rows, error: null }).then(res);
    };
    return { from: () => chain } as never;
}
const CAT = (id: string, label: string) => ({
    id, org_id: "org-A", location_id: "loc-1", label, key: label.toLowerCase(),
    sort_order: 1, is_active: true, metadata: null,
});

beforeEach(() => invalidateLocationProgramCategoriesCache());
afterEach(() => { invalidateLocationProgramCategoriesCache(); vi.restoreAllMocks(); });

describe("a committed write is visible immediately, without waiting for a TTL", () => {
    it("THE GATE: warm the cache, mutate, bump — the next read is the NEW truth", async () => {
        const rows = { rows: [CAT("c1", "Infant")] };
        const hits = { n: 0 };
        const supa = clientReturning(rows, hits);

        const first = await loadLocationProgramCategoriesForOrg(supa, "org-A");
        expect(first.map((r) => r.label)).toEqual(["Infant"]);
        expect(hits.n).toBe(1);

        // Warm: a second read must NOT hit the database — that is what makes staleness possible.
        await loadLocationProgramCategoriesForOrg(supa, "org-A");
        expect(hits.n, "the cache never warmed, so this proves nothing").toBe(1);

        rows.rows = [CAT("c1", "Infant"), CAT("c2", "Toddler")];   // canonical truth moves
        bumpOrgConfigFreshness({ family: "location_program_categories", orgId: "org-A" });

        const after = await loadLocationProgramCategoriesForOrg(supa, "org-A");
        expect(after.map((r) => r.label), "a committed write is still invisible").toEqual(["Infant", "Toddler"]);
        expect(hits.n).toBe(2);
    });

    it("THE GATE: without the bump the warm cache keeps answering — the defect, demonstrated", async () => {
        /* The negative control. If this passed after a mutation, the gate above would be measuring
         * nothing and a TTL would be doing the work correctness is supposed to do. */
        const rows = { rows: [CAT("c1", "Infant")] };
        const hits = { n: 0 };
        const supa = clientReturning(rows, hits);
        await loadLocationProgramCategoriesForOrg(supa, "org-A");
        rows.rows = [CAT("c1", "Infant"), CAT("c2", "Toddler")];
        const stale = await loadLocationProgramCategoriesForOrg(supa, "org-A");
        expect(stale.map((r) => r.label)).toEqual(["Infant"]);   // stale, by construction
        expect(hits.n).toBe(1);
    });
});

describe("org-local is narrower than platform-default", () => {
    it("THE GATE: bumping org A leaves org B's warm truth alone", async () => {
        const a = { rows: [CAT("a1", "A-only")] };
        const b = { rows: [{ ...CAT("b1", "B-only"), org_id: "org-B" }] };
        const hitsA = { n: 0 }; const hitsB = { n: 0 };
        await loadLocationProgramCategoriesForOrg(clientReturning(a, hitsA), "org-A");
        await loadLocationProgramCategoriesForOrg(clientReturning(b, hitsB), "org-B");
        expect(hitsA.n).toBe(1); expect(hitsB.n).toBe(1);

        bumpOrgConfigFreshness({ family: "location_program_categories", orgId: "org-A" });

        await loadLocationProgramCategoriesForOrg(clientReturning(a, hitsA), "org-A");
        await loadLocationProgramCategoriesForOrg(clientReturning(b, hitsB), "org-B");
        expect(hitsA.n, "org A did not refresh").toBe(2);
        expect(hitsB.n, "org A's write flushed org B — over-invalidation across a tenant boundary").toBe(1);
    });

    it("THE GATE: a PLATFORM-DEFAULT bump reaches every inheriting org", async () => {
        const a = { rows: [CAT("a1", "A")] };
        const b = { rows: [{ ...CAT("b1", "B"), org_id: "org-B" }] };
        const hitsA = { n: 0 }; const hitsB = { n: 0 };
        await loadLocationProgramCategoriesForOrg(clientReturning(a, hitsA), "org-A");
        await loadLocationProgramCategoriesForOrg(clientReturning(b, hitsB), "org-B");

        bumpOrgConfigFreshness({ family: "location_program_categories", orgId: null });

        await loadLocationProgramCategoriesForOrg(clientReturning(a, hitsA), "org-A");
        await loadLocationProgramCategoriesForOrg(clientReturning(b, hitsB), "org-B");
        expect(hitsA.n).toBe(2);
        expect(hitsB.n, "an inheriting org kept serving a superseded platform default").toBe(2);
    });

    it("status definitions narrow to the ORG tag, and widen only for a platform default", () => {
        const owner = read("lib/admin/configFreshness.ts");
        expect(owner).toContain("tag(`status-def-org:${org}`)");
        expect(owner).toMatch(/else \{\s*for \(const t of STATUS_EFFECTIVE_UNSTABLE_CACHE_TAGS\) tag\(t\);/);
    });
});

describe("the live defect is repaired at the canonical owner", () => {
    const PERSIST = read("lib/lifecycle/persistEnrollmentStageStatusAssignments.ts");
    const ROUTE = read("app/api/admin/enrollment-process/status-stages/route.ts");

    it("THE GATE: the shared write owner bumps, so every caller is covered", () => {
        /* Bumped here rather than in the callers: `saveLifecycleStageRuntimeConfig` and the
         * Enrollment Process route both come through this function, and a caller that forgets
         * reintroduces exactly the defect. */
        expect(PERSIST).toContain("revalidateEffectiveStatusDefinitionsCache(orgId)");
        expect(PERSIST).toMatch(/if \(changedIds\.length > 0\) \{[\s\S]{0,80}revalidateEffectiveStatusDefinitionsCache/);
    });

    it("THE GATE: it bumps only when something changed, and only after the write returned", () => {
        // A bump for a write that did not commit re-caches the old row under a fresh timestamp,
        // which is worse than never bumping.
        const idx = PERSIST.indexOf("revalidateEffectiveStatusDefinitionsCache(orgId)");
        expect(PERSIST.slice(0, idx)).toContain("changedIds.push");
        expect(PERSIST.indexOf("return { changedIds };")).toBeGreaterThan(idx);
    });

    it("THE GATE: the direct reset path bumps too", () => {
        expect(ROUTE).toContain("revalidateEffectiveStatusDefinitionsCache(orgId)");
    });
});

describe("coverage cannot be forgotten by writer #22", () => {
    /**
     * The original defect class is a NEW writer mutating configuration and forgetting freshness.
     * Counting today's files would not catch that, so this derives the writer set from the source
     * tree every run: any module that WRITES a family with a CACHED READ must reach the bump owner.
     */
    const CACHED_FAMILIES = ["status_definitions", "location_program_categories"] as const;
    const BUMP = /revalidateEffectiveStatusDefinitionsCache|bumpOrgConfigFreshness|invalidateLocationProgramCategoriesCache/;
    const WRITE = /\.(insert|update|upsert|delete)\s*\(/;

    function writersOf(table: string): string[] {
        const out: string[] = [];
        const walk = (dir: string) => {
            for (const e of require("node:fs").readdirSync(dir, { withFileTypes: true })) {
                const p = join(dir, e.name);
                if (e.isDirectory()) { if (!/node_modules|__tests__/.test(e.name)) walk(p); continue; }
                if (!/\.tsx?$/.test(e.name) || /\.test\./.test(e.name)) continue;
                const src = readFileSync(p, "utf8");
                for (const m of src.matchAll(new RegExp(`\\.from\\(\\s*["']${table}["']\\s*\\)`, "g"))) {
                    const chain = src.slice(m.index ?? 0, (m.index ?? 0) + 400).split(/;\s*\n/)[0]!;
                    if (WRITE.test(chain)) { out.push(p.replace(`${process.cwd()}/`, "")); break; }
                }
            }
        };
        walk(join(process.cwd(), "lib"));
        walk(join(process.cwd(), "app"));
        return [...new Set(out)];
    }

    /** Writers that legitimately reach the bump through a shared owner rather than directly. */
    const COVERED_TRANSITIVELY = new Set([
        // its only caller is persistStageStatusAssignments, which bumps
        "lib/lifecycle/ensureOrgOpportunityStatus.ts",
        // demo/dev seeders: not an operator path, and they run before any cache is warm
        "app/api/admin/financial/seed-demo/route.ts",
        "lib/dev/seedChildcareDemo.ts",
    ]);

    for (const table of CACHED_FAMILIES) {
        it(`THE GATE: every writer of ${table} reaches the freshness owner`, () => {
            const uncovered = writersOf(table).filter((f) => {
                if (COVERED_TRANSITIVELY.has(f)) return false;
                return !BUMP.test(readFileSync(join(process.cwd(), f), "utf8"));
            });
            expect(
                uncovered,
                `these modules write ${table} — which has a CACHED read — without publishing freshness. `
                + "Call bumpOrgConfigFreshness after the write commits, or justify an entry in "
                + "COVERED_TRANSITIVELY.",
            ).toEqual([]);
        });
    }

    it("families with NO cached read carry no freshness obligation, and none was invented", () => {
        /*
         * option_sets, option_set_items, gl_accounts, gl_account_mappings and charge templates are
         * read directly from Postgres by every reader. There is nothing in front of them to go stale,
         * so requiring a bump would be inventing an obligation to satisfy a coverage metric.
         */
        const owner = read("lib/admin/configFreshness.ts");
        for (const absent of ["option_sets", "gl_accounts", "gl_account_mappings", "financial_charge_templates"]) {
            expect(owner, `${absent} has no cached read; it must not acquire a freshness obligation`)
                .not.toContain(`"${absent}"`);
        }
    });
});

describe("the abandoned payload projection is gone, not dormant", () => {
    it("THE GATE: no Step 1 projection artifact survives", () => {
        for (const f of [
            "lib/runtime/config/orgConfigProjectionContract.ts",
            "lib/runtime/config/buildOrgConfigProjection.ts",
            "lib/runtime/config/orgConfigProjectionStore.ts",
            "lib/runtime/config/orgConfigProjectionHealth.ts",
            "lib/runtime/config/resolveFinancialsConfigRead.ts",
            "lib/runtime/config/resolveOptionSetRead.ts",
            "app/api/admin/config-projection/route.ts",
        ]) {
            expect(existsSync(join(process.cwd(), f)), `${f} still exists — a second architecture kept "just in case"`).toBe(false);
        }
    });

    it("THE GATE: the option-set route reads canonically again", () => {
        const route = read("app/api/admin/option-sets/[setKey]/route.ts");
        expect(route).not.toContain("resolveOptionSetRead");
        expect(route).toContain('.from("option_sets")');
    });

    it("the freshness owner stores no payload and owns no cache", () => {
        // Code only: the file's own prose names these mechanisms in order to explain what it is NOT.
        const code = read("lib/admin/configFreshness.ts")
            .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        expect(code).not.toMatch(/new Map\(|processMap\(|unstable_cache/);
        expect(code).not.toMatch(/\.from\(/);
    });
});
