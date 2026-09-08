/**
 * Slice A — centered configured-work host.
 *
 * Current Work elevates as a centered Focus Card through the standard activeDepth /
 * elevatedCellKey path (like Household/Children), not a full-canvas workspace replace.
 * The card renders the configured-work surface when the coordination host marks it open,
 * driven by the generic VM with no capability-specific dispatch.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CurrentWorkCard from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import { isFocusElevatingCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";

vi.mock("@/components/workIntent/useWorkIntentOutcomeCompletion", () => ({
    useWorkIntentOutcomeCompletion: () => ({
        completeOutcome: vi.fn(async () => {}),
        busy: false,
        error: null,
        clearError: vi.fn(),
    }),
}));

function runtime(): StageWorkRuntimeProjection {
    const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: "Reach the family.",
        journey_segment: "family",
        template_keys: ["contact_family"],
        primary: {
            template_key: "contact_family",
            label: "Contact Family",
            description: "Make contact and record outcome.",
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

function context(processKey = "enrollment"): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Digan Family" },
        businessProcess: { key: processKey, label: processKey, stageKey: "lead" },
        perspective: null,
        truth: { id: "opp-1" },
        stageWorkRuntime: runtime(),
        signals: {
            work: {
                primary: { id: "work-1", label: "Contact Family", state: "open", dueLabel: null, dueAt: null, urgency: null, source: "Stage work", kind: "stage_work" },
                items: [],
                openCount: 1,
                overdueCount: 0,
                nextActionLabel: null,
            },
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
            communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
            billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

function coordination(open: boolean): FocusPanelCoordination {
    return {
        focusTargets: new Set(["current_work"]),
        request: null,
        requestFocus: vi.fn(),
        activeDepth: open ? { card: "current_work", level: "focused" } : null,
        reportPerspective: vi.fn(),
        dismissed: null,
        dismiss: vi.fn(),
        previousFocus: null,
        back: vi.fn(),
        currentWorkWorkspace: { open, intent: null },
        openCurrentWorkWorkspace: vi.fn(),
        closeCurrentWorkWorkspace: vi.fn(),
    } as unknown as FocusPanelCoordination;
}

const model: FocusPanelCardModel = {
    key: "current_work",
    title: "What's Next",
    insight: "Contact Family",
    tier: "work",
    span: "row",
    density: "compact",
    visible: true,
    archetype: "status",
};

describe("Slice A — centered configured-work host", () => {
    it("marks current_work as an elevating Focus Card", () => {
        expect(isFocusElevatingCard("current_work")).toBe(true);
    });

    it("renders the summary (not the workspace surface) when not open", () => {
        const html = renderToStaticMarkup(
            <CurrentWorkCard model={model} context={context()} coordination={coordination(false)} />,
        );
        expect(html).toContain('data-work-summary="true"');
        expect(html).not.toContain('data-work-focused-surface="true"');
    });

    it("renders the configured-work surface when the host marks it open — no prop-driven canvas replace", () => {
        const html = renderToStaticMarkup(
            <CurrentWorkCard model={model} context={context()} coordination={coordination(true)} />,
        );
        // Elevated content is driven by coordination open-state (Slice A), not presentation="workspace".
        expect(html).toContain('data-work-focused-surface="true"');
    });

    it("elevates identically for a non-enrollment process (no capability-specific dispatch)", () => {
        const html = renderToStaticMarkup(
            <CurrentWorkCard model={model} context={context("service_intake")} coordination={coordination(true)} />,
        );
        expect(html).toContain('data-work-focused-surface="true"');
    });
});
