/**
 * THE ACQUISITION MUST BE HOISTED ABOVE THE GROUPS, OR IT IS SHARED WITH NOBODY.
 *
 * A count group is (work unit, queue key). Measured deployed at 445bc8b23 the surface's three
 * child lenses sat in THREE DIFFERENT groups — so a base acquired inside the group evaluator would
 * have been acquired three times and shared with one lens each, which is what it already did.
 *
 * Neither child membership rule filters by work unit: both read the org's enrollment instances and
 * narrow afterwards, by effective stage or by the Enrollment Definition's liveness gate. That is
 * exactly why one request-scoped acquisition can serve every group — and why this gate counts
 * READS rather than asserting that a parameter is passed.
 */
import { describe, expect, it } from "vitest";

import { resolveWorkViewTotalsSeed } from "@/lib/runtime/provisioning/workViewTotalsSeed";
import { applyEnrollmentTemplateToProcess } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { classifyRequestedWorkViews } from "@/lib/queues/evaluateWorkViewTotalsForGroup";

const ORG = "org-1";
const DEPT = "dept-1";
type Rec = Record<string, unknown>;

/** Three host work units, so the three child lenses land in three different groups. */
const HOSTS = ["wu-a", "wu-b", "wu-c"];

function fixtureSupabase(data: Record<string, Rec[]>) {
    const reads: Record<string, number> = {};
    const supabase = {
        from(table: string) {
            const eqs: Record<string, unknown> = {};
            let orStages: string[] | null = null;
            let orNull = false;
            let inCol: string | null = null;
            let inVals: string[] = [];
            const builder: Rec = {
                select: () => builder,
                eq(c: string, v: unknown) { eqs[c] = v; return builder; },
                or(expr: string) {
                    orNull = /stage_key\.is\.null/.test(expr);
                    const one = /stage_key\.eq\.([^,)]+)/.exec(expr);
                    const many = /stage_key\.in\.\(([^)]*)\)/.exec(expr);
                    orStages = many ? many[1].split(",").filter(Boolean) : one ? [one[1]] : [];
                    return builder;
                },
                in(c: string, v: string[]) { inCol = c; inVals = v; return builder; },
                then(resolve: (r: { data: Rec[]; error: null }) => void) {
                    reads[table] = (reads[table] ?? 0) + 1;
                    let rows = (data[table] ?? []).slice();
                    for (const [c, v] of Object.entries(eqs)) rows = rows.filter((r) => r[c] === v);
                    if (orStages !== null) {
                        const want = orStages as string[];
                        rows = rows.filter((r) => (r.stage_key == null ? orNull : want.includes(String(r.stage_key))));
                    }
                    if (inCol) rows = rows.filter((r) => inVals.includes(String(r[inCol as string])));
                    resolve({ data: rows, error: null });
                },
            };
            return builder;
        },
    } as never;
    return { supabase, reads };
}

/** Enrollment template stages, with three child lenses declared across three hosts. */
function metadataWithChildLenses() {
    const proc = applyEnrollmentTemplateToProcess({
        id: "p1", key: ENROLLMENT_PROCESS_KEY, name: "Enrollment", primary_entity: "opportunity",
        sort_order: 0, is_active: true, stages: [],
    }) as unknown as Rec;
    proc.work_views_v1 = [
        { id: "cv-all", label: "All Children", row_grain_v1: "child", filters_v1: [] },
        { id: "cv-wl", label: "Waitlist Children", row_grain_v1: "child", filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "waitlist" }] },
        /*
         * `enrolling`, not `lead`. A lens that declares Row Grain "child" while filtering on a
         * FAMILY-grain stage is refused by `resolveLensRowGrain` — correctly — and lands in
         * unknownViews, not childViews. The first draft of this fixture used `lead` and the gate
         * failed for that reason rather than for anything about the acquisition.
         */
        { id: "cv-enr", label: "Enrolling Children", row_grain_v1: "child", filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "enrolling" }] },
    ];
    return { [LIFECYCLE_BUILDER_METADATA_KEY]: { version: 1, active_process_id: "p1", processes: [proc] } };
}

