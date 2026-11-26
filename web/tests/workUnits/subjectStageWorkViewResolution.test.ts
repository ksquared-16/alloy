import { describe, expect, it } from "vitest";

import {
    fetchStageWorkViewTargets,
    stageWorkViewCacheKey,
} from "@/lib/workUnits/hostWorkUnitResolver";
import { primaryQueueKeyForLifecycleStage } from "@/lib/lifecycle/lifecycleStageWorkUnit";

/**
 * PARTICIPANT POSITION BEATS HOUSEHOLD POSITION.
 *
 * The defect these pin: searching a WAITLISTED child correctly displayed "Enrollment — Waitlist" and
 * then committed `lifecycle_wu_lead` — the FAMILY case's stage unit. The label came from the child's
 * own `process_instances.stage_key`; the destination came from `opportunities.work_unit_id`. Two
 * grains, and only the family one reached attention, so the child opened a queue that does not
 * contain them and nothing composed.
 *
 * Siblings make it unarguable: two children of one household routinely sit in different stages, so no
 * single family-level answer can be right for both.
 */

const ORG = "org-1";
const CASE = "opp-kurzman";
const DEPT = "dept-enrollment";
const HOST_UNIT = "wu-lifecycle-lead";

/** A department whose published process binds one Work View per stage, by CONFIGURED KEY. */
function departmentMetadata(views: Array<Record<string, unknown>>, stageKeys: string[]) {
    return {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "p1",
            processes: [
                {
                    id: "p1",
                    key: "enrollment",
                    name: "Enrollment",
                    is_active: true,
                    work_views_v1: views,
                    stages: stageKeys.map((key, i) => ({
                        id: `s-${key}`,
                        key,
                        label: key,
                        sort_order: i,
                        is_active: true,
                        grain: "child",
                    })),
                },
            ],
        },
    };
}

/**
 * A stage-bound view MUST carry `filters_v1`.
 *
 * `normalizeCatchAllWorkViewCompatBinding` strips `compat_queue_key` from any FILTERLESS view: a view
 * with no conditions is the process-wide catch-all ("All"), and binding it to one stage's lane would
 * make it report that stage's rows instead of every row. So "has a stage lane" and "is a catch-all"
 * are mutually exclusive by construction — which is exactly why the catch-all below must never win a
 * stage lookup.
 */
const stageBound = (id: string, label: string, stage: string, order: number) => ({
    id,
    label,
    compat_queue_key: primaryQueueKeyForLifecycleStage(stage),
    filters_v1: [{ field_key: "stage_key", operator: "is_any_of", value: [stage] }],
    display_order: order,
    visible_in_runtime: true,
});

const VIEWS = [
    stageBound("new_leads", "New", "lead", 1),
    stageBound("waitlist", "Waitlist", "waitlist", 2),
    stageBound("tours", "Tours", "tour", 3),
    // The process-wide catch-all. Holds no stage, and must not be returned for one.
    { id: "all_work", label: "All", display_order: 4, visible_in_runtime: true },
];

const STAGES = ["lead", "waitlist", "tour"];

/** Minimal Supabase double — records nothing beyond what the resolver actually reads. */
function supabaseDouble(opts: { metadata?: unknown; departmentId?: string | null } = {}) {
    const metadata = opts.metadata ?? departmentMetadata(VIEWS, STAGES);
    const departmentId = opts.departmentId === undefined ? DEPT : opts.departmentId;
    return {
        from(table: string) {
            const rows =
                table === "opportunities"
                    ? [{ id: CASE, work_unit_id: HOST_UNIT }]
                    : table === "work_units"
                      ? [{ id: HOST_UNIT, department_id: departmentId }]
                      : [{ id: DEPT, metadata }];
            const builder = {
                select: () => builder,
                eq: () => builder,
                in: () => Promise.resolve({ data: rows, error: null }),
            };
            return builder;
        },
    } as never;
}

