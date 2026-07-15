import { describe, expect, it } from "vitest";
import {
    completionPolicySummary,
    normalizeCompletionPolicy,
    shouldRepeatWorkAfterRetryOutcome,
} from "@/lib/lifecycle/stageWorkCompletionPolicy";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    buildOutcomeRuleFromAutomation,
    readOutcomeAutomationDraft,
    upsertOutcomeAutomationRule,
} from "@/lib/lifecycle/stageOutcomeAutomation";
import { outcomeRulesForKey } from "@/lib/lifecycle/stageOperatingPlanV1";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { stageOperatingPlanDraftToPersisted } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("completion_policy", () => {
    it("parses, persists, and normalizes completion policy on work templates", () => {
        const parsed = parseStageOperatingPlanV1({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "lead",
            journey_segment: "family",
            work_templates: [
                {
                    template_key: "contact_family",
                    label: "Contact Family",
                    required: true,
                    due_policy: { kind: "offset_days", days: 1 },
                    owner_strategy: "record_owner",
                    completion_policy: {
                        min_attempts: 3,
                        max_attempts: 3,
                        window_days: 7,
                        repeat_until_outcome: true,
                        repeat_due_days: 2,
                    },
                },
            ],
            outcomes: [],
            outcome_rules: [],
            attention_rules: [],
        });

        expect(parsed?.work_templates[0]?.completion_policy).toEqual({
            min_attempts: 3,
            max_attempts: 3,
            window_days: 7,
            repeat_until_outcome: true,
            repeat_due_days: 2,
        });
        expect(completionPolicySummary(parsed?.work_templates[0]?.completion_policy)).toBe(
            "Requires 3 attempts within 7 days. Repeats every 2 days until resolved",
        );
    });

    it("legacy stages without completion_policy behave as before", () => {
        const parsed = parseStageOperatingPlanV1({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "lead",
            journey_segment: "family",
            work_templates: [
                {
                    template_key: "contact_family",
                    label: "Contact Family",
                    required: true,
                    due_policy: { kind: "same_day" },
                    owner_strategy: "record_owner",
                },
            ],
            outcomes: [],
            outcome_rules: [],
            attention_rules: [],
        });
        expect(parsed?.work_templates[0]?.completion_policy).toBeUndefined();
        expect(shouldRepeatWorkAfterRetryOutcome(parsed?.work_templates[0], 1)).toEqual({
            repeat: false,
            dueDays: null,
        });
    });

    it("stops repeating after max attempts", () => {
        const policy = normalizeCompletionPolicy({
            min_attempts: 3,
            max_attempts: 3,
            repeat_until_outcome: true,
            repeat_due_days: 2,
        });
        expect(shouldRepeatWorkAfterRetryOutcome({ completion_policy: policy }, 2)).toEqual({
            repeat: true,
            dueDays: 2,
        });
        expect(shouldRepeatWorkAfterRetryOutcome({ completion_policy: policy }, 3)).toEqual({
            repeat: false,
            dueDays: null,
        });
    });
});