const DATA: Record<string, Rec[]> = {
    process_instances: [
        { id: "p1", org_id: ORG, process_key: "enrollment", subject_type: "child", subject_id: "c1", context_id: "o1", stage_key: null, state: null, close_reason_key: null, metadata: {}, updated_at: null, created_at: null },
        { id: "p2", org_id: ORG, process_key: "enrollment", subject_type: "child", subject_id: "c2", context_id: "o1", stage_key: "waitlist", state: null, close_reason_key: null, metadata: {}, updated_at: null, created_at: null },
    ],
    opportunities: [{ id: "o1", org_id: ORG, status_key: "open", stage_key: "lead", customer_id: "cu1", work_unit_id: "wu-a", location_id: null, metadata: {} }],
    customer_members: [
        { id: "c1", org_id: ORG, display_name: "A", is_active: true },
        { id: "c2", org_id: ORG, display_name: "B", is_active: true },
    ],
};

const seedInput = (supabase: never, share: boolean) => ({
    supabase,
    orgId: ORG,
    hostWorkUnitId: HOSTS[0],
    countTargets: [
        { workViewId: "cv-all", hostWorkUnitId: HOSTS[0], baseQueueKey: "q-a" },
        { workViewId: "cv-wl", hostWorkUnitId: HOSTS[1], baseQueueKey: "q-b" },
        { workViewId: "cv-enr", hostWorkUnitId: HOSTS[2], baseQueueKey: "q-c" },
    ] as never,
    deptWorkUnits: HOSTS.map((id) => ({ id, is_active: true, department_id: DEPT })),
    departmentMetadata: metadataWithChildLenses(),
    departmentId: DEPT,
    recordScopeConstraints: null as never,
    recordScopeImpossible: false,
    viewerDisplayTimeZone: { iana: "UTC", source: "default", cacheHit: false } as never,
    shareChildAcquisition: share,
});

/**
 * A lens that DECLARES child grain while filtering on a FAMILY-grain stage contradicts itself, and
 * `resolveLensRowGrain` refuses it. The refusal must survive the hoist: a refused lens is UNKNOWN,
 * it is not swept into the shared acquisition, and it never falls through to a lane population
 * count — pill 1 over zero rows is the shape of the original defect.
 */
describe("a self-contradicting lens is still refused, in both arms", () => {
    const contradictory = () => {
        const md = metadataWithChildLenses() as Record<string, Rec>;
        const builder = md[LIFECYCLE_BUILDER_METADATA_KEY] as { processes: Rec[] };
        const proc = builder.processes[0];
        (proc.work_views_v1 as Rec[]).push({
            id: "cv-bad", label: "Child lens on a family stage", row_grain_v1: "child",
            filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "lead" }],
        });
        return md;
    };

    it("the classifier puts it in unknownViews, never in childViews", () => {
        const md = contradictory();
        const ids = savedWorkViewsFromDepartmentMetadata(md).map((v) => v.id);
        const { childViews, unknownViews, laneViews } = classifyRequestedWorkViews({
            metadata: md, viewIds: new Set(ids),
        });
        expect(unknownViews.map((v) => v.id)).toContain("cv-bad");
        expect(childViews.map((v) => v.id)).not.toContain("cv-bad");
        expect(laneViews.map((v) => v.id)).not.toContain("cv-bad");
    });

    it("it resolves UNKNOWN in both arms — never a number", async () => {
        const withBad = (share: boolean, supabase: never) => ({
            ...seedInput(supabase, share),
            departmentMetadata: contradictory(),
            countTargets: [
                ...seedInput(supabase, share).countTargets as unknown as Rec[],
                { workViewId: "cv-bad", hostWorkUnitId: HOSTS[0], baseQueueKey: "q-a" },
            ] as never,
        });
        for (const share of [false, true]) {
            const f = fixtureSupabase(DATA);
            const seed = await resolveWorkViewTotalsSeed(withBad(share, f.supabase) as never);
            if (seed.status !== "resolved") throw new Error("seed unavailable");
            const bad = (seed as { totals: { workViewId: string; count: number | null; known: boolean }[] })
                .totals.find((t) => t.workViewId === "cv-bad");
            expect(bad, `arm share=${share}`).toBeDefined();
            expect(bad!.known, `arm share=${share}`).toBe(false);
            expect(bad!.count, `arm share=${share}`).toBeNull();
        }
    });
});

