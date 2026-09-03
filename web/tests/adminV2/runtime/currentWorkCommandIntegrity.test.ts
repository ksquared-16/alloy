/**
 * Slice F — command integrity.
 *
 * Every visible enabled action must be provably executable. Each action VM carries a resolved
 * execution state (executable | disabled | blocked | hidden | configuration_error) derived from
 * capability resolution + metadata only — no action-name/label/process branches. The state reuses
 * the Action Runtime blocker vocabulary; it never renders enabled when the capability does not
 * resolve to a supported host with a valid binding (no no-op buttons).
 */

import { describe, expect, it } from "vitest";

import {
    isCurrentWorkActionExecutable,
    isOperatorVisibleActionStatus,
    resolveCurrentWorkActionExecution,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import { buildCurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

function action(
    partial: Partial<CurrentWorkActionVM> & Pick<CurrentWorkActionVM, "key" | "label" | "category" | "placement">,
): CurrentWorkActionVM {
    return { description: null, handlerKey: partial.key, actionRef: partial.key, ...partial };
}

function resolvedFor(key: string): CurrentWorkActionVM["resolved"] {
    return {
        key,
        label: key,
        description: null,
        action_type: "registry",
        icon: null,
        style: null,
        display_style: "outline",
        payload: {},
        workflow_id: null,
    };
}

describe("resolveCurrentWorkActionExecution", () => {
    it("marks a registry-resolved command executable", () => {
        const exec = resolveCurrentWorkActionExecution(
            action({
                key: "send_form",
                label: "Send Form",
                category: "supporting",
                placement: "current_work_supporting",
                handlerKey: "send_form",
                resolved: resolvedFor("send_form"),
            }),
        );
        expect(exec.status).toBe("executable");
        expect(exec.blockers).toEqual([]);
    });

    it("marks an inline-form capability executable", () => {
        const exec = resolveCurrentWorkActionExecution(
            action({
                key: "schedule_tour",
                label: "Schedule Tour",
                category: "supporting",
                placement: "current_work_supporting",
                handlerKey: "schedule_tour",
            }),
        );
        expect(exec.status).toBe("executable");
    });

    it("marks a process transition with a destination executable", () => {
        const exec = resolveCurrentWorkActionExecution(
            action({
                key: "tr:lead->tour",
                label: "Move to Tour",
                category: "alternate_path",
                placement: "current_work_alternate_paths",
                handlerKey: "process_stage_transition",
                actionRef: "tour",
            }),
        );
        expect(exec.status).toBe("executable");
    });

    it("flags an unresolved capability as a configuration error (never executable)", () => {
        const exec = resolveCurrentWorkActionExecution(
            action({
                key: "totally_unknown_zzz",
                label: "Do Nothing",
                category: "administrative",
                placement: "manage_overflow",
                handlerKey: "totally_unknown_zzz",
                actionRef: "totally_unknown_zzz",
                // No canonical capability, no registry-resolved handler → no runnable binding.
            }),
        );
        expect(exec.status).toBe("configuration_error");
        expect(exec.blockers[0]?.code).toBe("unsupported_capability");
        expect(isCurrentWorkActionExecutable({ ...action({ key: "totally_unknown_zzz", label: "Do Nothing", category: "administrative", placement: "manage_overflow" }) })).toBe(false);
    });

    it("distinguishes disabled (no reason) from blocked (stated reason)", () => {
        const disabled = resolveCurrentWorkActionExecution(
            action({
                key: "send_form",
                label: "Send Form",
                category: "supporting",
                placement: "current_work_supporting",
                resolved: resolvedFor("send_form"),
                disabled: true,
            }),
        );
        expect(disabled.status).toBe("disabled");

        const blocked = resolveCurrentWorkActionExecution(
            action({
                key: "send_form",
                label: "Send Form",
                category: "supporting",
                placement: "current_work_supporting",
                resolved: resolvedFor("send_form"),
                disabled: true,
                disabledReason: "Add a phone number in Household first.",
            }),
        );
        expect(blocked.status).toBe("blocked");
        expect(blocked.blockers[0]?.message).toContain("Household");
    });

    it("hides an action with no key/label", () => {
        const exec = resolveCurrentWorkActionExecution(
            action({ key: "", label: "", category: "supporting", placement: "current_work_supporting" }),
        );
        expect(exec.status).toBe("hidden");
    });

    it("keeps configuration errors and hidden actions out of the operator view", () => {
        expect(isOperatorVisibleActionStatus("executable")).toBe(true);
        expect(isOperatorVisibleActionStatus("disabled")).toBe(true);
        expect(isOperatorVisibleActionStatus("blocked")).toBe(true);
        expect(isOperatorVisibleActionStatus("configuration_error")).toBe(false);
        expect(isOperatorVisibleActionStatus("hidden")).toBe(false);
    });

    it("classifies by capability metadata, not by label/process (second-BP parity)", () => {
        // Same declared binding, arbitrary non-enrollment label/key → still executable.
        const exec = resolveCurrentWorkActionExecution(
            action({
                key: "widget_intake_step",
                label: "Log widget intake",
                category: "supporting",
                placement: "current_work_supporting",
                handlerKey: "widget_intake_step",
                resolved: resolvedFor("widget_intake_step"),
            }),
        );
        expect(exec.status).toBe("executable");
    });
});

describe("isCurrentWorkActionExecutable prefers the VM-threaded state", () => {
    it("reads action.execution when present", () => {
        const executable = { ...action({ key: "x", label: "X", category: "supporting", placement: "current_work_supporting" }), execution: { status: "executable" as const, blockers: [] } };
        const broken = { ...action({ key: "x", label: "X", category: "supporting", placement: "current_work_supporting" }), execution: { status: "configuration_error" as const, blockers: [] } };
        expect(isCurrentWorkActionExecutable(executable)).toBe(true);
        expect(isCurrentWorkActionExecutable(broken)).toBe(false);
    });
});

describe("buildCurrentWorkSurfaceVM threads execution state onto every action", () => {
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
                outcomes: plan.outcomes.filter((o) => o.work_template_key === "contact_family"),
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
        const ctx: OperationalContext = {
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
        ctx.recordHeaderActions = {
            primary: [],
            secondary: [
                { key: "schedule_tour", label: "Schedule Tour", description: null, action_type: "registry", icon: null, style: null, display_style: "outline", payload: {}, workflow_id: null },
            ],
            overflow: [],
            right_rail: [],
            row_inline: [],
            header: [],
        };
        return ctx;
    }

    it("attaches a resolved execution state to supporting actions", () => {
        const vm = buildCurrentWorkSurfaceVM({ context: context(runtimeForLead()) });
        expect(vm.supportingActions.length).toBeGreaterThan(0);
        for (const a of vm.supportingActions) {
            expect(a.execution).toBeTruthy();
            expect(a.execution?.status).toBeTypeOf("string");
        }
        // A visible supporting action must be provably executable.
        expect(vm.supportingActions.every((a) => a.execution?.status === "executable")).toBe(true);
    });
});
