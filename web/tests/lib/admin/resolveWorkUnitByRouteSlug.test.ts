import { describe, expect, it } from "vitest";
import { resolveWorkUnitByRouteSlug } from "@/lib/admin/resolveWorkUnitByRouteSlug";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

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

    it("prefers enrollment_pipeline over lifecycle_wu_lead when both present for new-leads slug", () => {
        // fetchWorkUnitsForSlugResolution strategy 2 now returns both; resolver must prefer pipeline.
        const result = resolveWorkUnitByRouteSlug({
            slug: "new-leads",
            workUnits: [
                {
                    id: "wu-lead",
                    department_id: "dept-enroll",
                    key: "lifecycle_wu_lead",
                    name: "New Leads Stage",
                    queue_definition: {},
                },
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
            // findQueueLaneOwner finds new_leads in enrollment_pipeline first
            expect(result.match.kind).toBe("queue_lane_key");
            expect(result.match.workUnitKey).toBe("enrollment_pipeline");
            expect(result.match.initialQueueKey).toBe("new_leads");
        }
    });

    it("/workspace/work-unit/active-pipeline resolves to Enrollment parent runtime", () => {
        const result = resolveWorkUnitByRouteSlug({
            slug: "active-pipeline",
            workUnits: [
                {
                    id: "wu-pipeline",
                    department_id: "dept-enroll",
                    key: "enrollment_pipeline",
                    name: "Enrollment Pipeline",
                    queue_definition: {
                        version: 2,
                        entity_type: "opportunity",
                        ui: {
                            layout: "domain_with_attention",
                            sections: [
                                { key: "active_pipeline", label: "Active Pipeline", queue_keys: ["active_pipeline"] },
                                { key: "waitlist", label: "Waitlist", queue_keys: ["waitlist"] },
                            ],
                        },
                        queues: [
                            { key: "active_pipeline", label: "Active Pipeline", filters: [], sort: [] },
                            { key: "waitlist", label: "Waitlist", filters: [], sort: [] },
                        ],
                    },
                },
            ],
            departments: [{ id: "dept-enroll", key: "enrollment", name: "Enrollment" }],
        });
        expect(result.status).toBe("resolved");
        if (result.status === "resolved") {
            expect(result.match.workUnitKey).toBe("enrollment_pipeline");
            expect(result.match.initialQueueKey).toBe("active_pipeline");
            expect(result.match.routeSlug).toBe("active-pipeline");
        }
    });
});