describe("the request-scoped child acquisition", () => {
    it("the three lenses really do land in three separate groups", () => {
        const md = metadataWithChildLenses();
        const views = savedWorkViewsFromDepartmentMetadata(md).map((v) => v.id);
        expect(views).toEqual(expect.arrayContaining(["cv-all", "cv-wl", "cv-enr"]));
        const { childViews } = classifyRequestedWorkViews({ metadata: md, viewIds: new Set(views) });
        expect(childViews.map((v) => v.id).sort()).toEqual(["cv-all", "cv-enr", "cv-wl"]);
    });

    it("UNSHARED: each lens acquires its own — three instance reads for three lenses", async () => {
        const f = fixtureSupabase(DATA);
        const seed = await resolveWorkViewTotalsSeed(seedInput(f.supabase, false) as never);
        expect(seed.status).toBe("resolved");
        expect(f.reads.process_instances).toBe(3);
    });

    it("SHARED: one acquisition serves all three groups", async () => {
        const f = fixtureSupabase(DATA);
        const seed = await resolveWorkViewTotalsSeed(seedInput(f.supabase, true) as never);
        expect(seed.status).toBe("resolved");
        expect(f.reads.process_instances).toBe(1);
        expect(f.reads.opportunities).toBe(1);
        expect(f.reads.customer_members).toBe(1);
    });

    it("SAME ANSWER: the two arms return identical totals for every view", async () => {
        const a = await resolveWorkViewTotalsSeed(seedInput(fixtureSupabase(DATA).supabase, false) as never);
        const b = await resolveWorkViewTotalsSeed(seedInput(fixtureSupabase(DATA).supabase, true) as never);
        if (a.status !== "resolved" || b.status !== "resolved") throw new Error("seed unavailable");
        const norm = (s: typeof a) =>
            (s as { totals: { workViewId: string; count: number | null; known: boolean }[] }).totals
                .map((t) => `${t.workViewId}=${t.known ? t.count : "UNKNOWN"}`)
                .sort();
        expect(norm(b)).toEqual(norm(a));
        // And the answer is the real membership, not an empty one that would agree trivially.
        expect(norm(a)).toEqual(["cv-all=2", "cv-enr=0", "cv-wl=1"]);
    });

    it("a participation lens forces the unscoped base, and the spans say so", async () => {
        const f = fixtureSupabase(DATA);
        const seed = await resolveWorkViewTotalsSeed(seedInput(f.supabase, true) as never);
        if (seed.status !== "resolved") throw new Error("seed unavailable");
        const batches = seed.spans.child_batches;
        expect(batches.length).toBeGreaterThan(0);
        expect(batches[0].baseScope).toBe("all");
        expect(batches[0].base.piRows).toBe(2);
    });

    it("a failed shared acquisition falls back to per-lens reads rather than to a wrong number", async () => {
        let first = true;
        const base = fixtureSupabase(DATA);
        const flaky = {
            from(table: string) {
                if (table === "process_instances" && first) {
                    first = false;
                    const b: Rec = {
                        select: () => b, eq: () => b, or: () => b, in: () => b,
                        then: (r: (x: { data: null; error: { message: string } }) => void) =>
                            r({ data: null, error: { message: "acquisition failed" } }),
                    };
                    return b;
                }
                return (base.supabase as unknown as { from: (t: string) => unknown }).from(table);
            },
        } as never;
        const seed = await resolveWorkViewTotalsSeed(seedInput(flaky, true) as never);
        if (seed.status !== "resolved") throw new Error("seed unavailable");
        const totals = (seed as { totals: { workViewId: string; count: number | null; known: boolean }[] }).totals;
        expect(totals.map((t) => `${t.workViewId}=${t.known ? t.count : "UNKNOWN"}`).sort())
            .toEqual(["cv-all=2", "cv-enr=0", "cv-wl=1"]);
    });
});
