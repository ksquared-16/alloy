import { describe, expect, it } from "vitest";

import { resolveWorkTemplateActionOptions } from "@/lib/lifecycle/resolveWorkTemplateActionOptions";

describe("resolveWorkTemplateActionOptions", () => {
    it("excludes generic umbrella status actions from selectable options", () => {
        const options = resolveWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: {
                version: 1,
                candidate_actions: [
                    { action_key: "schedule_tour", recommendation: "recommended" },
                    { action_key: "update_enrollment_status", recommendation: "ready" },
                    { action_key: "close_lead", recommendation: "context_dependent" },
                ],
            },
            processTransitions: [{ key: "waitlist", label: "Waitlist" }],
            stageKey: "lead",
            stageOutcomes: [],
            workTemplateKey: "contact_family",
        });

        expect(options.primaryActionOptions.some((row) => row.ref === "update_enrollment_status")).toBe(true);
        expect(options.primaryActionOptions.find((row) => row.ref === "update_enrollment_status")?.supported).toBe(false);
        expect(options.helpfulActionOptions.some((row) => row.ref === "update_enrollment_status")).toBe(false);
    });

    it("derives alternate path transition options from process stages", () => {
        const options = resolveWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: null,
            processTransitions: [
                { key: "lead", label: "Lead" },
                { key: "waitlist", label: "Waitlist" },
            ],
            stageKey: "lead",
            stageOutcomes: [],
        });

        expect(options.transitionOptions.map((row) => row.ref)).toEqual(["move_to_stage:waitlist"]);
        expect(options.transitionOptions[0]?.label).toBe("Move to Waitlist");
    });

    it("does not depend on enrollment process key", () => {
        const options = resolveWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: {
                version: 1,
                candidate_actions: [{ action_key: "record_payment", recommendation: "recommended" }],
            },
            processTransitions: [{ key: "collect_payment", label: "Collect Payment" }],
            stageKey: "collect_payment",
            stageOutcomes: [{ outcome_key: "paid", label: "Paid", work_template_key: "collect_payment" }],
            workTemplateKey: "collect_payment",
        });

        expect(options.helpfulActionOptions.map((row) => row.ref)).toEqual(["record_payment"]);
    });
});
