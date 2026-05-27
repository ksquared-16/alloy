import { describe, expect, it } from "vitest";

import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import {
    ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE,
    ENROLLMENT_PIPELINE_V2_QUEUE_ALIASES,
    RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
} from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { resolveQueueKeyFromDefinition } from "@/lib/config/queueDefinitionV2Runtime";

describe("enrollmentPipelineQueueDefinitionV2", () => {
    it("loads v2 bundle with version 2 metadata and v1 execution def", () => {
        expect(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2.version).toBe(2);
        expect(ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.isV2).toBe(true);
        expect(ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def.version).toBe(1);
    });

    it("preserves v1-equivalent execution filters via filters_compat_v1", () => {
        const v1Keys = CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1.queues.map((q) => q.key);
        const def = ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def;

        const v1NewInquiry = CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1.queues.find(
            (q) => q.key === "new_inquiry"
        )!.filters;
        expect(def.queues.find((q) => q.key === "new_leads")?.filters).toEqual(v1NewInquiry);

        const v1Waitlisted = CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1.queues.find(
            (q) => q.key === "waitlisted"
        )!.filters;
        expect(def.queues.find((q) => q.key === "waitlist")?.filters).toEqual(v1Waitlisted);

        const v1Enrolled = CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1.queues.find(
            (q) => q.key === "enrolled"
        )!.filters;
        expect(def.queues.find((q) => q.key === "enrollment_completed")?.filters).toEqual(v1Enrolled);

        expect(v1Keys).not.toContain("new_leads");
    });

    it("registers expected legacy alias map", () => {
        const queues = ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.queues;
        for (const [alias, canonical] of Object.entries(ENROLLMENT_PIPELINE_V2_QUEUE_ALIASES)) {
            const resolution = resolveQueueKeyFromDefinition(alias, queues);
            expect(resolution.resolvedKey).toBe(canonical);
            expect(["alias", "exact"]).toContain(resolution.matchedBy);
        }
    });

    it("marks waitlist and enrollment_offers with non-case grain metadata", () => {
        const waitlist = ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.queues.find(
            (q) => q.key === "waitlist"
        );
        expect(waitlist?.grain).toBe("candidate");

        const offers = ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.queues.find(
            (q) => q.key === "enrollment_offers"
        );
        expect(offers?.grain).toBe("child");
    });
});
