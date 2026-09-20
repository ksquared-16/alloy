/**
 * THE WU-03 SEED MUST RETIRE THE SECOND ROUND TRIP WITHOUT WIDENING WHAT ANYONE CAN SEE.
 *
 * Measured deployed at 8c8972d5e: the document finishes ~1,726ms, the browser THEN issues
 * /api/admin/queue-view-totals ~57ms later, that request costs ~1,588ms, and WU-03's final
 * authoritative mutation lands 11.0-12.2ms after it responds — on 11 of 11 samples. So
 * FIRST_ORDER_VISIBLE_COMPLETE is, to within ~11ms, the moment that second trip returns.
 *
 * The seed removes it by computing the counts in the document, where the prerequisite truth
 * already exists. That makes it simultaneously the repair for the ~401ms-per-group duplicated
 * access work across five lifecycle work units.
 *
 * Two classes of thing can go wrong, and they fail in opposite directions:
 *
 *   TOO LITTLE — the client keeps fetching, the seed binds nothing, and the architecture is dead
 *   weight that still costs the server the computation.
 *
 *   TOO MUCH — a seed answers a question it was not computed for. The dangerous one is scope: the
 *   document composes UNFILTERED, so handing its counts to a site-filtered operator overstates
 *   every lane with numbers that look authoritative.
 *
 * These gates hold both ends, and hold the architectural rules that make the saving real rather
 * than relocated: no second counting semantic, no cache, no per-group re-acquisition, and no
 * hardcoded configuration anywhere in the path.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    matchWorkViewTotalsSeed,
    type WorkViewTotalsSeedRejection,
} from "@/lib/presentation/runtime/matchWorkViewTotalsSeed";
import {
    buildConfiguredViewSignature,
    type WorkViewTotalsSeed,
} from "@/lib/runtime/provisioning/workViewTotalsSeedContract";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Comments state intent; only code may satisfy a gate. */
const codeOf = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SEED = codeOf(read("lib/runtime/provisioning/workViewTotalsSeed.ts"));
const EVALUATOR = codeOf(read("lib/queues/evaluateWorkViewTotalsForGroup.ts"));
const ROUTE = codeOf(read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts"));
const COMPOSER = codeOf(read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts"));
const HOOK = codeOf(read("lib/presentation/runtime/useWorkViewTotals.ts"));
const MATCHER = codeOf(read("lib/presentation/runtime/matchWorkViewTotalsSeed.ts"));
const CONTRACT = codeOf(read("lib/runtime/provisioning/workViewTotalsSeedContract.ts"));

/*
 * FIXTURES ARE CONFIGURATION-DERIVED. Nothing here encodes today's seven views, their order, or
 * their names: every case builds its own view set and derives the signature the same way the
 * server does, so the gates keep working when the tenant reconfigures.
 */
const makeSeed = (args: {
    orgId?: string;
    hostWorkUnitId?: string;
    selectedSiteId?: string | null;
    views: ReadonlyArray<{ id: string; host?: string; count: number | null; known?: boolean }>;
}): WorkViewTotalsSeed => ({
    status: "resolved",
    identity: {
        orgId: args.orgId ?? "org-1",
        hostWorkUnitId: args.hostWorkUnitId ?? "wu-surface",
        selectedSiteId: args.selectedSiteId ?? null,
        configuredViewSignature: buildConfiguredViewSignature(args.views.map((v) => v.id)),
    },
    totals: args.views.map((v) => ({
        workUnitId: v.host ?? "wu-host",
        queueKey: "lane",
        workViewId: v.id,
        count: v.count,
        known: v.known ?? true,
    })),
    spans: {
        child_counts: 0,
        population: 0,
        epp: 0,
        tours: 0,
        aggregate: 0,
        views: args.views.length,
        child_views: 0,
        lane_views: args.views.length,
        unknown_views: 0,
    },
});

const match = (seed: WorkViewTotalsSeed | null, over: Partial<Parameters<typeof matchWorkViewTotalsSeed>[0]> = {}) =>
    matchWorkViewTotalsSeed({
        seed,
        orgId: "org-1",
        hostWorkUnitId: "wu-surface",
        selectedSiteId: null,
        viewIds: ["a", "b", "c"],
        ...over,
    });

const rejects = (m: ReturnType<typeof matchWorkViewTotalsSeed>, reason: WorkViewTotalsSeedRejection) => {
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.reason).toBe(reason);
};

describe("a matching seed answers, so the client asks nothing", () => {
    it("matches on identical identity and returns every configured count", () => {
        const seed = makeSeed({ views: [{ id: "a", count: 3 }, { id: "b", count: 0 }, { id: "c", count: 7 }] });
        const m = match(seed);
        expect(m.ok).toBe(true);
        if (!m.ok) return;
        expect(m.totals.size).toBe(3);
        expect([...m.totals.values()].sort()).toEqual([0, 3, 7]);
    });

    it("A LOADED ZERO STAYS ZERO", () => {
        // Authoritative zero and "no answer" are different facts. Collapsing them is how an
        // operator is told a lane is empty when nobody actually counted it.
        const seed = makeSeed({ views: [{ id: "a", count: 0, known: true }, { id: "b", count: 1 }, { id: "c", count: 1 }] });
        const m = match(seed);
        expect(m.ok).toBe(true);
        if (!m.ok) return;
        expect([...m.totals.values()]).toContain(0);
        expect(m.unknownViewIds).toEqual([]);
    });

    it("UNKNOWN ARRIVES AS NULL, NEVER AS ZERO", () => {
        const seed = makeSeed({
            views: [{ id: "a", count: null, known: false }, { id: "b", count: 2 }, { id: "c", count: 2 }],
        });
        const m = match(seed);
        expect(m.ok).toBe(true);
        if (!m.ok) return;
        expect([...m.totals.values()]).toContain(null);
        expect([...m.totals.values()]).not.toContain(0);
        // Surfaced by identity so a deployed sample can prove it saw none.
        expect(m.unknownViewIds).toEqual(["a"]);
    });

    it("an unsupported configured view terminates as UNKNOWN rather than staying pending", () => {
        // The server reports it `known:false`; the client must receive a settled null, not an
        // absent key that renders as a permanently reserved pill.
        const seed = makeSeed({ views: [{ id: "a", count: null, known: false }, { id: "b", count: 1 }, { id: "c", count: 1 }] });
        const m = match(seed);
        expect(m.ok).toBe(true);
        if (!m.ok) return;
        const key = [...m.totals.keys()].find((k) => k.endsWith("::a"));
        expect(key).toBeDefined();
        expect(m.totals.has(key!)).toBe(true);
        expect(m.totals.get(key!)).toBeNull();
    });
});

describe("configuration identity — N must not satisfy N+1", () => {
    it("a REORDER still matches, because order changes no count", () => {
        const seed = makeSeed({ views: [{ id: "c", count: 1 }, { id: "a", count: 2 }, { id: "b", count: 3 }] });
        expect(match(seed, { viewIds: ["a", "b", "c"] }).ok).toBe(true);
    });

    it("a REMOVED view rejects the seed", () => {
        const seed = makeSeed({ views: [{ id: "a", count: 1 }, { id: "b", count: 1 }, { id: "c", count: 1 }] });
        rejects(match(seed, { viewIds: ["a", "b"] }), "configuration_mismatch");
    });

    it("an ADDED view rejects the seed", () => {
        const seed = makeSeed({ views: [{ id: "a", count: 1 }, { id: "b", count: 1 }, { id: "c", count: 1 }] });
        rejects(match(seed, { viewIds: ["a", "b", "c", "d"] }), "configuration_mismatch");
    });

    it("SAME CARDINALITY, DIFFERENT IDENTITIES rejects — the case a count check would pass", () => {
        const seed = makeSeed({ views: [{ id: "a", count: 1 }, { id: "b", count: 1 }, { id: "c", count: 1 }] });
        rejects(match(seed, { viewIds: ["a", "b", "z"] }), "configuration_mismatch");
    });

    it("the signature is derived, never a literal view list", () => {
        // A gate that hardcoded today's views would pass forever and protect nothing.
        expect(buildConfiguredViewSignature(["b", "a"])).toBe(buildConfiguredViewSignature(["a", "b"]));
        expect(buildConfiguredViewSignature(["a"])).not.toBe(buildConfiguredViewSignature(["a", "b"]));
        for (const src of [SEED, MATCHER, HOOK]) {
            expect(src).not.toMatch(/new_leads|Waitlist|Registration|Enrolled|Pipeline Children/);
        }
    });
});

describe("scope and authorization — the seed is data, not authority", () => {
    it("a wrong org rejects", () => {
        rejects(match(makeSeed({ orgId: "org-2", views: [{ id: "a", count: 1 }, { id: "b", count: 1 }, { id: "c", count: 1 }] })), "org_mismatch");
    });

    it("a wrong host work unit rejects", () => {
        rejects(
            match(makeSeed({ hostWorkUnitId: "wu-other", views: [{ id: "a", count: 1 }, { id: "b", count: 1 }, { id: "c", count: 1 }] })),
            "host_work_unit_mismatch",
        );
    });

    it("AN UNFILTERED SEED MUST NOT ANSWER A SITE-FILTERED OPERATOR", () => {
        /*
         * The dangerous direction. The document composes with no workspace site filter, so its
         * counts are strictly wider; rendering them for a narrowed operator overstates every lane
         * with a number that looks authoritative.
         */
        const seed = makeSeed({ selectedSiteId: null, views: [{ id: "a", count: 99 }, { id: "b", count: 1 }, { id: "c", count: 1 }] });
        rejects(match(seed, { selectedSiteId: "site-1" }), "site_scope_mismatch");
    });

    it("a seed for one site must not answer another, nor an unfiltered client", () => {
        const seed = makeSeed({ selectedSiteId: "site-1", views: [{ id: "a", count: 1 }, { id: "b", count: 1 }, { id: "c", count: 1 }] });
        rejects(match(seed, { selectedSiteId: "site-2" }), "site_scope_mismatch");
        rejects(match(seed, { selectedSiteId: null }), "site_scope_mismatch");
    });

    it("no capability or permission verdict rides in the seed", () => {
        // The seed carries counts and an identity. Anything resembling authority in its shape
        // would be a verdict transported across a request boundary.
        for (const forbidden of ["canMutate", "permission", "roleKeys", "capabilit", "allowed", "grant"]) {
            expect(SEED, `seed must not carry ${forbidden}`).not.toMatch(new RegExp(`${forbidden}\\w*\\s*[:?]`, "i"));
        }
    });

    it("the seed resolves accessibility from gate-produced rows, and never reads for it", () => {
        expect(SEED).toContain("is_active");
        expect(SEED).toContain("sameDepartment");
        // A read here would reintroduce exactly the per-group acquisition this change retires.
        expect(SEED).not.toMatch(/\.from\(|supabase\s*\.\s*from|workUnitAccessible|fetchDepartmentMetadataForWorkUnit/);
    });

    it("a missing host is UNKNOWN, not assumed accessible", () => {
        expect(SEED).toContain("activeById.get(group.workUnitId) === true");
    });
});

describe("no second architecture", () => {
    it("the document never calls the standalone endpoint", () => {
        for (const src of [SEED, ROUTE, COMPOSER]) {
            expect(src).not.toContain("/api/admin/queue-view-totals");
        }
    });

    it("both callers share ONE count evaluator", () => {
        expect(SEED).toContain("evaluateWorkViewTotalsForGroup");
        expect(codeOf(read("app/api/admin/queue-view-totals/route.ts"))).toContain(
            "evaluateWorkViewTotalsForGroup",
        );
    });

    it("Work View predicates are not copied into the seed", () => {
        // Grain resolution, membership and the projection stay with their existing owners; the
        // seed only supplies prerequisites and delegates.
        expect(SEED).not.toContain("computeOperationalProjection(");
        expect(SEED).not.toContain("aggregateWorkViewTotals(");
        expect(SEED).not.toContain("resolveLensRowGrain(");
        expect(SEED).not.toContain("isWorkViewCatchAll");
    });

    it("the composer still evaluates ONE lens and never grew a count fan-out", () => {
        /*
         * The composer legitimately projects the ACTIVE lens for its own rows, and always has —
         * its own comment reads "only the active lens — no count fan-out, no second evaluation".
         * That is the line worth protecting: the seed must not have turned the composer into a
         * second place where every configured view gets evaluated.
         */
        const at = COMPOSER.indexOf("computeOperationalProjection({");
        expect(at).toBeGreaterThan(-1);
        const call = COMPOSER.slice(at, COMPOSER.indexOf("})", at) + 2);
        expect(call).toContain("workViews: [activeView]");
        // Exactly one projection call in the composer — a second would be the fan-out.
        expect((COMPOSER.match(/computeOperationalProjection\(\{/g) ?? []).length).toBe(1);
        expect(COMPOSER).not.toContain("aggregateWorkViewTotals(");
    });

    it("no maintained per-view counter is introduced", () => {
        for (const src of [SEED, EVALUATOR, HOOK]) {
            expect(src).not.toMatch(/maintained_?[a-z_]*count|counter_table|upsert\(/i);
        }
    });

    it("the seed adds no cache and is not persisted beyond the request", () => {
        expect(SEED).not.toMatch(/localStorage|sessionStorage|globalThis\.__|new Map\(\)\s*;?\s*\/\/\s*cache/i);
    });

    it("the client consults the seed before falling back, and only once", () => {
        /*
         * STRENGTHENED after a planted defect stayed green.
         *
         * The plant kept the call and discarded its result
         * (`({ ok: false } as const) && matchWorkViewTotalsSeed(...)`), which a `toContain` on the
         * call text cannot see. A gate that only proves a function is MENTIONED does not prove it
         * DECIDES anything, so this now pins the result to the branch that seeds.
         */
        const at = HOOK.indexOf("matchWorkViewTotalsSeed({");
        expect(at).toBeGreaterThan(-1);
        // The call's value must be bound, not discarded.
        expect(HOOK.slice(Math.max(0, at - 40), at)).toMatch(/const\s+match\s*=\s*$/);
        const block = HOOK.slice(at, at + 900);
        // ...and that binding must be what decides whether the seed is used.
        expect(block).toMatch(/if\s*\(\s*match\.ok\s*\)/);
        expect(block).toContain("totals: match.totals");
        // The one-shot skip is what makes a matching seed cost ZERO requests.
        expect(HOOK).toContain("skipFreshFetchRef");
        expect(block).toMatch(/fresh:\s*true/);
    });

    it("a rejected seed falls through to the existing canonical path", () => {
        // Rejection must not disable fetching; it must behave exactly as before the seed existed.
        const at = HOOK.indexOf("matchWorkViewTotalsSeed(");
        expect(at).toBeGreaterThan(-1);
        const block = HOOK.slice(at, at + 900);
        expect(block).toContain("peekWorkUnitSurfaceTotalsCache");
    });
});

describe("contracts may cross to the browser, server implementations may not", () => {
    /*
     * CAUGHT BY THE PRODUCTION BUILD, not by any gate.
     *
     * The client matcher first imported `buildConfiguredViewSignature` as a VALUE from the
     * server-only resolver. A type-only import would have been erased and cost nothing; a value
     * import is a real module edge, and it pulled the Supabase graph into the client bundle:
     *
     *     'server-only' cannot be imported from a Client Component module.
     *
     * typecheck and typecheck:tests both passed. Only `next build` saw it. These gates make the
     * boundary checkable without a full build.
     */
    it("the contract module is importable from the browser", () => {
        expect(CONTRACT).not.toContain('import "server-only"');
        expect(CONTRACT).not.toMatch(/@supabase\/supabase-js|createAdminClient|from\(\s*["']/);
    });

    it("the client matcher imports ONLY the contract, never the resolver", () => {
        expect(MATCHER).toContain("workViewTotalsSeedContract");
        // The resolver is `server-only`; any edge to it — value or otherwise — breaks the build.
        expect(MATCHER).not.toMatch(/from "@\/lib\/runtime\/provisioning\/workViewTotalsSeed"/);
        expect(MATCHER).not.toContain("@/lib/queues/evaluateWorkViewTotalsForGroup");
    });

    it("the client hook takes the seed TYPE from the contract", () => {
        expect(HOOK).toContain("workViewTotalsSeedContract");
        expect(HOOK).not.toMatch(/from "@\/lib\/runtime\/provisioning\/workViewTotalsSeed"/);
    });

    it("the server resolver and evaluator remain server-only", () => {
        // The implementations must NOT become importable just because the contract split exists.
        expect(SEED).toContain('import "server-only"');
        expect(EVALUATOR).toContain('import "server-only"');
    });

    it("the signature has ONE derivation, shared by both sides", () => {
        // Two copies could drift, and a drifted signature silently rejects every seed.
        expect(CONTRACT).toContain("export function buildConfiguredViewSignature");
        expect(MATCHER).not.toContain("function buildConfiguredViewSignature");
        expect(SEED).not.toContain("export function buildConfiguredViewSignature(viewIds");
    });
});

describe("the server join publishes its cost instead of hiding it", () => {
    it("there is no grace and no timeout on the seed join", () => {
        const at = ROUTE.indexOf("const tSeedJoin");
        expect(at).toBeGreaterThan(-1);
        const block = ROUTE.slice(at, at + 1200);
        expect(block).not.toMatch(/setTimeout|Promise\.race|AbortSignal\.timeout|grace/i);
    });

    it("join wait is measured and emitted as its own span", () => {
        expect(ROUTE).toContain("seedDiag.join_wait_ms");
        expect(ROUTE).toContain("join_wait_ms: seedDiag.join_wait_ms");
        expect(codeOf(read("lib/perf/routeTimingDiagnostic.ts"))).toContain("join_wait_ms");
    });

    it("an unresolved seed carries no totals at all", () => {
        // `unavailable` must be structurally incapable of looking like authoritative zeros.
        const unavailable: WorkViewTotalsSeed = { status: "unavailable", reason: "no_department" };
        rejects(match(unavailable), "seed_unavailable");
        expect(match(null).ok).toBe(false);
    });
});
