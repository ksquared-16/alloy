/**
 * Semantics mirror `PATCH /api/admin/work-units/[id]` when `queue_definition` is present
 * (implementation delegates to `prepareQueueDefinitionPatch`).
 */
import { describe, expect, it } from "vitest";
import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import { prepareQueueDefinitionPatch } from "@/lib/agent/v0/applyWorkUnitQueueDefinitionUpdate";

const validV1 = {
    version: 1,
    entity_type: "job" as const,
    sort: { by: "updated_at" as const, direction: "desc" as const },
    limit: 25,
};

describe("PATCH work-units — queue_definition", () => {
    it("success when expected_queue_definition_version matches stored (empty → v1)", () => {
        const r = prepareQueueDefinitionPatch({}, validV1, 0);
        expect(r.ok).toBe(true);
    });

    it("409 stale when expected_queue_definition_version does not match stored", () => {
        const r = prepareQueueDefinitionPatch(
            { version: 1, entity_type: "job", sort: { by: "updated_at", direction: "desc" }, limit: 10 },
            validV1,
            0
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.status).toBe(409);
    });

    it("accepts workspace queue_definition with queues[] (enrollment pipeline)", () => {
        const r = prepareQueueDefinitionPatch({}, CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1, 0);
        expect(r.ok).toBe(true);
    });
});
