import { describe, expect, it } from "vitest";
import { resolveWorkUnitByRouteSlug } from "@/lib/admin/resolveWorkUnitByRouteSlug";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

/** Department metadata with configured process-level Work Views (`work_views_v1`). */
function deptMetadataWithWorkViews(workViews: Array<Record<string, unknown>>): unknown {
    return {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "proc-1",
            processes: [
                {
                    id: "proc-1",
                    key: "lead_management",
                    name: "Lead Management",
                    is_active: true,
                    stages: [],
                    work_views_v1: workViews,
                },
            ],
        },
    };
}

const PIPELINE_WU = {
    id: "wu-pipeline",
    department_id: "dept-enroll",
    key: "enrollment_pipeline",
    name: "Enrollment Pipeline",
    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
};

describe("resolveWorkUnitByRouteSlug", () => {
    it("resolves work unit by key slug", () => {
        const result = resolveWorkUnitByRouteSlug({
            slug: "unassigned",
            workUnits: [
                {
                    id: "wu-1",
                    department_id: "dept-1",
                    key: "unassigned",
                    name: "Unassigned",
                    queue_definition: {},
                },
            ],
        });
        expect(result.status).toBe("resolved");
        if (result.status === "resolved") {
            expect(result.match.kind).toBe("work_unit_key");
            expect(result.match.workUnitId).toBe("wu-1");
            expect(result.match.initialQueueKey).toBeNull();
        }
    });

    it("resolves pipeline queue lane slug new-leads", () => {
        const result = resolveWorkUnitByRouteSlug({
            slug: "new-leads",
            workUnits: [
                {
                    id: "wu-pipeline",
                    department_id: "dept-enroll",
                    key: "enrollment_pipeline",
                    name: "Enrollment Pipeline",
                    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
                },
            ],
            departments: [{ id: "dept-enroll", key: "enrollment", name: "Enrollment" }],
        });
        expect(result.status).toBe("resolved");
        if (result.status === "resolved") {
            expect(result.match.kind).toBe("queue_lane_key");
            expect(result.match.workUnitId).toBe("wu-pipeline");
            expect(result.match.initialQueueKey).toBe("new_leads");
            expect(result.match.routeSlug).toBe("new-leads");
        }
    });

    it("returns ambiguous when duplicate keys remain after disambiguation", () => {
        const result = resolveWorkUnitByRouteSlug({
            slug: "shared_key",
            workUnits: [
                {
                    id: "wu-a",
                    department_id: "dept-a",
                    key: "shared_key",
                    name: "A",
                    queue_definition: {},
                    sort_order: 0,
                },
                {
                    id: "wu-b",
                    department_id: "dept-b",
                    key: "shared_key",
                    name: "B",
                    queue_definition: {},
                    sort_order: 0,
                },
            ],
            departments: [
                { id: "dept-a", key: "ops", name: "Operations" },
                { id: "dept-b", key: "ops", name: "Operations B" },
            ],
        });
        expect(result.status).toBe("ambiguous");
    });

    it("resolves a work-view slug to the department's pipeline host with initialWorkViewId", () => {
        const result = resolveWorkUnitByRouteSlug({
            slug: "active-pipeline",
            workUnits: [PIPELINE_WU],
            departments: [
                {
                    id: "dept-enroll",
                    key: "enrollment",
                    name: "Enrollment",
                    metadata: deptMetadataWithWorkViews([
                        { id: "new_leads", label: "New Leads", compat_queue_key: "new_leads", display_order: 1 },
                        { id: "active_pipeline", label: "Active Pipeline", display_order: 2 },
                    ]),
                },
            ],
        });
        expect(result.status).toBe("resolved");
        if (result.status === "resolved") {
            expect(result.match.kind).toBe("work_view");
            expect(result.match.workUnitId).toBe("wu-pipeline");
            expect(result.match.initialWorkViewId).toBe("active_pipeline");
            expect(result.match.initialQueueKey).toBeNull();
            expect(result.match.routeSlug).toBe("active-pipeline");
        }
    });

    it("resolves a lane-bound work-view slug to the lane owner with the view selected", () => {
        const result = resolveWorkUnitByRouteSlug({
            slug: "fresh-prospects",
            workUnits: [PIPELINE_WU],
            departments: [
                {
                    id: "dept-enroll",
                    key: "enrollment",
                    name: "Enrollment",
                    metadata: deptMetadataWithWorkViews([
                        {
                            id: "fresh_prospects",
                            label: "Fresh Prospects",
                            compat_queue_key: "new_leads",
                            display_order: 1,
                        },
                    ]),
                },
            ],
        });
        expect(result.status).toBe("resolved");
        if (result.status === "resolved") {
            expect(result.match.kind).toBe("work_view");
            expect(result.match.workUnitId).toBe("wu-pipeline");
            expect(result.match.initialWorkViewId).toBe("fresh_prospects");
            expect(result.match.initialQueueKey).toBeNull();
        }
    });

    it("precedence: work_unit_key outranks a work view with the same slug", () => {
        const result = resolveWorkUnitByRouteSlug({
            slug: "active-pipeline",
            workUnits: [
                PIPELINE_WU,
                {
                    id: "wu-direct",
                    department_id: "dept-enroll",
                    key: "active_pipeline",
                    name: "Active Pipeline Unit",
                    queue_definition: {},
                },
            ],
            departments: [
                {
                    id: "dept-enroll",
                    key: "enrollment",
                    name: "Enrollment",
                    metadata: deptMetadataWithWorkViews([
                        { id: "active_pipeline", label: "Active Pipeline", display_order: 1 },
                    ]),
                },
            ],
        });
        expect(result.status).toBe("resolved");
        if (result.status === "resolved") {
            expect(result.match.kind).toBe("work_unit_key");
            expect(result.match.workUnitId).toBe("wu-direct");
            expect(result.match.initialWorkViewId).toBeNull();
        }
    });

    it("precedence: a configured work view outranks a colliding queue-lane key", () => {
        // `new_leads` is BOTH a configured view id and a pipeline lane key — the configured
        // view must win so the route selects the view (label + predicates), not the raw lane.
        const result = resolveWorkUnitByRouteSlug({
            slug: "new-leads",
            workUnits: [PIPELINE_WU],
            departments: [
                {
                    id: "dept-enroll",
                    key: "enrollment",
                    name: "Enrollment",
                    metadata: deptMetadataWithWorkViews([
                        { id: "new_leads", label: "New Leads", compat_queue_key: "new_leads", display_order: 1 },
                    ]),
                },
            ],
        });
        expect(result.status).toBe("resolved");
        if (result.status === "resolved") {
            expect(result.match.kind).toBe("work_view");
            expect(result.match.workUnitId).toBe("wu-pipeline");
            expect(result.match.initialWorkViewId).toBe("new_leads");
            expect(result.match.initialQueueKey).toBeNull();
        }
    });

    it("unknown slug is still not_found when work views are configured", () => {
        const result = resolveWorkUnitByRouteSlug({
            slug: "does-not-exist",
            workUnits: [PIPELINE_WU],
            departments: [
                {
                    id: "dept-enroll",
                    key: "enrollment",
                    name: "Enrollment",
                    metadata: deptMetadataWithWorkViews([
                        { id: "active_pipeline", label: "Active Pipeline", display_order: 1 },
                    ]),
                },
            ],
        });
        expect(result.status).toBe("not_found");
    });

    it("resolves builder-owned lifecycle stage work unit from pipeline queue slug new-leads", () => {
        const result = resolveWorkUnitByRouteSlug({
            slug: "new-leads",
            workUnits: [
                {
                    id: "wu-lead",
                    department_id: "dept-1",
                    key: "lifecycle_wu_lead",
                    name: "New Leads",
                    queue_definition: {},
                },
            ],
            departments: [{ id: "dept-1", key: "lead_management", name: "Lead Management" }],
        });
        expect(result.status).toBe("resolved");
        if (result.status === "resolved") {
            expect(result.match.kind).toBe("work_unit_key");
            expect(result.match.workUnitId).toBe("wu-lead");
            expect(result.match.workUnitKey).toBe("lifecycle_wu_lead");
            expect(result.match.routeSlug).toBe("new-leads");
            expect(result.match.initialQueueKey).toBeNull();
        }
    });
});
