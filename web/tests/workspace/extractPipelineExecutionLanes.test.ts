import { describe, expect, it } from "vitest";
import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    extractPipelineExecutionLanes,
    resolvePipelineExecPanelTitle,
} from "@/lib/workspace/extractPipelineExecutionLanes";

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

    it("flattens v2 domain sections into visible throughput lanes (Card 14A — hides forms_documents and tours_follow_up from ui.sections)", () => {
        const lanes = extractPipelineExecutionLanes(ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def);
        expect(lanes.map((l) => l.key)).toEqual([
            "new_leads",
            "tours",
            "communications_followup",
            "waitlist",
            "enrollment_offers",
            "enrollment_completed",
        ]);
        expect(lanes.find((l) => l.key === "needs_attention")).toBeUndefined();
        expect(lanes.find((l) => l.key === "pipeline_total")).toBeUndefined();
        expect(lanes.find((l) => l.key === "forms_documents")).toBeUndefined();
        expect(lanes.find((l) => l.key === "tours_follow_up")).toBeUndefined();
    });

    it("resolvePipelineExecPanelTitle uses primary_total_label for v2 domain layout", () => {
        expect(resolvePipelineExecPanelTitle(ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def)).toBe("Work Units");
    });
});
