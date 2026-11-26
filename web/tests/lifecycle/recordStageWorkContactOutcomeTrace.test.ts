import { describe, expect, it } from "vitest";

import { workOutcomeRequiresCommunicationTrace } from "@/lib/lifecycle/recordStageWorkContactOutcomeTrace";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { stageOperatingPlanDraftToPersisted } from "@/lib/lifecycle/stageOperatingPlanEditorModel";

describe("recordStageWorkContactOutcomeTrace", () => {
    it("requires trace for retry outcomes on follow_up work definitions", () => {
        const defaults = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        const contactTemplate = defaults.work_templates.find((t) => t.template_key === "contact_family")!;
        const plan = stageOperatingPlanDraftToPersisted(
            {
                purpose: defaults.purpose ?? "",
                journey_segment: defaults.journey_segment,
                work_templates: [{ ...contactTemplate, primary: true, work_definition_key: "contact_family" }],
                outcomes: defaults.outcomes.filter((o) => o.work_template_key === "contact_family"),
                outcome_rules: defaults.outcome_rules,
                attention_rules: defaults.attention_rules,
            },
            "lead",
        )!;

        expect(
            workOutcomeRequiresCommunicationTrace({
                plan,
                workTemplateKey: "contact_family",
                outcomeKey: "left_message",
            }),
        ).toBe(true);

        expect(
            workOutcomeRequiresCommunicationTrace({
                plan,
                workTemplateKey: "contact_family",
                outcomeKey: "reached_qualified",
            }),
        ).toBe(false);
    });
});