describe("outcome automation", () => {
    it("serializes Family Enrolling → Decision to Enrolling transition into outcome_rules[]", () => {
        const rules = upsertOutcomeAutomationRule([], "family_enrolling", {
            kind: "move_to_stage",
            transition_ref: "decision_to_enrolling",
        });
        expect(rules[0]?.when_outcome_key).toBe("family_enrolling");
        expect(
            rules[0]?.targets.some(
                (t) => t.kind === "move_to_stage" && t.transition_ref === "decision_to_enrolling",
            ),
        ).toBe(true);
    });

    it("serializes Closed Lost → close status rule", () => {
        const rule = buildOutcomeRuleFromAutomation("closed_lost", { kind: "close_record", status_key: "closed" }, 0);
        expect(rule?.targets.some((t) => t.kind === "update_family_case_status" && t.status_key === "closed")).toBe(
            true,
        );
    });

    it("serializes follow-up work with due days", () => {
        const rule = buildOutcomeRuleFromAutomation(
            "left_message",
            { kind: "repeat_work", repeat_template_key: "contact_family", repeat_due_days: 2 },
            0,
        );
        expect(rule?.targets[0]?.kind).toBe("create_next_work");
        expect(rule?.targets[0]?.template_key).toBe("contact_family");
        expect(rule?.targets[0]?.due_days).toBe(2);
        expect(rule?.targets[0]?.follow_up_due_policy?.offset_unit).toBe("days");
    });

    it("reads mark needs attention automation from rules", () => {
        const rules = upsertOutcomeAutomationRule([], "awaiting_response", {
            kind: "mark_needs_attention",
            attention_reason: "Awaiting family response",
        });
        const draft = readOutcomeAutomationDraft("awaiting_response", rules);
        expect(draft.kind).toBe("mark_needs_attention");
        expect(draft.attention_reason).toBe("Awaiting family response");
    });

    it("legacy outcomes with no automation show none", () => {
        expect(readOutcomeAutomationDraft("unknown", []).kind).toBe("none");
    });

    it("filters attempt-conditional rules at runtime", () => {
        const plan = {
            ...defaultStageOperatingPlanForEnrollmentStage("lead")!,
            outcome_rules: [
                {
                    rule_key: "unable_repeat",
                    when_outcome_key: "unable_to_reach",
                    when_attempt_count_lt: 3,
                    targets: [{ kind: "reopen_work" as const, template_key: "contact_family", due_days: 2 }],
                },
                {
                    rule_key: "unable_attention",
                    when_outcome_key: "unable_to_reach",
                    when_attempt_count_gte: 3,
                    targets: [
                        {
                            kind: "create_needs_attention" as const,
                            attention_reason: "Unable to reach after 3 attempts",
                        },
                    ],
                },
            ],
        };
        const belowMax = outcomeRulesForKey(plan, "unable_to_reach", { attemptCount: 2 });
        const atMax = outcomeRulesForKey(plan, "unable_to_reach", { attemptCount: 3 });
        expect(belowMax.some((r) => r.targets.some((t) => t.kind === "reopen_work"))).toBe(true);
        expect(atMax.some((r) => r.targets.some((t) => t.kind === "create_needs_attention"))).toBe(true);
    });
});

describe("Lead stage representability", () => {
    it("default Lead stage is Direct Action Contact Family with Available Outcomes", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        expect(plan.work_templates.map((t) => t.template_key)).toEqual(["contact_family"]);
        expect(plan.work_templates[0]?.primary).toBe(true);
        expect(plan.work_templates[0]?.execution_mode).toBe("direct_action");
        expect(plan.work_templates[0]?.outcome_refs?.length).toBeGreaterThanOrEqual(5);
        expect(plan.attention_rules.length).toBeGreaterThanOrEqual(2);
    });

    it("persists editor draft with outcome rules", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        const persisted = stageOperatingPlanDraftToPersisted(
            {
                purpose: plan.purpose ?? "",
                journey_segment: plan.journey_segment,
                work_templates: plan.work_templates,
                outcomes: plan.outcomes,
                outcome_rules: plan.outcome_rules,
                attention_rules: plan.attention_rules,
            },
            "lead",
        );
        expect(persisted?.work_templates[0]?.execution_mode).toBe("direct_action");
        expect(persisted?.outcome_rules.some((r) => r.when_outcome_key === "left_message")).toBe(true);
    });
});

describe("business process editor UI wiring", () => {
    it("renders completion policy controls and outcome automation editor", () => {
        const editor = readFileSync(
            join(webRoot, "components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx"),
            "utf8",
        );
        const completion = readFileSync(
            join(webRoot, "components/adminV2/settings/lifecycle/LifecycleStageWorkCompletionPolicyEditor.tsx"),
            "utf8",
        );
        expect(editor).toContain("LifecycleStageWorkCompletionPolicyEditor");
        expect(editor).toContain("LifecycleStageWorkTemplateActionsEditor");
        expect(completion).toContain("Completion policy");
    });

    it("Work card shows attempt count and completion policy summary", () => {
        const card = readFileSync(join(webRoot, "components/workIntent/WorkIntentRuntimeCard.tsx"), "utf8");
        expect(card).toContain("completion_policy_summary");
        expect(card).toContain("Attempt");
    });

    it("executeStageOperatingOutcome supports reopen_work target", () => {
        const execute = readFileSync(join(webRoot, "lib/lifecycle/stageOutcomeRuleTargetExecutor.ts"), "utf8");
        expect(execute).toContain('case "reopen_work"');
        expect(execute).toContain("reopenStageWorkWithDueDate");
    });
});
