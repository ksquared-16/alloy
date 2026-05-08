import { describe, expect, it } from "vitest";
import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import { extractPipelineExecutionLanes } from "@/lib/workspace/extractPipelineExecutionLanes";

describe("extractPipelineExecutionLanes", () => {
    it("orders lanes by pipeline section queue_keys and resolves labels from queues[]", () => {
        const lanes = extractPipelineExecutionLanes(CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1);
        expect(lanes.map((l) => l.key)).toEqual([
            "new_inquiry",
            "contact_attempted",
            "tour_scheduled",
            "tour_completed_follow_up",
            "enrolling",
            "waitlisted",
            "enrolled",
            "lost",
        ]);
        expect(lanes[0]?.label).toBe("New Inquiry");
        expect(lanes[0]?.icon).toBe("user-plus");
    });
});
