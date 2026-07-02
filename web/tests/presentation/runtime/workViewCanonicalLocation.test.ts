import { describe, expect, it } from "vitest";
import { resolveWorkUnitByRouteSlug } from "@/lib/admin/resolveWorkUnitByRouteSlug";
import { workUnitKeyToRouteSlug } from "@/lib/admin/workUnitRouteSlug";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    hostWorkUnitForConfiguredWorkView,
    resolveWorkViewCanonicalLocation,
} from "@/lib/workspace/resolveWorkViewCanonicalLocation";
import {
    queueRowsRouteForView,
    workViewTotalKey,
} from "@/lib/presentation/runtime/useWorkViewTotals";

/**
 * CANONICAL-LOCATION CONTRACT (product rule): a Work View's count/rows are defined ONCE,
 * on its canonical location — host work unit + base lane. The Workspace tile count, the
 * Work Unit pill count, and the rendered row count all read that one definition, and the
 * view's URL resolves to that same host — so the three numbers agree by construction.
 */

const DEPT_ID = "dept-enroll";

const PIPELINE_WU = {
    id: "wu-pipeline",
    department_id: DEPT_ID,
    key: "enrollment_pipeline",
    name: "Enrollment Pipeline",
    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
};

const OTHER_DEPT_WU = {
    id: "wu-other-dept",
    department_id: "dept-other",
    key: "enrollment_pipeline",
    name: "Other Dept Pipeline",
    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
};

const INACTIVE_WU = {
    id: "wu-inactive",
    department_id: DEPT_ID,
    key: "enrollment_pipeline",
    name: "Retired Pipeline",
    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
    is_active: false,
};

const DEPT_WORK_UNITS = [OTHER_DEPT_WU, INACTIVE_WU, PIPELINE_WU];

function deptMetadataWithWorkViews(workViews: Array<Record<string, unknown>>): unknown {
    return {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "proc-1",
            processes: [
                {
                    id: "proc-1",
                    key: "enrollment",
                    name: "Enrollment",
                    is_active: true,
                    stages: [],
                    work_views_v1: workViews,
                },
            ],
        },
    };
}

describe("resolveWorkViewCanonicalLocation", () => {
    it("lane-bound view: host = compat lane owner, base = the compat lane", () => {
        const view = { id: "fresh_prospects", label: "Fresh Prospects", compat_queue_key: "new_leads" };
        const location = resolveWorkViewCanonicalLocation(view, DEPT_WORK_UNITS, DEPT_ID);
        expect(location).toEqual({
            workUnitId: "wu-pipeline",
            baseQueueKey: "new_leads",
            routeKey: "fresh_prospects",
        });
    });

    it("predicate-only view: host = dept pipeline unit, base = the ALL-RECORDS lane", () => {
        const view = { id: "momentum", label: "Momentum" };
        const location = resolveWorkViewCanonicalLocation(view, DEPT_WORK_UNITS, DEPT_ID);
        expect(location).toEqual({
            workUnitId: "wu-pipeline",
            baseQueueKey: "pipeline_total",
            routeKey: "momentum",
        });
    });

    it("compat lane absent from the host's queue_definition: base falls back to all-records", () => {
        const view = { id: "ghost", label: "Ghost Lane View", compat_queue_key: "sibling_only_lane" };
        const location = resolveWorkViewCanonicalLocation(view, DEPT_WORK_UNITS, DEPT_ID);
        expect(location).toEqual({
            workUnitId: "wu-pipeline",
            baseQueueKey: "pipeline_total",
            routeKey: "ghost_lane_view",
        });
    });

    it("route key derives from the configured LABEL, never the fossil view id", () => {
        const view = { id: "new_work_view_2", label: "Hot List" };
        const location = resolveWorkViewCanonicalLocation(view, DEPT_WORK_UNITS, DEPT_ID);
        expect(location?.routeKey).toBe("hot_list");
    });

    it("other-department and inactive units never host a view", () => {
        const view = { id: "fresh_prospects", label: "Fresh Prospects", compat_queue_key: "new_leads" };
        const host = hostWorkUnitForConfiguredWorkView(view, DEPT_WORK_UNITS, DEPT_ID);
        expect(host?.id).toBe("wu-pipeline");

        // Only foreign/inactive candidates → no canonical location at all.
        expect(
            resolveWorkViewCanonicalLocation(view, [OTHER_DEPT_WU, INACTIVE_WU], DEPT_ID),
        ).toBeNull();
    });

    it("no work units at all → null (no defined count anywhere, so no badge)", () => {
        expect(resolveWorkViewCanonicalLocation({ id: "v", label: "V" }, [], DEPT_ID)).toBeNull();
    });
});

describe("canonical location agrees with the by-slug URL resolver", () => {
    // The invariant that keeps counts and navigation converged: the host the canonical
    // location resolves is the host the view's URL lands on (both call the shared
    // hostWorkUnitForConfiguredWorkView).
    const views = [
        { id: "fresh_prospects", label: "Fresh Prospects", compat_queue_key: "new_leads", display_order: 1 },
        { id: "momentum", label: "Momentum", display_order: 2 },
        { id: "new_work_view_2", label: "Hot List", display_order: 3 },
    ];
    const departments = [
        { id: DEPT_ID, key: "enrollment", name: "Enrollment", metadata: deptMetadataWithWorkViews(views) },
    ];

    it.each(views.map((view) => [view.label, view] as const))(
        "view %s: slug resolves to the canonical host with the view selected",
        (_label, view) => {
            const location = resolveWorkViewCanonicalLocation(view, [PIPELINE_WU], DEPT_ID);
            expect(location).not.toBeNull();

            const slug = workUnitKeyToRouteSlug(location!.routeKey!);
            const resolved = resolveWorkUnitByRouteSlug({
                slug,
                workUnits: [PIPELINE_WU],
                departments,
            });
            expect(resolved.status).toBe("resolved");
            if (resolved.status === "resolved") {
                expect(resolved.match.kind).toBe("work_view");
                expect(resolved.match.workUnitId).toBe(location!.workUnitId);
                expect(resolved.match.initialWorkViewId).toBe(view.id);
            }
        },
    );
});

describe("useWorkViewTotals count source (rows API, exact)", () => {
    it("builds THE count route: rows endpoint, limit=1, count_mode=exact, work_view_id", () => {
        const route = queueRowsRouteForView({
            workUnitId: "wu-pipeline",
            baseQueueKey: "new_leads",
            workViewId: "fresh_prospects",
            limit: 1,
            selectedSiteId: null,
        });
        expect(route).toBe(
            "/api/admin/queues/wu-pipeline/new_leads?limit=1&offset=0&count_mode=exact&work_view_id=fresh_prospects",
        );
        // Path routing + rows evaluation only — never a lane-summary route, never `queue=`.
        expect(route).not.toContain("queue=");
        expect(route).not.toContain("summary");
    });

    it("totals keys are host-scoped so same view ids across departments cannot collide", () => {
        expect(workViewTotalKey("wu-a", "all_leads")).not.toBe(workViewTotalKey("wu-b", "all_leads"));
        expect(workViewTotalKey("wu-a", "all_leads")).toBe(workViewTotalKey("wu-a", "all_leads"));
    });
});
