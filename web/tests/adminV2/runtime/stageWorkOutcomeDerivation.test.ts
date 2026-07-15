/**
 * Stage work outcome derivation — config truth for Current Work completion.
 */

import { describe, expect, it } from "vitest";

import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { shouldCloseWorkAfterStageOutcome } from "@/lib/lifecycle/shouldCloseWorkAfterStageOutcome";
import {
    completionOutcomesForPicker,
    stageWorkOutcomeEffectLines,
} from "@/lib/workIntent/stageWorkOutcomeEffectLines";
import type { StageWorkItemProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

describe("contact_family outcome derivation (default enrollment plan)", () => {
    const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    const contactOutcomes = plan.outcomes;

    it("exposes configured Contact Family outcomes — not a hardcoded Qualified set", () => {
        expect(contactOutcomes.map((o) => o.outcome_key).sort()).toEqual([
            "interested",
            "left_message",
            "needs_follow_up",
            "not_interested",
            "reached_family",
        ]);
        expect(contactOutcomes.map((o) => o.label)).toContain("Reached Family");
        expect(contactOutcomes.map((o) => o.label)).toContain("Not Interested");
    });

    it("Not Interested closes via Closed Lost transition", () => {
        const rule = plan.outcome_rules.find((r) => r.when_outcome_key === "not_interested");
        expect(rule).toBeTruthy();
        expect(rule!.targets.some((t) => t.transition_ref === "lead_to_closed_lost")).toBe(true);

        const preview = buildStageWorkOutcomeAutomationPreview({
            plan,
            templateKey: "contact_family",
        });
        expect(preview.some((p) => p.outcome_key === "not_interested")).toBe(true);
        expect(JSON.stringify(preview)).not.toMatch(/Reopen:/i);
    });

    it("close decision matches successful outcomes; stay-in-stage retries remain open", () => {
        expect(shouldCloseWorkAfterStageOutcome(plan, "reached_family").shouldClose).toBe(true);
        expect(shouldCloseWorkAfterStageOutcome(plan, "interested").shouldClose).toBe(true);
        expect(shouldCloseWorkAfterStageOutcome(plan, "left_message").shouldClose).toBe(false);
        // Closed Lost uses transition_ref; closure may be ownership of completes_work at record time.
        expect(plan.outcomes.find((o) => o.outcome_key === "not_interested")?.completes_work).toBe(true);
    });
});

describe("stageWorkOutcomeEffectLines honesty", () => {
    function item(partial: Partial<StageWorkItemProjection>): StageWorkItemProjection {
        return {
            template_key: "contact_family",
            label: "Contact Family",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "w1",
            due_at: null,
            due_urgency: "none",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: [
                { outcome_key: "reached_family", label: "Reached Family", successful: true },
                { outcome_key: "left_message", label: "Left Message" },
            ],
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: [
                {
                    outcome_key: "left_message",
                    outcome_label: "Left Message",
                    effect_label: "Stay in stage",
                },
            ],
            ...partial,
        };
    }

    it("does not claim Close for stay-in-stage outcomes", () => {
        const lines = stageWorkOutcomeEffectLines(item({}), "left_message");
        expect(lines.some((l) => l === "Close current work item")).toBe(false);
        expect(lines.join(" ")).not.toMatch(/Reopen:/i);
    });

    it("claims Close for successful outcomes", () => {
        const lines = stageWorkOutcomeEffectLines(item({}), "reached_family");
        expect(lines).toContain("Close current work item");
    });
});

describe("completionOutcomesForPicker", () => {
    function pickerItem(partial: Partial<StageWorkItemProjection>): StageWorkItemProjection {
        return {
            template_key: "contact_family",
            label: "Contact Family",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "w1",
            due_at: null,
            due_urgency: "none",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: [
                { outcome_key: "reached_family", label: "Reached Family", successful: true },
                { outcome_key: "left_message", label: "Left Message" },
                { outcome_key: "noop", label: "No-op" },
            ],
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: [],
            ...partial,
        };
    }

    it("returns configured outcomes for the picker", () => {
        const keys = completionOutcomesForPicker(pickerItem({})).map((o) => o.outcome_key);
        expect(keys).toContain("reached_family");
        expect(keys).toContain("left_message");
    });
});
