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
});
