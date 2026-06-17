import { describe, expect, it } from "vitest";
import { buildBusinessProcessWorkTaskMetadata } from "@/lib/lifecycle/buildBusinessProcessWorkTaskMetadata";

describe("buildBusinessProcessWorkTaskMetadata", () => {
    it("stamps canonical BP runtime metadata fields", () => {
        const metadata = buildBusinessProcessWorkTaskMetadata({
            workIntentKey: "review_lead",
            operatingPlanTemplateKey: "review_lead",
            lifecycleStageKey: "lead",
            departmentId: "dept-1",
            attemptCount: 0,
        });

        expect(metadata).toEqual({
            work_intent_key: "review_lead",
            operating_plan_template_key: "review_lead",
            lifecycle_stage_key: "lead",
            lifecycle_provenance: "lifecycle_template",
            operating_plan_template: true,
            attempt_count: 0,
            department_id: "dept-1",
        });
    });

    it("stamps bp runtime fingerprint when provided", () => {
        const metadata = buildBusinessProcessWorkTaskMetadata({
            workIntentKey: "confirm_tour_date",
            operatingPlanTemplateKey: "confirm_tour_date",
            lifecycleStageKey: "tour",
            bpRuntimeFingerprint: "bp:org-1:opportunities:opp-1:tour:confirm_tour_date",
        });
        expect(metadata.bp_runtime_fingerprint).toBe(
            "bp:org-1:opportunities:opp-1:tour:confirm_tour_date",
        );
    });

    it("requires all identity keys", () => {
        expect(() =>
            buildBusinessProcessWorkTaskMetadata({
                workIntentKey: "",
                operatingPlanTemplateKey: "review_lead",
                lifecycleStageKey: "lead",
            }),
        ).toThrow(/requires workIntentKey/);
    });
});
