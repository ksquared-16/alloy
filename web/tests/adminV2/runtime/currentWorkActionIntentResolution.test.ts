import { describe, expect, it } from "vitest";

import { buildCurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import type { OperationalContext, OperationalContextSignals } from "@/lib/adminV2/runtime/operationalContext/types";
import type { CurrentWorkTemplateConfigOverlay } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkTemplateConfig";

const NULL_SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
    communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
    billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
};

function baseContext(partial: Partial<OperationalContext> = {}): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Test" },
        businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
        perspective: null,
        truth: {},
        signals: NULL_SIGNALS,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
        ...partial,
    };
}

describe("Current Work intent-first template actions", () => {
    it("ignores Work Template alternate_paths in favor of process-owned transitions", () => {
        const templateConfig: CurrentWorkTemplateConfigOverlay = {
            work_key: "contact_family",
            alternate_paths: [
                { action_ref: "move_to_waitlist" },
                { action_ref: "waitlist_child" },
            ],
            alternate_paths_explicit: true,
        };

        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({
                publishedStageInputs: {
                    operatingPlan: {
                        version: 1,
                        lifecycle_key: "enrollment",
                        stage_key: "lead",
                        journey_segment: "child",
                        work_templates: [],
                        outcomes: [],
                        outcome_rules: [],
                        attention_rules: [],
                    },
                    actionCatalog: null,
                    fieldRules: null,
                    processKey: "enrollment",
                    stageKey: "lead",
                    departmentMetadata: {},
                    processStages: [],
                },
            }),
            templateConfig,
        });

        // No process outgoing edges in this fixture → no Other Transitions.
        expect(vm.alternatePaths).toEqual([]);
    });

    it("keeps explicit empty helpful actions when explicitly configured", () => {
        const templateConfig: CurrentWorkTemplateConfigOverlay = {
            work_key: "contact_family",
            helpful_actions: [],
            helpful_actions_explicit: true,
        };

        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({
                recordHeaderActions: {
                    primary: [],
                    secondary: [{ key: "schedule_tour", label: "Schedule tour", description: null, action_type: "registry", icon: null, style: null, display_style: "outline", payload: {}, workflow_id: null }],
                    header: [],
                    overflow: [],
                    right_rail: [],
                    row_inline: [],
                },
            }),
            templateConfig,
        });

        expect(vm.supportingActions).toHaveLength(0);
    });

    it("prefers explicit template primary action over fallback work title", () => {
        const templateConfig: CurrentWorkTemplateConfigOverlay = {
            work_key: "contact_family",
            title: "Contact Family",
            primary_action: { action_ref: "schedule_tour", override_label: "Book tour" },
        };

        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext(),
            templateConfig,
        });

        expect(vm.primaryAction?.actionRef).toBe("schedule_tour");
        expect(vm.primaryAction?.label).toBe("Book tour");
        expect(vm.primaryAction?.handlerKey).toBe("schedule_tour");
    });

    it("routes schedule_tour through inline_form unchanged", () => {
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext(),
            templateConfig: {
                work_key: "schedule",
                primary_action: { action_ref: "schedule_tour" },
            },
        });

        expect(
            resolveCurrentWorkActionSurface({
                key: vm.primaryAction!.key,
                handlerKey: vm.primaryAction!.handlerKey,
                actionRef: vm.primaryAction!.actionRef,
                category: "primary",
            }),
        ).toBe("inline_form");
    });

    it("does not execute raw mutation_command through action surface", () => {
        expect(
            resolveCurrentWorkActionSurface({
                key: "mutation_command",
                handlerKey: "mutation_command",
                actionRef: "mutation_command",
                category: "supporting",
            }),
        ).toBe("unsupported");
    });
});
