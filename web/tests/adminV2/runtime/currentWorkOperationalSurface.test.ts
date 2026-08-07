import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildCurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import { buildOutcomeCompletionSummary } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildOutcomeCompletionSummary";
import { classifyRecordHeaderActionsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/classifyCurrentWorkActions";
import { projectCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import { resolveCurrentWorkTemplateFromPublishedPlan } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan";
import { resolvePublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import { stageOperatingPlanDraftToPersisted } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type {
    OperationalContext,
    OperationalContextSignals,
} from "@/lib/adminV2/runtime/operationalContext/types";
import type { CurrentWorkTemplateConfigOverlay } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkTemplateConfig";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import { LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import {
    billingCollectPaymentPublishedDepartmentMetadata,
    buildEnrollmentRecordTruth,
    enrollmentLeadPublishedDepartmentMetadata,
    enrollmentLeadWithFieldRulesPublishedDepartmentMetadata,
    applyEnrollmentLeadWorkTemplateActions,
    type EnrollmentFixtureChild,
} from "./fixtures/currentWorkPublishedPlanFixtures";

const NULL_SIGNALS: OperationalContextSignals = {
    work: {
        primary: null,
        items: [],
        openCount: 0,
        overdueCount: 0,
        nextActionLabel: null,
    },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
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
};

function baseContext(partial: Partial<OperationalContext>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Test Family" },
        businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
        perspective: null,
        truth: {},
        signals: NULL_SIGNALS,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
        ...partial,
    };
}

function billingTemplateConfig(): CurrentWorkTemplateConfigOverlay {
    return {
        work_key: "collect_payment",
        title: "Collect Payment",
        description: "Collect payment for July 2026.",
        checklist: [
            { key: "invoice_sent", label: "Invoice sent", required: true },
            { key: "reminder_sent", label: "Reminder sent", required: true },
            { key: "payment_received", label: "Payment received", required: true },
            { key: "posted", label: "Posted", required: true },
        ],
        primary_action: { action_ref: "record_payment" },
        helpful_actions: [
            { action_ref: "send_reminder" },
            { action_ref: "payment_plan" },
            { action_ref: "send_email" },
            { action_ref: "adjust_invoice" },
        ],
        helpful_actions_explicit: true,
        alternate_paths: [{ action_ref: "waive_fee" }, { action_ref: "escalate_to_director" }],
        alternate_paths_explicit: true,
        outcome_refs: [
            { outcome_ref: "paid" },
            { outcome_ref: "payment_plan_created" },
            { outcome_ref: "unable_to_collect" },
        ],
        outcome_refs_explicit: true,
    };
}

function enrollmentPublishedInputs() {
    return resolvePublishedStageInputsForCurrentWork({
        departmentMetadata: enrollmentLeadPublishedDepartmentMetadata(),
        builderStageKey: "lead",
    })!;
}

function billingPublishedInputs() {
    return resolvePublishedStageInputsForCurrentWork({
        departmentMetadata: billingCollectPaymentPublishedDepartmentMetadata(),
        builderStageKey: "collect_payment",
    })!;
}

function enrollmentFieldRulesPublishedInputs() {
    return resolvePublishedStageInputsForCurrentWork({
        departmentMetadata: enrollmentLeadWithFieldRulesPublishedDepartmentMetadata(),
        builderStageKey: "lead",
    })!;
}

function makePublishedEnrollmentFixture(options: {
    children?: EnrollmentFixtureChild[];
    stageWorkRuntime?: StageWorkRuntimeProjection | null;
}) {
    const publishedStageInputs = enrollmentFieldRulesPublishedInputs();
    return buildCurrentWorkSurfaceVM({
        context: baseContext({
            truth: buildEnrollmentRecordTruth({ children: options.children ?? [] }),
            publishedStageInputs,
            stageWorkRuntime: options.stageWorkRuntime ?? null,
        }),
    });
}

function enrollmentContactRuntime(): StageWorkRuntimeProjection {
    const defaults = applyEnrollmentLeadWorkTemplateActions(defaultStageOperatingPlanForEnrollmentStage("lead")!);
    const contactTemplate = defaults.work_templates.find((t) => t.template_key === "contact_family")!;
    const plan = stageOperatingPlanDraftToPersisted(
        {
            purpose: defaults.purpose ?? "",
            journey_segment: defaults.journey_segment,
            work_templates: [{ ...contactTemplate, primary: true }],
            outcomes: defaults.outcomes.filter((o) => o.work_template_key === "contact_family"),
            outcome_rules: defaults.outcome_rules,
            attention_rules: defaults.attention_rules,
        },
        "lead",
    )!;
    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: plan.purpose ?? "",
        journey_segment: plan.journey_segment,
        template_keys: ["contact_family"],
        primary: {
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

function slots(partial: Partial<ResolvedActionsBySlot>): ResolvedActionsBySlot {
    return {
        primary: [],
        secondary: [],
        overflow: [],
        right_rail: [],
        row_inline: [],
        header: [],
        ...partial,
    };
}

describe("Current Work operational surface", () => {
    it("builds enrollment current work from published operating plan configuration", () => {
        const runtime = enrollmentContactRuntime();
        const publishedStageInputs = enrollmentPublishedInputs();
        const vm = projectCurrentWork(
            baseContext({
                stageWorkRuntime: runtime,
                publishedStageInputs,
            }),
        );

        expect(vm.title).toBe("Contact Family");
        expect(vm.surface.processKey).toBe("enrollment");
        expect(vm.showOutcomeCompletion).toBe(true);
        expect(vm.surface.primaryAction?.label).toBe("Contact Family");
        expect(vm.surface.recordOutcomeAction?.label).toBe("Record outcome");
        expect(vm.checklist.map((item) => item.label)).toEqual(
            expect.arrayContaining(["Review Lead", "Contact Family", "Confirm fit — location, program, start date"]),
        );
        expect(vm.surface.supportingActions.map((a) => a.key)).toEqual([
            "schedule_tour",
            "quick_message",
            "add_child",
            "send_form",
        ]);
        // Other Transitions are process-owned outgoing edges (not WT alternate_paths).
        expect(vm.surface.alternatePaths.length).toBeGreaterThan(0);
        expect(vm.surface.alternatePaths.every((a) => a.handlerKey === "process_stage_transition")).toBe(
            true,
        );
        expect(vm.surface.alternatePaths.map((a) => a.key)).not.toContain("close_lead");
    });

    it("builds billing current work from published operating plan configuration", () => {
        const publishedStageInputs = billingPublishedInputs();
        const vm = projectCurrentWork(
            baseContext({
                businessProcess: { key: "billing", label: "Billing", stageKey: "collect_payment" },
                stageWorkRuntime: null,
                publishedStageInputs,
            }),
        );

        expect(vm.title).toBe("Collect Payment");
        expect(vm.purpose).toBe("Collect payment for July 2026.");
        expect(vm.checklist.map((item) => item.label)).toEqual(["Collect Payment"]);
        expect(vm.surface.supportingActions.map((a) => a.key)).toEqual([
            "send_reminder",
            "payment_plan",
            "send_email",
            "adjust_invoice",
        ]);
        // Billing fixtures without process edges expose no Other Transitions from WT alternate_paths.
        expect(vm.surface.alternatePaths).toEqual([]);
        expect(vm.surface.supportingActions.map((a) => a.key)).not.toContain("schedule_tour");
        expect(vm.surface.supportingActions.map((a) => a.key)).not.toContain("add_child");
    });

    it("preserves stage runtime checklist fallback when no published overlay exists", () => {
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({ stageWorkRuntime: enrollmentContactRuntime() }),
        });

        expect(vm.checklist.some((item) => item.label === "Contact Family")).toBe(true);
    });

    it("builds billing overlay directly via production resolver adapter", () => {
        const resolved = resolveCurrentWorkTemplateFromPublishedPlan({
            ...billingPublishedInputs(),
            stageWorkRuntime: null,
            recordHeaderActions: null,
        })!;

        expect(resolved.templateConfig.title).toBe("Collect Payment");
        expect(resolved.templateConfig.helpful_actions?.map((a) => a.action_ref)).toEqual([
            "send_reminder",
            "payment_plan",
            "send_email",
            "adjust_invoice",
        ]);
        expect(resolved.templateConfig.helpful_actions_explicit).toBe(true);
        // Runtime Other Transitions come from process edges; WT alternate_paths are not the source.
        expect(resolved.templateConfig.alternate_paths ?? []).toEqual([]);
    });

    it("supports explicit template overlay for fixture-only billing checklist extensions", () => {
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({
                businessProcess: { key: "billing", label: "Billing", stageKey: "collect_payment" },
                stageWorkRuntime: null,
            }),
            templateConfig: billingTemplateConfig(),
            completedChecklistKeys: new Set(["invoice_sent"]),
        });

        expect(vm.progress).toMatchObject({
            completed: 1,
            total: 4,
            percent: 25,
        });
    });

    it("absorbs readiness requirements into current work checklist", () => {
        const readiness: ReadinessResult = {
            contract_version: "1.0",
            primary_state: "needs_information",
            trigger: "record_view",
            subject: { entity_type: "opportunity", entity_id: "opp-1" },
            context: { org_id: "org-1" },
            gaps: [
                {
                    requirement_id: "program_selected",
                    scope_type: "record",
                    level: "required",
                    label: "Program selected",
                    missing_reason: "No program on file",
                    failure_kind: "missing",
                    blocking: true,
                    entity_type: "child",
                    resolution: { type: "action", action_key: "choose_program" },
                },
            ],
            counts: {
                gaps_total: 1,
                by_level: { recommended: 0, required: 1, enforced: 0 },
                blocking: 1,
                satisfied: 0,
                configured: 1,
            },
            ok: false,
        };

        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({
                stageWorkRuntime: enrollmentContactRuntime(),
                publishedStageInputs: enrollmentPublishedInputs(),
            }),
            readinessProjection: readiness,
        });

        expect(vm.checklist.some((item) => item.key === "program_selected")).toBe(true);
        expect(vm.checklist.find((item) => item.key === "program_selected")?.status).toBe("blocked");
    });

    it("places supporting actions from Work Template config, not header invent", () => {
        const withPublished = projectCurrentWork(
            baseContext({
                stageWorkRuntime: enrollmentContactRuntime(),
                publishedStageInputs: enrollmentPublishedInputs(),
            }),
        );
        expect(withPublished.surface.supportingActions.map((a) => a.key)).toContain("schedule_tour");

        // Config fidelity: record-header secondary slots alone must not invent What's Next helpful.
        const headerOnly = projectCurrentWork(
            baseContext({
                stageWorkRuntime: enrollmentContactRuntime(),
                recordHeaderActions: slots({
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
                    ],
                }),
            }),
        );
        expect(headerOnly.surface.supportingActions.map((a) => a.key)).not.toContain("schedule_tour");
    });

    it("keeps administrative actions out of operational progression", () => {
        const classified = classifyRecordHeaderActionsForCurrentWork({
            recordHeaderSlots: slots({
                overflow: [
                    {
                        key: "archive_lead",
                        label: "Archive Lead",
                        description: null,
                        action_type: "registry",
                        icon: null,
                        style: null,
                        display_style: "outline",
                        payload: {},
                        workflow_id: null,
                    },
                ],
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
                ],
            }),
            showOutcomeCompletion: true,
            primaryActionLabel: "Record outcome",
        });

        expect(classified.administrative.map((a) => a.key)).toEqual(["archive_lead"]);
        expect(classified.supporting.map((a) => a.key)).toEqual(["schedule_tour"]);
    });

    it("renders alternate paths separately from supporting actions", () => {
        const classified = classifyRecordHeaderActionsForCurrentWork({
            recordHeaderSlots: slots({
                secondary: [
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
                ],
            }),
            showOutcomeCompletion: true,
            primaryActionLabel: "Record outcome",
            allowedActionKeys: new Set(["close_lead", "schedule_tour"]),
        });

        expect(classified.alternatePaths.map((a) => a.key)).toEqual(["close_lead"]);
        expect(classified.supporting.map((a) => a.key)).toEqual(["schedule_tour"]);
    });

    it("summarizes outcome completion without workflow debug language", () => {
        const runtime = enrollmentContactRuntime();
        const item = runtime.primary!;
        const summary = buildOutcomeCompletionSummary({
            workItem: item,
            outcomeKey: "left_message",
            effectLines: ["Continue Contact Family work", "Continue Contact Family work"],
        });

        expect(summary.summary).toBe("Current Work will continue.");
        expect(summary.changeLines.join(" ")).not.toMatch(/^Will$/i);
        expect(summary.changeLines.join(" ")).not.toContain("Confirm result");
    });

    it("resolves published enrollment field-rule checklist completion from record truth", () => {
        const vm = makePublishedEnrollmentFixture({
            children: [
                {
                    name: "Robbie",
                    program: "prog-preschool",
                    schedule: "full_time",
                    startDate: "2026-08-01",
                },
            ],
        });

        expect(vm.checklist.find((item) => item.key === "child:first_name")?.status).toBe("complete");
        expect(vm.checklist.find((item) => item.key === "child:program_interest")?.status).toBe("complete");
        expect(vm.checklist.find((item) => item.key === "child:desired_schedule")?.status).toBe("complete");
        expect(vm.checklist.find((item) => item.key === "child:start_date")?.status).toBe("complete");
    });

    it("resolves published child-scoped field-rule checklist gaps as missing", () => {
        const vm = makePublishedEnrollmentFixture({
            children: [
                { name: "Robbie", program: null, schedule: null, startDate: null },
                { name: "Zara", program: null, schedule: null, startDate: null },
            ],
        });

        expect(vm.checklist.find((item) => item.key === "child:program_interest")).toMatchObject({
            status: "missing",
            scope: "child",
            targetLabel: "Children",
        });
        expect(vm.checklist.find((item) => item.key === "child:program_interest")?.description).toContain("2");
    });

    it("renders billing published checklist without enrollment-specific truth branches", () => {
        const vm = projectCurrentWork(
            baseContext({
                businessProcess: { key: "billing", label: "Billing", stageKey: "collect_payment" },
                publishedStageInputs: billingPublishedInputs(),
            }),
        );

        expect(vm.surface.processKey).toBe("billing");
        expect(vm.checklist.length).toBeGreaterThan(0);
        expect(vm.checklist.every((item) => item.label.length > 0)).toBe(true);
    });

    it("prefers explicit templateConfig overlay over published overlay", () => {
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({
                publishedStageInputs: enrollmentFieldRulesPublishedInputs(),
            }),
            templateConfig: billingTemplateConfig(),
            completedChecklistKeys: new Set(["invoice_sent"]),
        });

        expect(vm.title).toBe("Collect Payment");
        expect(vm.checklist.map((item) => item.key)).toEqual([
            "invoice_sent",
            "reminder_sent",
            "payment_received",
            "posted",
        ]);
        expect(vm.progress.completed).toBe(1);
    });

    it("classifies BOS recommendation action separately from direct progress owner", () => {
        const classified = classifyRecordHeaderActionsForCurrentWork({
            recordHeaderSlots: slots({
                secondary: [
                    {
                        key: "ask_bos",
                        label: "Ask BOS",
                        description: null,
                        action_type: "registry",
                        icon: null,
                        style: null,
                        display_style: "outline",
                        payload: {},
                        workflow_id: null,
                    },
                ],
            }),
            showOutcomeCompletion: true,
            primaryActionLabel: "Record outcome",
        });

        expect(classified.bosRecommendations.map((a) => a.key)).toEqual(["ask_bos"]);
        expect(classified.supporting).toEqual([]);
    });

    it("merges catalog alternate paths while filtering generic umbrella lifecycle actions", () => {
        const runtime = enrollmentContactRuntime();
        const publishedStageInputs = enrollmentPublishedInputs();
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({
                stageWorkRuntime: runtime,
                publishedStageInputs,
                recordHeaderActions: slots({
                    secondary: [
                        {
                            key: "update_enrollment_status",
                            label: "Change Enrollment Status",
                            description: null,
                            action_type: "registry",
                            icon: null,
                            style: null,
                            display_style: "outline",
                            payload: {},
                            workflow_id: null,
                        },
                    ],
                }),
            }),
        });

        expect(vm.alternatePaths.every((action) => action.handlerKey === "process_stage_transition")).toBe(
            true,
        );
        expect(vm.alternatePaths.map((a) => a.key)).not.toContain("close_lead");
        expect(vm.supportingActions.map((a) => a.key)).not.toContain("update_enrollment_status");
    });

    it("uses operator-facing labels for published field-rule checklist items", () => {
        const metadata = enrollmentLeadWithFieldRulesPublishedDepartmentMetadata();
        metadata[LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY] = {
            version: 1,
            by_stage_key: {
                lead: {
                    required_rule_ids: ["custom:opportunity:schools"],
                    recommended_rule_ids: [],
                },
            },
        };
        const publishedStageInputs = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: metadata,
            builderStageKey: "lead",
        })!;
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext({
                publishedStageInputs,
                stageWorkRuntime: enrollmentContactRuntime(),
            }),
        });

        const schools = vm.checklist.find((item) => item.key === "custom:opportunity:schools");
        expect(schools?.label).toBe("Schools");
        expect(schools?.label).not.toContain("custom:");
    });

    it("does not hardcode enrollment action keys in presentation components", () => {
        const cardSource = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/cards/CurrentWorkCard.tsx"),
            "utf8",
        );
        expect(cardSource).not.toMatch(/\bclose_lead\b/);
        expect(cardSource).not.toMatch(/\bschedule_tour\b/);
        expect(cardSource).not.toMatch(/\bcontact_family\b/);
        expect(cardSource).not.toMatch(/Open work →/);
    });

    it("does not hardcode helpful actions or alternate paths in the surface builder", () => {
        const builderSource = readFileSync(
            path.join(
                process.cwd(),
                "lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM.ts",
            ),
            "utf8",
        );
        const resolverSource = readFileSync(
            path.join(
                process.cwd(),
                "lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan.ts",
            ),
            "utf8",
        );

        // Tour booking alignment may rewrite schedule_tour → reschedule_tour (presentation truth),
        // but the builder must not invent enrollment/billing action catalogs.
        expect(builderSource).toMatch(/schedule_tour/);
        expect(builderSource).toContain("alignTourScheduleActionForBookingState");
        expect(builderSource).not.toMatch(/\bclose_lead\b/);
        expect(builderSource).not.toMatch(/\bwaive_fee\b/);
        expect(resolverSource).not.toMatch(/\bschedule_tour\b/);
        expect(resolverSource).not.toMatch(/\bclose_lead\b/);
        expect(resolverSource).not.toMatch(/\bwaive_fee\b/);
    });

    it("does not hardcode enrollment checklist keys in checklist truth resolver", () => {
        const resolverSource = readFileSync(
            path.join(
                process.cwd(),
                "lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkChecklistTruthFromPublishedRules.ts",
            ),
            "utf8",
        );
        expect(resolverSource).not.toMatch(/\bprogram_selected\b/);
        expect(resolverSource).not.toMatch(/\bchildren_added\b/);
        expect(resolverSource).not.toMatch(/processKey === "enrollment"/);
    });
});
