import { describe, expect, it } from "vitest";
import { resolveOpportunityDrawerQueueDefinition } from "@/lib/admin/drawer/resolveOpportunityDrawerQueueDefinition";
import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

describe("resolveOpportunityDrawerQueueDefinition", () => {
    it("returns work-unit definition when present", () => {
        const def = ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def;
        expect(resolveOpportunityDrawerQueueDefinition(def)).toBe(def);
    });

    it("falls back to canonical enrollment pipeline when allowed", () => {
        expect(
            resolveOpportunityDrawerQueueDefinition(null, { allowEnrollmentFallback: true })
        ).toBe(ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def);
    });

    it("returns null without fallback when work unit missing", () => {
        expect(resolveOpportunityDrawerQueueDefinition(null)).toBeNull();
    });
});