describe("a subject's stage resolves its own configured Work View", () => {
    it("a waitlisted child resolves the Waitlist view, not the family's Lead unit", async () => {
        const targets = await fetchStageWorkViewTargets(supabaseDouble(), ORG, [
            { opportunityId: CASE, stageKey: "waitlist" },
        ]);
        expect(targets.get(stageWorkViewCacheKey(CASE, "waitlist"))).toBe("waitlist");
    });

    it("SIBLINGS in different stages resolve independently from the same case", async () => {
        // The whole point: one household, one case, two children, two destinations.
        const targets = await fetchStageWorkViewTargets(supabaseDouble(), ORG, [
            { opportunityId: CASE, stageKey: "waitlist" },
            { opportunityId: CASE, stageKey: "tour" },
        ]);
        expect(targets.get(stageWorkViewCacheKey(CASE, "waitlist"))).toBe("waitlist");
        expect(targets.get(stageWorkViewCacheKey(CASE, "tour"))).toBe("tours");
    });

    it("binds by CONFIGURED KEY, so a renamed view still resolves", async () => {
        // Labels are tenant-configurable. Matching on "Waitlist" would break the moment a tenant
        // renamed it, and would silently resolve the wrong view in a tenant that reused the word.
        const renamed = VIEWS.map((v) =>
            v.id === "waitlist" ? { ...v, label: "Holding Pool" } : v,
        );
        const targets = await fetchStageWorkViewTargets(
            supabaseDouble({ metadata: departmentMetadata(renamed, STAGES) }),
            ORG,
            [{ opportunityId: CASE, stageKey: "waitlist" }],
        );
        expect(targets.get(stageWorkViewCacheKey(CASE, "waitlist"))).toBe("waitlist");
    });

    it("REORDERING views does not change which view holds a stage", async () => {
        const reordered = [...VIEWS].reverse().map((v, i) => ({ ...v, display_order: i + 1 }));
        const targets = await fetchStageWorkViewTargets(
            supabaseDouble({ metadata: departmentMetadata(reordered, STAGES) }),
            ORG,
            [{ opportunityId: CASE, stageKey: "waitlist" }],
        );
        expect(targets.get(stageWorkViewCacheKey(CASE, "waitlist"))).toBe("waitlist");
    });

    it("a stage with NO configured view yields nothing — the caller falls back, never invents", async () => {
        const targets = await fetchStageWorkViewTargets(supabaseDouble(), ORG, [
            { opportunityId: CASE, stageKey: "enrolled" },
        ]);
        expect(targets.size).toBe(0);
    });

    it("the FILTERLESS CATCH-ALL can never satisfy a stage lookup", async () => {
        // Stated outright rather than left implicit. `all_work` is the process-wide catch-all: it is
        // visible, it is a perfectly good destination for "show me everything", and it is the view a
        // loose lookup would fall into for ANY stage — which would send every participant to the same
        // place and make the whole participant-grain fix look like it worked.
        //
        // It cannot win, by construction: `normalizeCatchAllWorkViewCompatBinding` strips
        // `compat_queue_key` from any filterless view, so a catch-all has no lane to match. This
        // asserts the consequence, so a future change that re-binds catch-alls fails here.
        const onlyCatchAll = [{ id: "all_work", label: "All", display_order: 1, visible_in_runtime: true }];
        const targets = await fetchStageWorkViewTargets(
            supabaseDouble({ metadata: departmentMetadata(onlyCatchAll, STAGES) }),
            ORG,
            [{ opportunityId: CASE, stageKey: "waitlist" }],
        );
        expect(targets.size, "the catch-all answered a stage-specific lookup").toBe(0);

        // And with real stage-bound views present, the stage-bound one wins — the catch-all is never
        // preferred just because it is also visible.
        const withBoth = await fetchStageWorkViewTargets(supabaseDouble(), ORG, [
            { opportunityId: CASE, stageKey: "waitlist" },
        ]);
        expect(withBoth.get(stageWorkViewCacheKey(CASE, "waitlist"))).toBe("waitlist");
    });

    it("a hidden view is not a destination", async () => {
        const hidden = VIEWS.map((v) =>
            v.id === "waitlist" ? { ...v, visible_in_runtime: false } : v,
        );
        const targets = await fetchStageWorkViewTargets(
            supabaseDouble({ metadata: departmentMetadata(hidden, STAGES) }),
            ORG,
            [{ opportunityId: CASE, stageKey: "waitlist" }],
        );
        expect(targets.size).toBe(0);
    });

    it("a case whose unit has no department resolves nothing rather than guessing", async () => {
        const targets = await fetchStageWorkViewTargets(
            supabaseDouble({ departmentId: null }),
            ORG,
            [{ opportunityId: CASE, stageKey: "waitlist" }],
        );
        expect(targets.size).toBe(0);
    });

    it("no childcare-specific branching: the mapping is stage key → configured queue key", () => {
        // The binding rule itself, stated once. Nothing here knows what "waitlist" means.
        expect(primaryQueueKeyForLifecycleStage("waitlist")).toBe("lifecycle_waitlist");
        expect(primaryQueueKeyForLifecycleStage("some_future_stage")).toBe("lifecycle_some_future_stage");
    });
});
