import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveConfiguredOperatorOptions } from "@/lib/lifecycle/resolveConfiguredOperatorOptions";
import { resolveOutgoingProcessTransitions } from "@/lib/lifecycle/resolveOutgoingProcessTransitions";
import { resolveCanonicalWorkTemplateActionOptions } from "@/lib/lifecycle/resolveCanonicalWorkTemplateActionOptions";
import { resolveWorkTemplateActionOptions } from "@/lib/lifecycle/resolveWorkTemplateActionOptions";
import { resolveStageOutcomeTransitionOptions } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";
import { classifyRecordHeaderActionsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/classifyCurrentWorkActions";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";

const BILLING_STAGES = [
    { key: "invoice_issued", label: "Invoice Issued" },
    { key: "payment_follow_up", label: "Payment Follow-up" },
    { key: "escalated_review", label: "Escalated Review" },
    { key: "paid", label: "Paid" },
];

const BILLING_CATALOG: StageActionCatalogV1 = {
    version: 1,
    candidate_actions: [
        { action_key: "send_reminder", recommendation: "recommended" },
        { action_key: "record_payment", recommendation: "ready" },
        { action_key: "create_payment_plan", recommendation: "ready" },
        { action_key: "escalate_to_director", recommendation: "context_dependent" },
    ],
};

const BILLING_PLAN_WITH_TRANSITION: StageOperatingPlanV1 = {
    version: 1,
    lifecycle_key: "billing",
    stage_key: "payment_follow_up",
    journey_segment: "family",
    work_templates: [],
    outcomes: [
        { outcome_key: "unable_to_collect", label: "Escalate Review" },
    ],
    outcome_rules: [
        {
            rule_key: "escalate_rule",
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
};

const BILLING_PLAN_NO_TRANSITIONS: StageOperatingPlanV1 = {
    ...BILLING_PLAN_WITH_TRANSITION,
    outcome_rules: [],
};

const CHILDCARE_ACTION_KEYS = [
    "move_to_waitlist",
    "schedule_tour",
    "close_lead",
    "add_child",
    "waitlist_child",
    "enroll_child",
    "change_enrollment_status",
];

function optionLabels(options: Array<{ label: string; ref?: string }>): string[] {
    return options.map((row) => row.label);
}

function optionRefs(options: Array<{ ref: string }>): string[] {
    return options.map((row) => row.ref);
}

describe("resolveOutgoingProcessTransitions", () => {
    it("51 — process without Waitlist stage never exposes Move to Waitlist", () => {
        const transitions = resolveOutgoingProcessTransitions({
            currentStageKey: "payment_follow_up",
            stageOperatingPlan: BILLING_PLAN_WITH_TRANSITION,
            processStages: BILLING_STAGES,
        });
        expect(transitions.some((t) => t.label.toLowerCase().includes("waitlist"))).toBe(false);
        expect(transitions.some((t) => t.target_stage_key === "waitlist")).toBe(false);
    });

    it("52 — Waitlist stage without outgoing transition from current stage does not expose Move to Waitlist", () => {
        const enrollmentStages = [
            { key: "tour", label: "Tour" },
            { key: "waitlist", label: "Waitlist" },
        ];
        const transitions = resolveOutgoingProcessTransitions({
            currentStageKey: "tour",
            stageOperatingPlan: { ...BILLING_PLAN_NO_TRANSITIONS, outcomes: [], outcome_rules: [] },
            processStages: enrollmentStages,
        });
        expect(transitions).toHaveLength(0);
    });

    it("53 — adding configured outgoing transition makes it available without code change", () => {
        const transitions = resolveOutgoingProcessTransitions({
            currentStageKey: "payment_follow_up",
            stageOperatingPlan: BILLING_PLAN_WITH_TRANSITION,
            processStages: BILLING_STAGES,
        });
        expect(transitions).toHaveLength(1);
        expect(transitions[0]?.target_stage_key).toBe("escalated_review");
    });

    it("54 — removing transition removes option", () => {
        const withTransition = resolveOutgoingProcessTransitions({
            currentStageKey: "payment_follow_up",
            stageOperatingPlan: BILLING_PLAN_WITH_TRANSITION,
            processStages: BILLING_STAGES,
        });
        const withoutTransition = resolveOutgoingProcessTransitions({
            currentStageKey: "payment_follow_up",
            stageOperatingPlan: BILLING_PLAN_NO_TRANSITIONS,
            processStages: BILLING_STAGES,
        });
        expect(withTransition.length).toBeGreaterThan(0);
        expect(withoutTransition).toHaveLength(0);
    });

    it("55 — transition labels come from configuration, not generated childcare copy", () => {
        const transitions = resolveOutgoingProcessTransitions({
            currentStageKey: "payment_follow_up",
            stageOperatingPlan: BILLING_PLAN_WITH_TRANSITION,
            processStages: BILLING_STAGES,
        });
        expect(transitions[0]?.label).toBe("Escalate Review");
        expect(transitions[0]?.label).not.toMatch(/^Move to /);
    });

    it("56 — two transitions to same destination remain distinct", () => {
        const plan: StageOperatingPlanV1 = {
            ...BILLING_PLAN_WITH_TRANSITION,
            outcomes: [
                { outcome_key: "outcome_a", label: "Path A" },
                { outcome_key: "outcome_b", label: "Path B" },
            ],
            outcome_rules: [
                {
                    rule_key: "rule_a",
                    when_outcome_key: "outcome_a",
                    targets: [{ kind: "move_to_stage", stage_key: "escalated_review" }],
                },
                {
                    rule_key: "rule_b",
                    when_outcome_key: "outcome_b",
                    targets: [{ kind: "move_to_stage", stage_key: "escalated_review" }],
                },
            ],
        };
        const transitions = resolveOutgoingProcessTransitions({
            currentStageKey: "payment_follow_up",
            stageOperatingPlan: plan,
            processStages: BILLING_STAGES,
        });
        expect(transitions).toHaveLength(2);
        expect(new Set(transitions.map((t) => t.transition_ref)).size).toBe(2);
        expect(transitions.map((t) => t.label).sort()).toEqual(["Path A", "Path B"]);
    });
});

describe("resolveConfiguredOperatorOptions — billing anti-leakage", () => {
    const resolverInput = {
        tenantConfig: BILLING_STAGES,
        process: { key: "billing", tracks_v1: null },
        stage: {
            key: "payment_follow_up",
            label: "Payment Follow-up",
            operating_plan: BILLING_PLAN_NO_TRANSITIONS,
        },
        actionRegistry: [],
        stageActionCatalog: BILLING_CATALOG,
    };

    it("57 — Billing Process Builder exposes no childcare action options", () => {
        const options = resolveConfiguredOperatorOptions(resolverInput);
        const labels = optionLabels(options).join(" ").toLowerCase();
        const refs = optionRefs(options).join(" ").toLowerCase();
        for (const key of CHILDCARE_ACTION_KEYS) {
            expect(refs).not.toContain(key);
        }
        expect(labels).not.toContain("waitlist");
        expect(labels).not.toContain("tour");
        expect(labels).not.toContain("add child");
        expect(labels).not.toContain("schedule tour");
        expect(labels).not.toContain("close lead");
    });

    it("only catalog and configured transitions appear for billing", () => {
        const actionOptions = resolveWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: BILLING_CATALOG,
            stageOperatingPlan: BILLING_PLAN_WITH_TRANSITION,
            processStages: BILLING_STAGES,
            stageKey: "payment_follow_up",
            stageLabel: "Payment Follow-up",
            stageOutcomes: [],
        });

        const actionRefs = [
            ...actionOptions.primaryActionOptions,
            ...actionOptions.helpfulActionOptions,
        ].map((row) => row.ref);
        expect(actionRefs).toContain("send_reminder");
        expect(actionRefs).toContain("record_payment");
        expect(actionRefs.some((ref) => CHILDCARE_ACTION_KEYS.includes(ref))).toBe(false);
        expect(actionOptions.alternatePathOptions).toHaveLength(1);
        expect(actionOptions.alternatePathOptions[0]?.label).toBe("Escalate Review");
    });

    it("process with no alternate outgoing transitions returns none", () => {
        const options = resolveWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: BILLING_CATALOG,
            stageOperatingPlan: BILLING_PLAN_NO_TRANSITIONS,
            processStages: BILLING_STAGES,
            stageKey: "payment_follow_up",
            stageOutcomes: [],
        });
        expect(options.alternatePathOptions).toHaveLength(0);
        expect(options.transitionOptions).toHaveLength(0);
    });
});

