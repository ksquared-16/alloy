/**
 * Current Work card — Summary + Focus rendering smoke tests.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CurrentWorkCard from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";

vi.mock("@/components/workIntent/useWorkIntentOutcomeCompletion", () => ({
    useWorkIntentOutcomeCompletion: () => ({
        completeOutcome: vi.fn(async () => {}),
        busy: false,
        error: null,
        clearError: vi.fn(),
    }),
}));

function stageRuntime(overrides?: Partial<StageWorkRuntimeProjection>): StageWorkRuntimeProjection {
    const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: "Review inbound lead and reach the family.",
        journey_segment: "family",
        template_keys: ["contact_family"],
        primary: {
            template_key: "contact_family",
            label: "Contact Family",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "work-primary",
            due_at: new Date().toISOString(),
            due_urgency: "due_today",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: plan.outcomes.filter((o) => o.work_template_key === "contact_family"),
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
        ...overrides,
    };
}

function context(runtime?: StageWorkRuntimeProjection | null): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Digan Family" },
        businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
        perspective: null,
        truth: { id: "opp-1" },
        stageWorkRuntime: runtime ?? stageRuntime(),
        signals: {
            work: {
                primary: {
                    id: "work-primary",
                    label: "Contact Family",
                    state: "open",
                    dueLabel: "Due today",
                    dueAt: null,
                    urgency: "today",
                    source: "Stage work",
                    kind: "stage_work",
                },
                items: [],
                openCount: 1,
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
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

function coordination(partial: Partial<FocusPanelCoordination> = {}): FocusPanelCoordination {
    return {
        focusTargets: new Set(["communications", "current_work"]),
        request: null,
        requestFocus: vi.fn(),
        activeDepth: null,
        reportPerspective: vi.fn(),
        dismissed: null,
        dismiss: vi.fn(),
        previousFocus: null,
        back: vi.fn(),
        ...partial,
    };
}

describe("CurrentWorkCard", () => {
    it("renders Summary with work title and primary CTA", () => {
        const html = renderToStaticMarkup(
            <CurrentWorkCard
                model={{
                    key: "current_work",
                    title: "Current Work",
                    insight: "Contact Family",
                    tier: "work",
                    span: "row",
                    density: "compact",
                    visible: true,
                    archetype: "status",
                }}
                context={context()}
            />,
        );
        expect(html).toContain("Contact Family");
        expect(html).toContain("Record what happened");
        expect(html).not.toContain("Review Lead");
        expect(html).not.toContain("alloy-os-ucard__action--cta");
        expect(html).toContain('data-current-work-surface="true"');
        expect(html).toContain('data-work-card-perspective="summary"');
        expect(html).toContain('data-work-action="open"');
    });

    it("routes Contact Family through resolveWorkItemHandoff — not dead panel copy", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/cards/CurrentWorkCard.tsx"),
            "utf8",
        );
        expect(src).toContain("resolveWorkItemHandoff");
        expect(src).not.toContain("Communications is not on this panel");
        expect(src).toContain('openFocusPanelMode?.("activity")');
        expect(src).toContain("invokeHeaderAction");
    });

    it("uses neutral focused elevation CSS — no double Bend Pine ring on focused card", () => {
        const css = readFileSync(
            path.join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"),
            "utf8",
        );
        expect(css).toContain('[data-work-card-perspective="focused"]');
        expect(css).toMatch(
            /alloy-os-currentwork\[data-work-card-perspective="focused"\][\s\S]*box-shadow:[\s\S]*alloy-os-midnight/,
        );
        const focusedBlock = css.match(
            /\.alloy-os-currentwork\[data-work-card-perspective="focused"\][\s\S]*?\}/,
        )?.[0];
        expect(focusedBlock).toBeTruthy();
        expect(focusedBlock).not.toContain("bend-pine");
    });
});
