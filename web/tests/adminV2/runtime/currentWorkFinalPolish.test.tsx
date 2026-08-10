/**
 * Current Work final product-polish certification.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CurrentWorkCard from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import { buildCurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import { resolvePublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import {
    enrollmentLeadPublishedDepartmentMetadata,
    enrollmentLeadWithFieldRulesPublishedDepartmentMetadata,
} from "@/tests/adminV2/runtime/fixtures/currentWorkPublishedPlanFixtures";

vi.mock("@/components/workIntent/useWorkIntentOutcomeCompletion", () => ({
    useWorkIntentOutcomeCompletion: () => ({
        completeOutcome: vi.fn(async () => {}),
        busy: false,
        error: null,
        clearError: vi.fn(),
    }),
}));

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

function baseContext(runtime: StageWorkRuntimeProjection, overrides?: Partial<OperationalContext>): OperationalContext {
    const published = resolvePublishedStageInputsForCurrentWork({
        departmentMetadata: enrollmentLeadPublishedDepartmentMetadata(),
        builderStageKey: "lead",
    });
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Test Family" },
        businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
        perspective: null,
        truth: { id: "opp-1" },
        stageWorkRuntime: runtime,
        publishedStageInputs: published,
        signals: {
            work: { primary: null, items: [], openCount: 1, overdueCount: 0, nextActionLabel: null },
            attention: { needsAttention: true, primaryReason: "First contact overdue", reasonCount: 1 },
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
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
        ...overrides,
    };
}

const cardModel = {
    key: "current_work" as const,
    title: "Current Work",
    insight: "Contact Family",
    tier: "work" as const,
    span: "row" as const,
    density: "compact" as const,
    visible: true,
    archetype: "status" as const,
};

describe("Other Transitions ownership", () => {
    it("derives Other Transitions from process outgoing edges, not Work Template alternate_paths", () => {
        const vm = buildCurrentWorkSurfaceVM({ context: baseContext(runtimeForLead()) });
        expect(vm.alternatePaths.length).toBeGreaterThan(0);
        expect(vm.alternatePaths.every((row) => row.label.startsWith("Move to "))).toBe(true);
        expect(vm.alternatePaths.some((row) => /close_lead/i.test(row.key))).toBe(false);
    });

    it("shows no Other Transitions when the stage has no outgoing move edges", () => {
        const published = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: enrollmentLeadPublishedDepartmentMetadata(),
            builderStageKey: "lead",
        })!;
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext(runtimeForLead(), {
                publishedStageInputs: {
                    ...published,
                    operatingPlan: { ...published.operatingPlan, outcome_rules: [] },
                    processTracks: null,
                },
            }),
        });
        expect(vm.alternatePaths).toEqual([]);
    });

    it("Work Template editor no longer authors Alternate Paths", () => {
        const editor = readFileSync(
            resolve(__dirname, "../../../components/adminV2/settings/lifecycle/LifecycleStageWorkTemplateActionsEditor.tsx"),
            "utf8",
        );
        expect(editor).not.toContain("work-template-alternate-paths");
        expect(editor).not.toContain(">Alternate Paths<");
        expect(editor).toContain("work-template-transitions-note");
        expect(editor).toContain("Helpful Commands");
    });
});

describe("Progress bar and density", () => {
    it("renders progress separately from semantic state and uses requirement denominator", () => {
        const published = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: enrollmentLeadWithFieldRulesPublishedDepartmentMetadata(),
            builderStageKey: "lead",
        });
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext(runtimeForLead(), {
                publishedStageInputs: published,
                signals: {
                    ...baseContext(runtimeForLead()).signals,
                    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
                },
            }),
            templateConfig: {
                work_key: "contact_family",
                title: "Contact Family",
                checklist: [
                    { key: "review", label: "Review inquiry", kind: "requirement" },
                    { key: "contact", label: "First contact", kind: "requirement" },
                    { key: "confirm", label: "Confirm interest", kind: "requirement" },
                    { key: "runtime_work", label: "Contact Family", kind: "stage_work" },
                ],
            },
            completedChecklistKeys: new Set(["review", "contact"]),
        });
        expect(vm.progress.total).toBe(3);
        expect(vm.progress.completed).toBe(2);
        expect(vm.progress.percent).toBe(67);
        expect(vm.status).not.toBe("completed");
        expect(vm.statusLabel).not.toContain("%");
    });

    it("omits fake progress when there are no requirements", () => {
        const vm = buildCurrentWorkSurfaceVM({
            context: baseContext(runtimeForLead()),
            templateConfig: {
                work_key: "contact_family",
                title: "Contact Family",
                checklist: [{ key: "work", label: "Contact Family", kind: "stage_work" }],
            },
        });
        expect(vm.progress.total).toBe(0);
        expect(vm.progress.percent).toBe(0);
    });

    // SUMMARY IS THE FIRST OPERATIONAL EXPERIENCE (product doctrine). The committed Current Work
    // summary presents progress + Open Workspace only; the workspace-level, settlement-derived
    // affordances (Quick actions / Other transitions / recent activity) are NOT in the summary — they
    // moved to the drill-in workspace (presentation="workspace"). See CurrentWorkCard SummaryBody.
    it("collapsed summary is obligation-first, not workspace-level affordances", () => {
        const published = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: enrollmentLeadWithFieldRulesPublishedDepartmentMetadata(),
            builderStageKey: "lead",
        });
        const html = renderToStaticMarkup(
            <CurrentWorkCard
                model={cardModel}
                context={baseContext(runtimeForLead(), {
                    publishedStageInputs: published,
                    signals: {
                        ...baseContext(runtimeForLead()).signals,
                        attention: { needsAttention: true, primaryReason: "First contact overdue", reasonCount: 1 },
                    },
                })}
            />,
        );
        // Obligation-first summary; no "Open workspace" affordance competing with the action.
        expect(html).toContain('data-work-summary="true"');
        expect(html).not.toContain("Open workspace");
        // Workspace-level / settlement-derived affordances are NOT committed in the summary.
        expect(html).not.toContain("Quick actions");
        expect(html).not.toContain("Other transitions");
        expect(html).not.toContain("Helpful actions");
        expect(html).not.toContain("Alternate paths");
        expect(html).not.toContain("Work items:");
        expect(html).not.toContain('data-work-operator-guidance="true">');
        expect(html).not.toMatch(/alloy-os-currentwork__summary[^>]*overflow:\s*auto/);
    });

    it("no progress bar or percentage meter in the What's Next card", () => {
        const source = readFileSync(
            resolve(__dirname, "../../../components/admin/focusPanel/cards/CurrentWorkCard.tsx"),
            "utf8",
        );
        // Readiness is a state, not a score — the card renders no progress bar or percentage.
        expect(source).not.toContain("progress.percent");
        expect(source).not.toContain('data-work-progress="true"');
        expect(source).not.toContain("role=\"progressbar\"");
    });
});
