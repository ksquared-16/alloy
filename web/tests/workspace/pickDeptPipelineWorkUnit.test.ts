import { describe, expect, it } from "vitest";
import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { pickDeptPipelineWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";

describe("pickDeptPipelineWorkUnit", () => {
    it("picks enrollment_pipeline with v2 domain_with_attention queue_definition", () => {
        const picked = pickDeptPipelineWorkUnit(
            [
                {
                    id: "wu-enroll",
                    key: "enrollment_pipeline",
                    department_id: "dept-1",
                    queue_definition: ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.raw,
                },
            ],
            "dept-1"
        );
        expect(picked?.id).toBe("wu-enroll");
        expect(picked?.key).toBe("enrollment_pipeline");
    });

    it("skips an INACTIVE pipeline unit (the queue route 404s inactive units — no stale request)", () => {
        // Browser-found: a deprecated `enrollment_pipeline` unit left is_active=false still carried a
        // `pipeline_total` lane; picking it produced a queue 404. It must be skipped.
        const picked = pickDeptPipelineWorkUnit(
            [
                {
                    id: "wu-inactive",
                    key: "enrollment_pipeline",
                    department_id: "dept-1",
                    is_active: false,
                    queue_definition: ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.raw,
                },
            ],
            "dept-1"
        );
        expect(picked).toBeNull();
    });

    it("prefers an ACTIVE pipeline unit over an inactive one of the same key", () => {
        const picked = pickDeptPipelineWorkUnit(
            [
                {
                    id: "wu-inactive",
                    key: "enrollment_pipeline",
                    department_id: "dept-1",
                    is_active: false,
                    queue_definition: ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.raw,
                },
                {
                    id: "wu-active",
                    key: "enrollment_pipeline",
                    department_id: "dept-1",
                    is_active: true,
                    queue_definition: ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.raw,
                },
            ],
            "dept-1"
        );
        expect(picked?.id).toBe("wu-active");
    });

    it("rows without is_active are unaffected (treated as active)", () => {
        const picked = pickDeptPipelineWorkUnit(
            [
                {
                    id: "wu-enroll",
                    key: "enrollment_pipeline",
                    department_id: "dept-1",
                    queue_definition: ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.raw,
                },
            ],
            "dept-1"
        );
        expect(picked?.id).toBe("wu-enroll");
    });

    it("returns null when queue_definition is not a pipeline layout", () => {
        const picked = pickDeptPipelineWorkUnit(
            [
                {
                    id: "wu-1",
                    key: "custom",
                    department_id: "dept-1",
                    queue_definition: { version: 1, entity_type: "opportunity", queues: [], ui: { layout: "single_section" } },
                },
            ],
            "dept-1"
        );
        expect(picked).toBeNull();
    });
});
