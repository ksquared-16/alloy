/**
 * SECONDARY WORK MUST BE REACHABLE ON THE SURFACE THE OPERATOR IS ACTUALLY LOOKING AT.
 *
 * This defect survived two fixes that both looked right, because both were asserted by SOURCE
 * GUARDS — "the file contains `data-work-section`" — and a source guard cannot see that the markup
 * it found is in a component nobody renders. Measured on staging, twice:
 *
 *   1. `CurrentWorkWorkspace.tsx` has listed secondary work for a long time. It is the LEGACY
 *      two-column body; the focused state renders `CurrentWorkFocusedSurface` instead.
 *   2. The summary card's section was added next — inside `helpful.length > 0 || subordinateOutcome`,
 *      and on a tenant whose Business Process Card SUPERSEDES Current Work, that summary is never
 *      rendered at all.
 *
 * So this test renders. It asserts the row exists in the output an operator receives, on a stage
 * that projects no helpful commands and no subordinate outcome — the exact shape both gates hid.
 *
 * Nothing here names a real template key: the behaviour belongs to any stage that configures a
 * second piece of work, not to one process.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CurrentWorkCard from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type {
    StageWorkItemProjection,
    StageWorkRuntimeProjection,
} from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

vi.mock("@/components/workIntent/useWorkIntentOutcomeCompletion", () => ({
    useWorkIntentOutcomeCompletion: () => ({
        completeOutcome: vi.fn(async () => {}),
        busy: false,
        error: null,
        clearError: vi.fn(),
    }),
}));

function outcome(key: string, label: string): StageCompletionOutcomeV1 {
    return { outcome_key: key, label } as StageCompletionOutcomeV1;
}

function work(
    template_key: string,
    role: "primary" | "secondary",
    outcomes: StageCompletionOutcomeV1[],
): StageWorkItemProjection {
    return {
        template_key,
        label: `${template_key} label`,
        description: null,
        role,
        state: "open",
        requires_outcome_picker: true,
        work_id: `work-${template_key}`,
        due_at: null,
        due_urgency: "none",
        attempt_count: 0,
        last_outcome: null,
        completed_at: null,
        outcomes,
        completion_policy_summary: null,
        completion_policy_min_attempts: null,
        completion_policy_max_attempts: null,
        outcome_automation_preview: [],
    } as unknown as StageWorkItemProjection;
}

const SECONDARY_OUTCOMES = [
    outcome("placed", "Placed"),
    outcome("no_reply", "No reply"),
    outcome("paused", "Paused"),
];

function runtime(): StageWorkRuntimeProjection {
    return {
        stage_key: "holding",
        stage_label: "Holding",
        purpose: "Hold the position.",
        journey_segment: "family",
        template_keys: ["review_position", "second_work"],
        primary: work("review_position", "primary", [outcome("paused", "Paused")]),
        additional: [work("second_work", "secondary", SECONDARY_OUTCOMES)],
        execution: {
            department_id: "dept-1",
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
            requires_outcome_picker: true,
        },
    } as unknown as StageWorkRuntimeProjection;
}

function context(): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "A Family" },
        businessProcess: { key: "enrollment", label: "enrollment", stageKey: "holding" },
        perspective: null,
        truth: { id: "opp-1" },
        stageWorkRuntime: runtime(),
        signals: {
            work: {
                primary: {
                    id: "work-review_position",
                    label: "review_position label",
                    state: "open",
                    dueLabel: null,
                    dueAt: null,
                    urgency: null,
                    source: "Stage work",
                    kind: "stage_work",
                },
                items: [],
                openCount: 2,
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
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    } as unknown as OperationalContext;
}

function coordination(): FocusPanelCoordination {
    return {
        focusTargets: new Set(["current_work"]),
        request: null,
        requestFocus: vi.fn(),
        activeDepth: { card: "current_work", level: "focused" },
        reportPerspective: vi.fn(),
        dismissed: null,
        dismiss: vi.fn(),
        previousFocus: null,
        back: vi.fn(),
        currentWorkWorkspace: { open: true, intent: null },
        openCurrentWorkWorkspace: vi.fn(),
        closeCurrentWorkWorkspace: vi.fn(),
    } as unknown as FocusPanelCoordination;
}

const model: FocusPanelCardModel = {
    key: "current_work",
    title: "What's Next",
    insight: "review_position label",
    tier: "work",
    span: "row",
    density: "compact",
    visible: true,
    archetype: "status",
};

function focusedHtml(): string {
    return renderToStaticMarkup(
        <CurrentWorkCard model={model} context={context()} coordination={coordination()} />,
    );
}

describe("secondary work is reachable from the focused workspace", () => {
    it("renders the focused surface, not the legacy workspace body", () => {
        const html = focusedHtml();
        expect(html).toContain('data-work-focused-surface="true"');
    });

    it("lists the stage's other open work as its own row", () => {
        const html = focusedHtml();
        expect(html).toContain('data-work-section="also-in-progress"');
        expect(html).toContain('data-work-secondary-item="second_work"');
    });

    it("does not list the primary work as something to also do", () => {
        expect(focusedHtml()).not.toContain('data-work-secondary-item="review_position"');
    });

    /**
     * THE ACTUAL DEFECT, STATED AS AN ASSERTION.
     *
     * Both previous attempts nested the section inside a gate that this stage does not satisfy.
     * This fixture projects no helpful commands and no subordinate outcome, so the action stack is
     * absent from the output — and the row must still be there. If someone moves the section back
     * inside that stack, this fails and the source guards do not.
     */
    it("survives a stage that projects no action stack at all", () => {
        const html = focusedHtml();
        expect(html).not.toContain('data-work-focused-actions="true"');
        expect(html).toContain('data-work-secondary-item="second_work"');
    });
});