function mockAction(key: string, label: string) {
    return {
        key,
        label,
        description: null,
        action_type: "button",
        icon: null,
        style: null,
        display_style: "default",
        payload: {},
        workflow_id: null,
    };
}

describe("Current Work runtime filtering", () => {
    it("58 — explicit actions are not supplemented by childcare record-header fallback", () => {
        const classified = classifyRecordHeaderActionsForCurrentWork({
            recordHeaderSlots: {
                primary: [],
                secondary: [
                    mockAction("schedule_tour", "Schedule Tour"),
                    mockAction("send_reminder", "Send Reminder"),
                ],
                header: [],
                overflow: [mockAction("add_child", "Add Child")],
                right_rail: [],
                row_inline: [],
            },
            showOutcomeCompletion: false,
            primaryActionLabel: null,
            allowedActionKeys: new Set(["send_reminder"]),
        });

        expect(classified.supporting.map((a) => a.key)).toEqual(["send_reminder"]);
        expect(classified.alternatePaths.some((a) => a.key.includes("tour"))).toBe(false);
        expect(classified.administrative.some((a) => a.key === "add_child")).toBe(false);
    });

    it("59 — registered but context-incompatible actions are excluded", () => {
        const options = resolveCanonicalWorkTemplateActionOptions({
            actionRegistry: [{ key: "schedule_tour", label: "Schedule Tour" }],
            stageActionCatalog: BILLING_CATALOG,
            stageKey: "payment_follow_up",
        });
        expect(options.some((row) => row.ref === "schedule_tour")).toBe(false);
    });

    it("61 — invalid configured action ref visible for repair in editor", () => {
        const options = resolveConfiguredOperatorOptions({
            ...{
                tenantConfig: BILLING_STAGES,
                process: { key: "billing" },
                stage: { key: "payment_follow_up", operating_plan: BILLING_PLAN_NO_TRANSITIONS },
                actionRegistry: [],
                stageActionCatalog: BILLING_CATALOG,
            },
            includeInvalidConfiguredRefs: true,
            configuredRefs: ["move_to_waitlist"],
        });
        const invalid = options.find((row) => row.ref === "move_to_waitlist");
        expect(invalid?.supported).toBe(false);
        expect(invalid?.disabledReason).toContain("No matching configured option");
    });

    it("62 — invalid configured action ref omitted at runtime when not in repair mode", () => {
        const options = resolveConfiguredOperatorOptions({
            tenantConfig: BILLING_STAGES,
            process: { key: "billing" },
            stage: { key: "payment_follow_up", operating_plan: BILLING_PLAN_NO_TRANSITIONS },
            actionRegistry: [],
            stageActionCatalog: BILLING_CATALOG,
            configuredRefs: ["move_to_waitlist"],
        });
        expect(options.some((row) => row.ref === "move_to_waitlist")).toBe(false);
    });
});

