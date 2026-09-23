/**
 * A LENS THAT CONTRADICTS ITSELF IS UNKNOWN, NEVER A LANE COUNT.
 *
 * A lens declaring child Row Grain while filtering on a FAMILY-grain stage is refused by
 * `resolveLensRowGrain`. The refusal has to survive whatever the count path is doing: a refused
 * lens must not fall through to the opportunity lane's population, because a pill of one over zero
 * rows is the shape of the 13-vs-8 defect.
 *
 * This file is what remains of a suite that proved a shared child acquisition was hoisted above the
 * count groups. That mechanism was measured 316ms slower and retired. The refusal gate is not about
 * the mechanism and outlives it.
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

const seedInput = (supabase: never) => ({
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
});

/**
 * A lens that DECLARES child grain while filtering on a FAMILY-grain stage contradicts itself, and
 * `resolveLensRowGrain` refuses it. The refusal must survive the hoist: a refused lens is UNKNOWN,
 * it is not swept into the shared acquisition, and it never falls through to a lane population
 * count — pill 1 over zero rows is the shape of the original defect.
 */
describe("a self-contradicting lens is refused", () => {
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

    it("it resolves UNKNOWN through the seed — never a number", async () => {
        const f = fixtureSupabase(DATA);
        const seed = await resolveWorkViewTotalsSeed({
            ...seedInput(f.supabase),
            departmentMetadata: contradictory(),
            countTargets: [
                ...(seedInput(f.supabase).countTargets as unknown as Rec[]),
                { workViewId: "cv-bad", hostWorkUnitId: HOSTS[0], baseQueueKey: "q-a" },
            ] as never,
        } as never);
        if (seed.status !== "resolved") throw new Error("seed unavailable");
        const bad = (seed as { totals: { workViewId: string; count: number | null; known: boolean }[] })
            .totals.find((t) => t.workViewId === "cv-bad");
        expect(bad).toBeDefined();
        expect(bad!.known).toBe(false);
        expect(bad!.count).toBeNull();
    });
});

