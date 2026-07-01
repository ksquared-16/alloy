import { describe, expect, it } from "vitest";
import { resolveLifecycleRollupsFromDepartmentSummaries } from "@/lib/admin/resolveOperatorLifecycleLandingRollups";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

describe("resolveLifecycleRollupsFromDepartmentSummaries", () => {
    it("derives active and needs-attention counts from pipeline summaries", () => {
        const rollups = resolveLifecycleRollupsFromDepartmentSummaries({
            departmentId: "dept-1",
            workUnits: [
                {
                    id: "wu-pipeline",
                    department_id: "dept-1",
                    key: "enrollment_pipeline",
                    name: "Enrollment Pipeline",
                    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
                },
            ],
            summaries: [
                {
                    id: "wu-pipeline",
                    work_unit_scope_total: 128,
                    queues: [{ key: "new_leads", count: 42, counts_deferred: false }],
                },
                {
                    id: "wu-na",
                    queues: [{ key: "needs_attention", count: 7, counts_deferred: false }],
                },
            ],
        });

        expect(rollups.activeRecordCount).toBe(128);
        expect(rollups.needsAttentionCount).toBe(7);
    });

    it("returns null metrics when summaries are unavailable", () => {
        const rollups = resolveLifecycleRollupsFromDepartmentSummaries({
            departmentId: "dept-1",
            workUnits: [
                {
                    id: "wu-pipeline",
                    department_id: "dept-1",
                    key: "enrollment_pipeline",
                    name: "Enrollment Pipeline",
                    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
                },
            ],
            summaries: [],
        });

        expect(rollups.activeRecordCount).toBeNull();
        expect(rollups.needsAttentionCount).toBeNull();
    });
});