describe("anti-hardcoding certification", () => {
    const root = resolve(__dirname, "../..");

    it("63 — generic option resolver contains no enrollment stage/action allowlist", () => {
        const source = readFileSync(resolve(root, "lib/lifecycle/resolveConfiguredOperatorOptions.ts"), "utf8");
        const canonical = readFileSync(resolve(root, "lib/lifecycle/resolveCanonicalWorkTemplateActionOptions.ts"), "utf8");
        const outgoing = readFileSync(resolve(root, "lib/lifecycle/resolveOutgoingProcessTransitions.ts"), "utf8");
        for (const text of [source, canonical, outgoing]) {
            expect(text).not.toContain("ACTION_BUTTON_LIBRARY");
            expect(text).not.toContain("waitlist_child");
            expect(text).not.toContain("schedule_tour");
            expect(text).not.toContain("enrollmentStageOptions");
        }
    });

    it("64 — stage-name string matching is not used to determine option availability", () => {
        const source = readFileSync(resolve(root, "lib/lifecycle/resolveOutgoingProcessTransitions.ts"), "utf8");
        expect(source).not.toMatch(/stageKey\s*===\s*["']waitlist["']/);
        expect(source).not.toMatch(/includes\(["']tour["']\)/);
    });

    it("65 — process-name string matching is not used to determine option availability", () => {
        const source = readFileSync(resolve(root, "lib/lifecycle/resolveConfiguredOperatorOptions.ts"), "utf8");
        expect(source).not.toContain("ENROLLMENT_PROCESS_KEY");
        expect(source).not.toMatch(/process\.key\s*===/);
    });

    it("resolveStageOutcomeTransitionOptions delegates to configured edges only", () => {
        const withPlan = resolveStageOutcomeTransitionOptions({
            currentStageKey: "payment_follow_up",
            stageOperatingPlan: BILLING_PLAN_WITH_TRANSITION,
            processStages: BILLING_STAGES,
        });
        const withoutPlan = resolveStageOutcomeTransitionOptions({
            currentStageKey: "payment_follow_up",
            processStages: BILLING_STAGES,
        });
        expect(withPlan).toHaveLength(1);
        expect(withoutPlan).toHaveLength(0);
    });
});
