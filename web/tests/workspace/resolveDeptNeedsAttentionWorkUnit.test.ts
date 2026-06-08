import { describe, expect, it } from "vitest";
import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import {
    resolveDeptNeedsAttentionWorkUnit,
    workUnitDefinesNeedsAttentionQueue,
} from "@/lib/workspace/resolveDeptNeedsAttentionWorkUnit";

describe("resolveDeptNeedsAttentionWorkUnit", () => {
    it("detects needs_attention queue on canonical enrollment_pipeline", () => {
        expect(workUnitDefinesNeedsAttentionQueue(CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1)).toBe(true);
    });

    it("prefers standalone needs_attention work unit when present", () => {
        const r = resolveDeptNeedsAttentionWorkUnit(
            [
                { id: "en-1", key: "enrollment_pipeline", department_id: "dept-1", queue_definition: CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 },
                { id: "na-1", key: "needs_attention", department_id: "dept-1" },
            ],
            "dept-1"
        );
        expect(r?.id).toBe("na-1");
        expect(r?.mode).toBe("standalone_work_unit");
    });

    it("resolves enrollment_pipeline when needs_attention is a queue not a work unit", () => {
        const r = resolveDeptNeedsAttentionWorkUnit(
            [
                {
                    id: "en-1",
                    key: "enrollment_pipeline",
                    department_id: "dept-1",
                    queue_definition: CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1,
                    metadata: { opportunity_attention_rules: { needs_attention_buckets: [] } },
                },
            ],
            "dept-1"
        );
        expect(r?.id).toBe("en-1");
        expect(r?.mode).toBe("pipeline_work_unit");
    });

    it("accepts explicit enrollment_pipeline work_unit_id", () => {
        const r = resolveDeptNeedsAttentionWorkUnit(
            [
                {
                    id: "en-1",
                    key: "enrollment_pipeline",
                    department_id: "dept-1",
                    queue_definition: CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1,
                },
            ],
            "dept-1",
            "en-1"
        );
        expect(r?.id).toBe("en-1");
        expect(r?.mode).toBe("pipeline_work_unit");
    });

    it("returns null when no standalone WU and no pipeline queue", () => {
        const r = resolveDeptNeedsAttentionWorkUnit(
            [{ id: "crm-1", key: "crm_pipeline", department_id: "dept-1", queue_definition: { version: 1, entity_type: "opportunity", queues: [] } }],
            "dept-1"
        );
        expect(r).toBeNull();
    });
});
