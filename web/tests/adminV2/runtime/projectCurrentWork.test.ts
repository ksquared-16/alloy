import { describe, expect, it } from "vitest";

import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type {
    OperationalContext,
    OperationalContextSignals,
} from "@/lib/adminV2/runtime/operationalContext/types";
import {
    formatCurrentWorkProgress,
    projectCurrentWork,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import { inferWorkItemOwner } from "@/lib/adminV2/runtime/focusPanel/currentWork/inferWorkItemOwner";

function stageRuntime(): StageWorkRuntimeProjection {
    const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: plan.purpose ?? "Reach the family and determine next steps.",
        journey_segment: "family",
        template_keys: ["contact_family"],
        primary: {
            template_key: "contact_family",
            label: "Contact Family",
            description: "Reach the family, understand their needs, and determine the next step.",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "work-primary",
            due_at: new Date().toISOString(),
            due_urgency: "due_today",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: plan.outcomes,
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: buildStageWorkOutcomeAutomationPreview({
                plan,
                templateKey: "contact_family",
            }),
        },
        additional: [],
        execution: {
            department_id: "dept-1",
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
            requires_outcome_picker: true,
        },
    };
}

function context(partial: {
    runtime?: StageWorkRuntimeProjection | null;
    signals?: Partial<OperationalContextSignals>;
}): OperationalContext {
    const signals: OperationalContextSignals = {
        work: {
            primary: null,
            items: [],
            openCount: 0,
            overdueCount: 0,
            nextActionLabel: null,
        },
        attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
        tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
        communications: {
            scheduledSendCount: 0,
            nextFollowUpAt: null,
            hasOutreach: false,
            nextScheduledSendId: null,
        },
        billing: {
            billingConfigured: false,
            billingContactName: null,
            billingContactEmail: null,
            tuitionRateLabel: null,
            feeBalanceCents: null,
        },
        ...partial.signals,
    };
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Digan Family" },
        businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
        perspective: null,
        truth: { id: "opp-1" },
        signals,
        stageWorkRuntime: partial.runtime ?? null,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

describe("projectCurrentWork", () => {
    it("is empty when stage runtime is absent — no synthesized work from signals", () => {
        const vm = projectCurrentWork(context({ runtime: null }));
        expect(vm.isEmpty).toBe(true);
        expect(vm.title).toBe("No current work configured");
        expect(vm.primaryActionLabel).toBeNull();
        expect(vm.checklist).toHaveLength(0);
    });

    it("projects title, purpose, progress, and checklist from stage runtime", () => {
        const vm = projectCurrentWork(context({ runtime: stageRuntime() }));
        expect(vm.title).toBe("Contact Family");
        expect(vm.purpose).toContain("Reach the family");
        expect(vm.checklist).toHaveLength(1);
        expect(vm.primaryActionLabel).toBe("Record outcome");
        expect(vm.showOutcomeCompletion).toBe(true);
    });

    it("does not expose stage_key mutation paths", () => {
        const source = projectCurrentWork.toString();
        expect(source).not.toContain("stage_key");
    });

    it("does not label-infer an owner for stage-work checklist items (Slice E: metadata-only ownership)", () => {
        // "Contact Family" is WORK, not a data requirement. The prior behavior routed it to
        // Communications purely from its label (inferWorkItemOwner regex) — that heuristic was
        // removed from the surface path. A stage-work row now carries no data-owning card.
        const vm = projectCurrentWork(context({ runtime: stageRuntime() }));
        const contact = vm.checklist.find((item) => item.label === "Contact Family");
        expect(contact?.ownerCard).toBeNull();
        expect(contact?.handoffKind).toBeNull();
    });

    it("exposes all configured completion outcomes from stage runtime", () => {
        const vm = projectCurrentWork(context({ runtime: stageRuntime() }));
        const keys = vm.completionOutcomes.map((o) => o.outcome_key).sort();
        expect(keys).toEqual([
            "interested",
            "left_message",
            "needs_follow_up",
            "not_interested",
            "reached_family",
        ]);
    });

    it("exposes contact-family communication outcomes when that work is primary", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        const runtime = stageRuntime();
        runtime.primary = {
            template_key: "contact_family",
            label: "Contact Family",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "work-contact",
            due_at: null,
            due_urgency: "none",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: plan.outcomes,
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: [],
        };
        runtime.additional = [];
        const vm = projectCurrentWork(context({ runtime }));
        expect(vm.title).toBe("Contact Family");
        expect(vm.completionOutcomes.map((o) => o.outcome_key).sort()).toEqual([
            "interested",
            "left_message",
            "needs_follow_up",
            "not_interested",
            "reached_family",
        ]);
    });
});

describe("formatCurrentWorkProgress", () => {
    it("formats operator-facing progress", () => {
        expect(formatCurrentWorkProgress(2, 3)).toBe("2 of 3 complete");
    });
});

function work(label: string) {
    return {
        id: "1",
        label,
        state: "open" as const,
        dueLabel: null,
        dueAt: null,
        urgency: null,
        source: null,
        kind: "stage_work" as const,
    };
}

describe("inferWorkItemOwner", () => {
    it("routes outreach (message/call/contact) to Communications", () => {
        expect(inferWorkItemOwner(work("Message family"))?.card).toBe("communications");
        expect(inferWorkItemOwner(work("Contact Family"))?.card).toBe("communications");
        expect(inferWorkItemOwner(work("Call the family"))?.card).toBe("communications");
    });

    it("routes contact-data verification to Household", () => {
        expect(inferWorkItemOwner(work("Verify contact info"))?.card).toBe("household");
        expect(inferWorkItemOwner(work("Find phone number"))?.card).toBe("household");
        expect(inferWorkItemOwner(work("Update missing email"))?.card).toBe("household");
    });
});

describe("projectCurrentWork supporting actions", () => {
    it("projects supporting actions from record_header registry slots", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        const runtime = stageRuntime();
        runtime.primary = {
            template_key: "contact_family",
            label: "Contact Family",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "work-contact",
            due_at: null,
            due_urgency: "none",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: plan.outcomes,
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: [],
        };
        const ctx = context({ runtime });
        ctx.recordHeaderActions = {
            primary: [],
            secondary: [
                {
                    key: "schedule_tour",
                    label: "Schedule Tour",
                    description: null,
                    action_type: "registry",
                    icon: null,
                    style: null,
                    display_style: "outline",
                    payload: {},
                    workflow_id: null,
                },
                {
                    key: "close_lead",
                    label: "Close Lead",
                    description: null,
                    action_type: "registry",
                    icon: null,
                    style: null,
                    display_style: "outline",
                    payload: {},
                    workflow_id: null,
                },
            ],
            overflow: [],
            right_rail: [],
            row_inline: [],
            header: [],
        };
        const vm = projectCurrentWork(ctx);
        expect(vm.supportingActions.map((a) => a.key)).toEqual(["schedule_tour"]);
        expect(vm.supportingActionLabels).toEqual(["Schedule Tour"]);
    });
});
