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

describe("review_lead outcome derivation (default enrollment plan)", () => {
    const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    const reviewOutcomes = plan.outcomes.filter((o) => o.work_template_key === "review_lead");

    it("exposes configured review outcomes — not a Qualified UI hardcode", () => {
        expect(reviewOutcomes.map((o) => o.outcome_key).sort()).toEqual([
            "closed_lost",
            "duplicate",
            "needs_more_information",
            "review_qualified",
        ]);
        expect(reviewOutcomes.map((o) => o.label)).toContain("Reviewed");
        expect(reviewOutcomes.map((o) => o.label)).toContain("Needs More Information");
        // Qualified is qualify_fit, not review_lead
        expect(reviewOutcomes.some((o) => o.outcome_key === "qualified")).toBe(false);
    });

    it("Needs More Information uses attention + continue Contact Family work (not Reopen:)", () => {
        const rule = plan.outcome_rules.find((r) => r.when_outcome_key === "needs_more_information");
        expect(rule).toBeTruthy();
        const kinds = rule!.targets.map((t) => t.kind);
        expect(kinds).toContain("create_needs_attention");
        expect(kinds).toContain("reopen_work");
        expect(rule!.targets.some((t) => t.template_key === "contact_family")).toBe(true);

        const preview = buildStageWorkOutcomeAutomationPreview({
            plan,
            templateKey: "review_lead",
        });
        const needsInfo = preview.find((p) => p.outcome_key === "needs_more_information");
        expect(needsInfo?.effect_label).toMatch(/Needs attention/i);
        expect(JSON.stringify(preview)).not.toMatch(/Reopen:/i);
    });

    it("close decision matches successful / terminal outcomes", () => {
        expect(shouldCloseWorkAfterStageOutcome(plan, "review_qualified").shouldClose).toBe(true);
        expect(shouldCloseWorkAfterStageOutcome(plan, "duplicate").shouldClose).toBe(true);
        expect(shouldCloseWorkAfterStageOutcome(plan, "closed_lost").shouldClose).toBe(true);
        expect(shouldCloseWorkAfterStageOutcome(plan, "needs_more_information").shouldClose).toBe(false);
    });
});

describe("stageWorkOutcomeEffectLines honesty", () => {
    function item(partial: Partial<StageWorkItemProjection>): StageWorkItemProjection {
        return {
            template_key: "review_lead",
            label: "Review Lead",
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
                { outcome_key: "review_qualified", label: "Reviewed", successful: true },
                { outcome_key: "needs_more_information", label: "Needs More Information" },
            ],
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: [
                {
                    outcome_key: "needs_more_information",
                    outcome_label: "Needs More Information",
                    effect_label: "Needs attention: Needs more information from family",
                },
            ],
            ...partial,
        };
    }

    it("does not claim Close for retry outcomes", () => {
        const lines = stageWorkOutcomeEffectLines(item({}), "needs_more_information");
        expect(lines.some((l) => /Continue Review Lead work/i.test(l))).toBe(true);
        expect(lines.some((l) => l === "Close current work item")).toBe(false);
        expect(lines.join(" ")).not.toMatch(/Reopen:/i);
    });

    it("claims Close for successful outcomes", () => {
        const lines = stageWorkOutcomeEffectLines(item({}), "review_qualified");
        expect(lines).toContain("Close current work item");
    });
});

describe("completionOutcomesForPicker", () => {
    function pickerItem(partial: Partial<StageWorkItemProjection>): StageWorkItemProjection {
        return {
            template_key: "review_lead",
            label: "Review Lead",
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
                { outcome_key: "review_qualified", label: "Reviewed", successful: true },
                { outcome_key: "needs_more_information", label: "Needs More Information" },
                { outcome_key: "noop", label: "No-op" },
            ],
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: [
                {
                    outcome_key: "needs_more_information",
                    outcome_label: "Needs More Information",
                    effect_label: "Needs attention: Needs more information from family",
                },
            ],
            ...partial,
        };
    }

    it("returns all configured outcomes — same list as stage runtime", () => {
        const outcomes = completionOutcomesForPicker(pickerItem({}));
        expect(outcomes.map((o) => o.outcome_key).sort()).toEqual([
            "needs_more_information",
            "noop",
            "review_qualified",
        ]);
    });
});
