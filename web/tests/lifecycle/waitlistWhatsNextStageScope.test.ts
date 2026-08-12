import { describe, expect, it } from "vitest";
import { taskMatchesStageWorkTemplate } from "@/lib/lifecycle/projectStageWorkRuntime";

describe("taskMatchesStageWorkTemplate stage scope", () => {
    it("does not match Lead contact_family tasks onto Waitlist review_waitlist_position", () => {
        const matched = taskMatchesStageWorkTemplate(
            {
                id: "task-1",
                title: "Contact Family",
                status: "open",
                due_at: null,
                updated_at: null,
                metadata: {
                    work_definition_key: "contact_family",
                    operating_plan_template_key: "contact_family",
                    lifecycle_stage_key: "lead",
                    lifecycle_provenance: "lifecycle_template",
                },
            } as never,
            "waitlist",
            { template_key: "review_waitlist_position", work_definition_key: "contact_family" },
        );
        expect(matched).toBe(false);
    });

    it("does not match Lead contact_family onto Waitlist when template keys collide across stages", () => {
        const matched = taskMatchesStageWorkTemplate(
            {
                id: "task-3",
                title: "Contact Family",
                status: "open",
                due_at: null,
                updated_at: null,
                metadata: {
                    work_definition_key: "contact_family",
                    operating_plan_template_key: "contact_family",
                    lifecycle_stage_key: "lead",
                    lifecycle_provenance: "lifecycle_template",
                },
            } as never,
            "waitlist",
            { template_key: "contact_family", work_definition_key: "contact_family" },
        );
        expect(matched).toBe(false);
    });

    it("matches same-stage definition binding", () => {
        const matched = taskMatchesStageWorkTemplate(
            {
                id: "task-2",
                title: "Review waitlist position",
                status: "open",
                due_at: null,
                updated_at: null,
                metadata: {
                    work_definition_key: "contact_family",
                    operating_plan_template_key: "review_waitlist_position",
                    lifecycle_stage_key: "waitlist",
                    lifecycle_provenance: "lifecycle_template",
                },
            } as never,
            "waitlist",
            { template_key: "review_waitlist_position", work_definition_key: "contact_family" },
        );
        expect(matched).toBe(true);
    });

    it("does not match definition-only Lead tasks with unknown stage onto Waitlist", () => {
        const matched = taskMatchesStageWorkTemplate(
            {
                id: "task-4",
                title: "Contact Family",
                status: "open",
                due_at: null,
                updated_at: null,
                metadata: {
                    work_definition_key: "contact_family",
                },
            } as never,
            "waitlist",
            { template_key: "review_waitlist_position", work_definition_key: "contact_family" },
        );
        expect(matched).toBe(false);
    });

    it("does not match Lead Contact Family rewritten onto Waitlist template keys", () => {
        // Live Kurzman row: title + provenance still Lead, but reconciliation rewrote
        // operating_plan_template_key / lifecycle_stage_key to Waitlist.
        const matched = taskMatchesStageWorkTemplate(
            {
                id: "271c5bf7-e13e-46bc-b61e-9d97c3611b57",
                title: "Contact Family",
                status: "open",
                due_at: null,
                updated_at: null,
                metadata: {
                    work_definition_key: "contact_family",
                    operating_plan_template_key: "review_waitlist_position",
                    work_intent_key: "review_waitlist_position",
                    lifecycle_stage_key: "waitlist",
                    dedupe_key:
                        "93667019-bd28-49b5-a688-acc9bb1e0a19|contact_family|93667019-bd28-49b5-a688-acc9bb1e0a19:opportunities:d097e1a8-c3c0-4c51-a113-2275b009b9a9:stage:lead",
                    provenance: {
                        source: "lifecycle_template",
                        idempotency_key:
                            "lifecycle_intent:93667019-bd28-49b5-a688-acc9bb1e0a19:d097e1a8-c3c0-4c51-a113-2275b009b9a9:lead:contact_family",
                    },
                },
            } as never,
            "waitlist",
            { template_key: "review_waitlist_position", work_definition_key: "contact_family" },
        );
        expect(matched).toBe(false);
    });
});
