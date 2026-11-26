/**
 * Slice D — generic outcomes + transitions.
 *
 * Configured completion outcomes and BP lifecycle transitions resolve through ONE generic
 * contract (CurrentWorkResolutionVM), each carrying label / handler / target / effect /
 * confirmation / execution state. No hardcoded target-state logic; targets come from runtime.
 * Works for any process (non-enrollment fixture included).
 */

import { describe, expect, it } from "vitest";

import { buildCurrentWorkResolutions } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkResolutions";
import { buildCurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import type { CurrentWorkActionVM, CurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

type ResolutionInputs = Parameters<typeof buildCurrentWorkResolutions>[0];

function transition(key: string, label: string, target: string): CurrentWorkActionVM {
    return {
        key,
        label,
        description: `Transition to ${label}`,
        category: "alternate_path",
        placement: "current_work_alternate_paths",
        handlerKey: "process_stage_transition",
        actionRef: target,
        resolved: null,
    };
}

function inputs(partial: Partial<ResolutionInputs> = {}): ResolutionInputs {
    return {
        completionOutcomes: [],
        alternatePaths: [],
        primaryWorkItem: null,
        showOutcomeCompletion: true,
        outcomeCompletionBlockReason: null,
        ...partial,
    };
}

describe("buildCurrentWorkResolutions", () => {
    it("unifies configured outcomes and transitions into one contract", () => {
        const resolutions = buildCurrentWorkResolutions(
            inputs({
                completionOutcomes: [
                    { outcome_key: "reached", label: "Reached Family" },
                    { outcome_key: "left_message", label: "Left Message" },
                ],
                alternatePaths: [transition("tr:lead->tour", "Move to Tour", "tour")],
            }),
        );
        expect(resolutions.map((r) => r.kind)).toEqual(["outcome", "outcome", "transition"]);
        const outcome = resolutions.find((r) => r.kind === "outcome")!;
        expect(outcome.handlerKey).toBe("record_outcome");
        expect(outcome.targetKey).toBe("reached");
        expect(outcome.requiresConfirmation).toBe(true);
        expect(outcome.execution.status).toBe("executable");
    });

    it("derives the transition destination from runtime metadata, never a hardcoded map", () => {
        const [t] = buildCurrentWorkResolutions(
            inputs({ alternatePaths: [transition("tr:lead->tour", "Move to Tour", "tour")] }),
        );
        expect(t.kind).toBe("transition");
        expect(t.handlerKey).toBe("process_stage_transition");
        expect(t.targetKey).toBe("tour");
        expect(t.effect).toEqual(["Transition to Move to Tour"]);
        expect(t.execution.status).toBe("executable");
    });

    it("blocks outcomes with the runtime block reason when they cannot be recorded", () => {
        const [outcome] = buildCurrentWorkResolutions(
            inputs({
                completionOutcomes: [{ outcome_key: "reached", label: "Reached Family" }],
                showOutcomeCompletion: false,
                outcomeCompletionBlockReason: "Complete the required fields first.",
            }),
        );
        expect(outcome.execution.status).toBe("blocked");
        expect(outcome.execution.blockers[0]?.message).toContain("required fields");
    });

    it("is process-agnostic — a non-enrollment fixture resolves identically", () => {
        const resolutions = buildCurrentWorkResolutions(
            inputs({
                completionOutcomes: [{ outcome_key: "inspection_passed", label: "Inspection passed" }],
                alternatePaths: [transition("tr:triage->scheduled", "Move to Scheduled", "scheduled")],
            }),
        );
        expect(resolutions.find((r) => r.kind === "outcome")?.targetKey).toBe("inspection_passed");
        expect(resolutions.find((r) => r.kind === "transition")?.targetKey).toBe("scheduled");
        expect(resolutions.every((r) => r.execution.status === "executable")).toBe(true);
    });
});

describe("buildCurrentWorkSurfaceVM exposes the resolution contract", () => {
    function runtimeForLead(): StageWorkRuntimeProjection {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        return {
            stage_key: "lead",
            stage_label: "Lead",
            purpose: plan.purpose ?? "",
            journey_segment: "family",
            template_keys: ["contact_family"],
            primary: {
                template_key: "contact_family",
                label: "Contact Family",
                role: "primary",
                state: "open",
                requires_outcome_picker: true,
                work_id: "work-1",
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
            },
            additional: [],
            execution: {
                department_id: "dept-1",
                subject: { journey_segment: "family", opportunity_id: "opp-1" },
                requires_outcome_picker: true,
            },
        };
    }

    function context(runtime: StageWorkRuntimeProjection): OperationalContext {
        return {
            grain: "case",
            subject: { type: "opportunity", id: "opp-1", label: "Digan Family" },
            businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
            perspective: null,
            truth: { id: "opp-1" },
            stageWorkRuntime: runtime,
            signals: {
                work: { primary: null, items: [], openCount: 1, overdueCount: 0, nextActionLabel: null },
                attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
                tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
                communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
                billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
            },
            capabilities: { canMutate: true, maskedChannels: false },
            status: "ready",
        };
    }

    it("populates surface.resolutions from configured outcomes", () => {
        const vm: CurrentWorkSurfaceVM = buildCurrentWorkSurfaceVM({ context: context(runtimeForLead()) });
        const outcomeResolutions = vm.resolutions.filter((r) => r.kind === "outcome");
        expect(outcomeResolutions.length).toBe(vm.completionOutcomes.length);
        expect(outcomeResolutions.length).toBeGreaterThan(0);
        for (const r of outcomeResolutions) {
            expect(r.handlerKey).toBe("record_outcome");
            expect(r.targetKey).toBeTruthy();
            expect(r.execution.status).toBeTypeOf("string");
        }
    });
});
