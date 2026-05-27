import { describe, expect, it } from "vitest";

import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import {
    ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE,
    ENROLLMENT_PIPELINE_V2_QUEUE_ALIASES,
    ENROLLMENT_PIPELINE_V2_VISIBLE_THROUGHPUT_LABELS,
    ENROLLMENT_PIPELINE_V2_VISIBLE_THROUGHPUT_SECTION_KEYS,
    enrollmentPipelineVisibleThroughputLabels,
    RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
} from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { readQueueUiPresentationFlags } from "@/lib/ui-v2/readQueueUiPresentationFlags";
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

    it("exposes Card 14A visible throughput section keys and labels", () => {
        expect([...ENROLLMENT_PIPELINE_V2_VISIBLE_THROUGHPUT_SECTION_KEYS]).toEqual([
            "new_leads",
            "tours",
            "communications_followup",
            "waitlist",
            "enrolling",
            "enrolled",
        ]);
        expect([...ENROLLMENT_PIPELINE_V2_VISIBLE_THROUGHPUT_LABELS]).toEqual([
            "New Leads",
            "Tours",
            "Follow Up",
            "Waitlist",
            "Enrolling",
            "Enrolled",
        ]);
        expect(enrollmentPipelineVisibleThroughputLabels()).toEqual([
            ...ENROLLMENT_PIPELINE_V2_VISIBLE_THROUGHPUT_LABELS,
        ]);
    });

    it("hides Forms/Documents and Other from ui.sections while keeping execution queues", () => {
        const ui = RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2.ui;
        const sectionQueueKeys = ui.sections.flatMap((s) => s.queue_keys);
        expect(sectionQueueKeys).not.toContain("forms_documents");
        expect(sectionQueueKeys).not.toContain("tours_follow_up");

        const formsQueue = RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2.queues.find((q) => q.key === "forms_documents");
        expect(formsQueue).toBeDefined();

        const followUpQueue = RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2.queues.find(
            (q) => q.key === "tours_follow_up"
        );
        expect(followUpQueue?.aliases).toContain("tour_completed_follow_up");
    });

    it("uses Card 14A renamed queue labels", () => {
        const byKey = new Map(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2.queues.map((q) => [q.key, q]));
        expect(byKey.get("communications_followup")?.label).toBe("Follow Up");
        expect(byKey.get("enrollment_offers")?.label).toBe("Enrolling");
        expect(byKey.get("enrollment_completed")?.label).toBe("Enrolled");
    });

    it("enables UI presentation flags to suppress Other pill and lifecycle panel", () => {
        const flags = readQueueUiPresentationFlags(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2);
        expect(flags.suppressOtherPill).toBe(true);
        expect(flags.suppressLifecyclePanel).toBe(true);
    });

    it("preserves legacy alias routes for old deep links", () => {
        const queues = ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.queues;
        const legacyLinks = [
            ["communications_followup", "communications_followup"],
            ["enrollment_offers", "enrollment_offers"],
            ["ready_to_enroll", "enrollment_offers"],
            ["tour_completed_follow_up", "tours_follow_up"],
        ] as const;
        for (const [requested, expected] of legacyLinks) {
            const resolution = resolveQueueKeyFromDefinition(requested, queues);
            expect(resolution.resolvedKey).toBe(expected);
        }
    });
});
