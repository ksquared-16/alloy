/**
 * Sprint 5.18K — Current Work outcome flow and overlay UX.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CurrentWorkActionOverlay from "@/components/workIntent/CurrentWorkActionOverlay";
import StageWorkOutcomeConfirm from "@/components/workIntent/StageWorkOutcomeConfirm";
import StageWorkOutcomePicker from "@/components/admin/StageWorkOutcomePicker";
import {
    ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS,
    shouldCloseAdminV2DrawerOnOutsideTarget,
} from "@/lib/adminV2/drawerOutsideClick";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { stageWorkOutcomeEffectLines } from "@/lib/workIntent/stageWorkOutcomeEffectLines";

vi.mock("@/components/workIntent/useWorkIntentOutcomeCompletion", () => ({
    useWorkIntentOutcomeCompletion: () => ({
        completeOutcome: vi.fn(async () => {}),
        busy: false,
        error: null,
        clearError: vi.fn(),
    }),
}));

function stageRuntime(): StageWorkRuntimeProjection {
    const plan = defaultStageOperatingPlanForEnrollmentStage("lead");
    const preview =
        plan ?
            buildStageWorkOutcomeAutomationPreview({
                plan,
                templateKey: "review_lead",
            })
        :   [];

    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: "Review inbound lead and determine next step.",
        journey_segment: "family",
        template_keys: ["review_lead", "contact_family"],
        primary: {
            template_key: "review_lead",
            label: "Review Lead",
            description: "Review inbound lead and determine next step.",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "work-primary",
            due_at: new Date().toISOString(),
            due_urgency: "due_today",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: [
                { outcome_key: "qualified", label: "Qualified", successful: true },
                { outcome_key: "needs_more_information", label: "Needs More Information" },
                { outcome_key: "duplicate", label: "Duplicate" },
                { outcome_key: "closed_lost", label: "Closed Lost" },
            ],
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: preview,
        },
        additional: [
            {
                template_key: "contact_family",
                label: "Contact Family",
                description: null,
                role: "secondary",
                state: "open",
                requires_outcome_picker: false,
                work_id: "work-secondary",
                due_at: null,
                due_urgency: "upcoming",
                attempt_count: 0,
                last_outcome: null,
                completed_at: null,
                outcomes: [],
                completion_policy_summary: null,
                completion_policy_min_attempts: null,
                completion_policy_max_attempts: null,
                outcome_automation_preview: [],
            },
        ],
        execution: {
            department_id: "dept-1",
            requires_outcome_picker: true,
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
        },
    };
}

class MockClosestNode {
    constructor(
        public attrs: Record<string, string>,
        public parent?: MockClosestNode,
    ) {}

    closest(selector: string): MockClosestNode | null {
        const m = /\[([^=\]]+)(?:="([^"]*)")?\]/.exec(selector);
        if (!m) return null;
        const [, attr, val] = m;
        let cur: MockClosestNode | undefined = this;
        while (cur) {
            if (attr in cur.attrs && (val === undefined || cur.attrs[attr] === val)) return cur;
            cur = cur.parent;
        }
        return null;
    }
}

function mockTarget(attrs: Record<string, string>): EventTarget {
    return new MockClosestNode(attrs) as unknown as EventTarget;
}

describe("currentWorkOutcomeFlow 5.18K", () => {
    it("does not close drawer when interacting with current work popover", () => {
        expect(ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS).toContain(
            '[data-current-work-detail-popover="true"]',
        );
        expect(
            shouldCloseAdminV2DrawerOnOutsideTarget(
                mockTarget({ "data-current-work-detail-popover": "true" }),
            ),
        ).toBe(false);
    });

    it("renders simplified current work overview with record outcome action", () => {
        const html = renderToStaticMarkup(
            <CurrentWorkActionOverlay opportunityId="opp-1" runtime={stageRuntime()} canMutate />,
        );
        expect(html).toContain('data-testid="current-work-action-overlay-overview"');
        expect(html).toContain("Review Lead");
        expect(html).toContain("Status: Open");
        expect(html).toContain("Due today");
        expect(html).toContain('data-testid="current-work-record-outcome"');
        expect(html).toContain("Record outcome");
        expect(html).toContain('data-testid="current-work-additional-work"');
        expect(html).toContain("Contact Family");
        expect(html).not.toContain("Review Lead · Open");
    });

    it("shows outcome effects on picker buttons", () => {
        const runtime = stageRuntime();
        const html = renderToStaticMarkup(
            <StageWorkOutcomePicker
                outcomes={runtime.primary!.outcomes}
                automationPreview={runtime.primary!.outcome_automation_preview}
                variant="overlay"
                onSelect={() => {}}
                onCancel={() => {}}
            />,
        );
        expect(html).toContain("Available outcomes");
        expect(html).toContain("Qualified");
        expect(html).toContain('data-testid="stage-work-outcome-qualified"');
    });

    it("builds outcome effect preview lines for confirmation", () => {
        const runtime = stageRuntime();
        const lines = stageWorkOutcomeEffectLines(runtime.primary!, "qualified");
        expect(lines.some((line) => line.toLowerCase().includes("qualification"))).toBe(true);
        expect(lines).toContain("Close current work item");
    });

    it("renders outcome confirmation preview", () => {
        const html = renderToStaticMarkup(
            <StageWorkOutcomeConfirm
                outcomeLabel="Qualified"
                effectLines={["Move to Qualification", "Close current work item"]}
                onConfirm={() => {}}
                onCancel={() => {}}
            />,
        );
        expect(html).toContain("Result preview");
        expect(html).toContain("Qualified");
        expect(html).toContain('data-testid="stage-work-outcome-confirm-submit"');
    });
});
