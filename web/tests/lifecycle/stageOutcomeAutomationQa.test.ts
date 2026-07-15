import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    duePolicyFromLegacyDays,
    effectiveFollowUpDuePolicy,
    formatFollowUpDuePolicySummary,
    resolveFollowUpWorkDueAt,
} from "@/lib/lifecycle/stageFollowUpWorkDuePolicy";
import {
    buildOutcomeRuleFromAutomation,
    outcomeAutomationSummaryForOutcome,
    readOutcomeAutomationDraft,
    upsertOutcomeAutomationRule,
} from "@/lib/lifecycle/stageOutcomeAutomation";
import { resolveStageOutcomeTransitionOptions } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { normalizeAttentionRuleKind } from "@/lib/lifecycle/stageAttentionRuleCatalog";

const BILLING_STAGES = [
    { key: "payment_follow_up", label: "Payment Follow-up" },
    { key: "escalated_review", label: "Escalated Review" },
];

describe("stage follow-up work due policy", () => {
    const recordedAt = new Date("2026-07-10T15:00:00.000Z");

    it("due after outcome recorded", () => {
        const result = resolveFollowUpWorkDueAt({
            policy: {
                anchor: "outcome_recorded_at",
                offset_value: 2,
                offset_unit: "days",
                direction: "after",
            },
            outcomeRecordedAt: recordedAt,
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.dueAt).toBe("2026-07-12T15:00:00.000Z");
        }
    });

    it("due before scheduled event", () => {
        const result = resolveFollowUpWorkDueAt({
            policy: {
                anchor: "scheduled_event_start",
                offset_value: 1,
                offset_unit: "days",
                direction: "before",
            },
            outcomeRecordedAt: recordedAt,
            scheduledEventStartAt: "2026-07-15T10:00:00.000Z",
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.dueAt).toBe("2026-07-14T10:00:00.000Z");
        }
    });

    it("missing anchor uses outcome_recorded_at fallback by default", () => {
        const result = resolveFollowUpWorkDueAt({
            policy: {
                anchor: "scheduled_event_start",
                offset_value: 1,
                offset_unit: "days",
                direction: "before",
                missing_anchor_behavior: "use_outcome_recorded_at",
            },
            outcomeRecordedAt: recordedAt,
        });
        expect(result.ok).toBe(true);
    });

    it("missing anchor do_not_create is deterministic", () => {
        const result = resolveFollowUpWorkDueAt({
            policy: {
                anchor: "field_value",
                field_ref: "promised_payment_date",
                missing_anchor_behavior: "do_not_create",
            },
            outcomeRecordedAt: recordedAt,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("missing_anchor");
    });

    it("legacy due_days adapter maps to outcome_recorded_at", () => {
        const policy = effectiveFollowUpDuePolicy(null, 3);
        expect(policy.anchor).toBe("outcome_recorded_at");
        expect(policy.offset_value).toBe(3);
    });

    it("formats human-readable due summary", () => {
        const summary = formatFollowUpDuePolicySummary(
            duePolicyFromLegacyDays(2),
            "Check Tour Availability",
        );
        expect(summary).toContain("Check Tour Availability");
        expect(summary).toContain("2 day");
    });
});

describe("outcome automation — work template and transitions", () => {
    const workTemplates = [
        { template_key: "send_reminder", label: "Send Payment Reminder", required: false, due_policy: { kind: "offset_days", days: 1 }, owner_strategy: "record_owner" as const },
        { template_key: "collect_payment", label: "Collect Payment", required: true, due_policy: { kind: "same_day" }, owner_strategy: "record_owner" as const },
    ];

    const billingPlan: ReturnType<typeof parseStageOperatingPlanV1> = parseStageOperatingPlanV1({
        version: 1,
        lifecycle_key: "billing",
        stage_key: "payment_follow_up",
        journey_segment: "family",
        work_templates: workTemplates,
        outcomes: [
            { outcome_key: "unable_to_collect", label: "Escalate Review" },
            { outcome_key: "promise_to_pay", label: "Promise to Pay" },
        ],
        outcome_rules: [
            {
                rule_key: "escalate",
                when_outcome_key: "unable_to_collect",
                targets: [
                    {
                        kind: "move_to_stage",
                        stage_key: "escalated_review",
                        transition_ref: "outcome_transition:unable_to_collect:escalated_review",
                    },
                ],
            },
        ],
        attention_rules: [],
    })!;

    const transitionOptions = resolveStageOutcomeTransitionOptions({
        currentStageKey: "payment_follow_up",
        stageOperatingPlan: billingPlan,
        processStages: BILLING_STAGES,
    });

    it("transition options derive from configured outgoing edges", () => {
        expect(transitionOptions.some((t) => t.target_stage_key === "escalated_review")).toBe(true);
        expect(transitionOptions.some((t) => t.label === "Escalate Review")).toBe(true);
        expect(transitionOptions.every((t) => !t.label.toLowerCase().includes("waitlist"))).toBe(true);
    });

    it("no transitions when plan has no outgoing edges", () => {
        const none = resolveStageOutcomeTransitionOptions({
            currentStageKey: "payment_follow_up",
            stageOperatingPlan: { ...billingPlan, outcome_rules: [] },
            processStages: BILLING_STAGES,
        });
        expect(none).toHaveLength(0);
    });

    it("follow-up outcome selects stable work template ref", () => {
        const rules = upsertOutcomeAutomationRule(
            [],
            "promise_to_pay",
            {
                kind: "repeat_work",
                repeat_template_key: "send_reminder",
                follow_up_due_policy: {
                    anchor: "field_value",
                    field_ref: "promised_payment_date",
                    offset_value: 1,
                    offset_unit: "days",
                    direction: "before",
                },
            },
            { transitionOptions },
        );
        const target = rules[0]?.targets.find((t) => t.kind === "create_next_work");
        expect(target?.template_key).toBe("send_reminder");
        expect(target?.follow_up_due_policy?.anchor).toBe("field_value");
    });

    it("move through transition persists transition_ref", () => {
        const transition = transitionOptions[0]!;
        const rules = upsertOutcomeAutomationRule(
            [],
            "unable_to_collect",
            {
                kind: "move_to_stage",
                transition_ref: transition.transition_ref,
                stage_key: transition.target_stage_key,
            },
            { transitionOptions },
        );
        const moveTarget = rules[0]?.targets.find((t) => t.kind === "move_to_stage");
        expect(moveTarget?.transition_ref).toBe(transition.transition_ref);
    });

    it("legacy stage_key-only draft resolves transition when unambiguous", () => {
        const rules = [
            {
                rule_key: "legacy_outcome_move",
                when_outcome_key: "legacy_outcome",
                targets: [{ kind: "move_to_stage" as const, stage_key: "escalated_review" }],
            },
        ];
        const draft = readOutcomeAutomationDraft("legacy_outcome", rules, { transitionOptions });
        expect(draft.transition_ref).toBe("outcome_transition:unable_to_collect:escalated_review");
    });

    it("outcome summary reflects persisted behavior", () => {
        const rules = upsertOutcomeAutomationRule(
            [],
            "promise_to_pay",
            {
                kind: "repeat_work",
                repeat_template_key: "send_reminder",
                follow_up_due_policy: {
                    anchor: "outcome_recorded_at",
                    offset_value: 1,
                    offset_unit: "days",
                    direction: "after",
                },
            },
            { transitionOptions },
        );
        const summary = outcomeAutomationSummaryForOutcome("promise_to_pay", "Promise to Pay", rules, {
            workTemplateLabelByKey: Object.fromEntries(workTemplates.map((t) => [t.template_key, t.label])),
            transitionLabelByRef: Object.fromEntries(transitionOptions.map((t) => [t.transition_ref, t.label])),
        });
        expect(summary).toContain("Promise to Pay");
        expect(summary).toContain("Send Payment Reminder");
    });

    it("deleted work template ref does not crash parse", () => {
        const plan = parseStageOperatingPlanV1({
            version: 1,
            lifecycle_key: "billing",
            stage_key: "payment_follow_up",
            journey_segment: "family",
            work_templates: workTemplates,
            outcomes: [{ outcome_key: "promise_to_pay", label: "Promise to Pay" }],
            outcome_rules: [
                {
                    rule_key: "r1",
                    when_outcome_key: "promise_to_pay",
                    targets: [{ kind: "create_next_work", template_key: "deleted_template", due_days: 1 }],
                },
            ],
            attention_rules: [],
        });
        expect(plan?.outcome_rules[0]?.targets[0]?.template_key).toBe("deleted_template");
    });
});

describe("attention rule catalog", () => {
    it("missing_required_fields normalizes to missing_requirements", () => {
        expect(normalizeAttentionRuleKind("missing_required_fields")).toBe("missing_requirements");
    });
});

describe("anti-hardcoding", () => {
    const root = resolve(__dirname, "../..");

    it("generic transition resolver has no enrollment process key", () => {
        const source = readFileSync(resolve(root, "lib/lifecycle/resolveStageOutcomeTransitionOptions.ts"), "utf8");
        const outgoing = readFileSync(resolve(root, "lib/lifecycle/resolveOutgoingProcessTransitions.ts"), "utf8");
        expect(source).not.toContain("ENROLLMENT_PROCESS_KEY");
        expect(outgoing).not.toContain('"waitlist"');
        expect(source).toContain("resolveOutgoingProcessTransitions");
    });

    it("canonical action resolver does not scan global action library", () => {
        const source = readFileSync(resolve(root, "lib/lifecycle/resolveCanonicalWorkTemplateActionOptions.ts"), "utf8");
        expect(source).not.toContain("ACTION_BUTTON_LIBRARY");
    });

    it("outcome automation uses process-derived transitions", () => {
        const source = readFileSync(resolve(root, "lib/lifecycle/stageOutcomeAutomation.ts"), "utf8");
        expect(source).toContain("resolveStageOutcomeTransitionOptions");
    });
});
