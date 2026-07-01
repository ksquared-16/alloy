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

    it("header includes all sibling work views — v2 domain sections become pill strip", () => {
        const lanes = extractPipelineExecutionLanes(ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def);
        // All non-attention, non-internal sections must appear as pill candidates
        const keys = lanes.map((l) => l.key);
        expect(keys).toContain("new_leads");
        expect(keys).toContain("tours");
        expect(keys).toContain("communications_followup");
        expect(keys).toContain("waitlist");
        expect(keys).toContain("enrollment_offers");
        expect(keys).toContain("enrollment_completed");
        // Labels come from the queue definition (section display labels)
        expect(lanes.find((l) => l.key === "enrollment_offers")?.label).toBe("Enrolling");
        expect(lanes.find((l) => l.key === "enrollment_completed")?.label).toBe("Enrolled");
        // Active Work View highlighted: the full sibling list is available to mark any lane active
        const activeLane = lanes.find((l) => l.key === "new_leads");
        expect(activeLane).toBeDefined();
        expect(activeLane?.label).toBe("New Leads");
    });
});
