/**
 * Current Work card — Summary + Focus rendering smoke tests.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CurrentWorkCard, { ReadinessSummary } from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import type { CurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
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
            description: "Make contact and record outcome.",
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
        expect(html).toContain("Make contact and record outcome");
        // Recent-activity preview is a workspace-level (settlement) affordance — it moved to the
        // drill-in workspace and is NOT in the committed summary (product doctrine: summary first).
        expect(html).not.toContain("Recent activity");
        expect(html).not.toContain("Review Lead");
        expect(html).toContain('data-current-work-surface="true"');
        expect(html).toContain('data-work-card-perspective="summary"');
        // Obligation-first: no "Open workspace" competing, no progress meter (both removed in M1).
        expect(html).not.toContain("Open workspace");
        expect(html).not.toContain("data-work-progress");
    });

    it("routes Contact Family through resolveWorkItemHandoff — not dead panel copy", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/cards/CurrentWorkCard.tsx"),
            "utf8",
        );
        expect(src).toContain("resolveWorkItemHandoff");
        expect(src).not.toContain("Communications is not on this panel");
        expect(src).toContain("CurrentWorkActivityPreview");
        expect(src).toContain('data-work-action="preview-activity"');
        expect(src).toContain("handleViewFullActivity");
        const previewSrc = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/cards/CurrentWorkActivityPreview.tsx"),
            "utf8",
        );
        expect(previewSrc).toContain('data-work-action="view-full-activity"');
        expect(src).toContain("invokeHeaderAction");
        expect(src).toContain("resolveCurrentWorkActionSurface");
        expect(src).toContain("CurrentWorkActionPanel");
        expect(src).not.toMatch(/\benrollment\b/i);
        expect(src).not.toMatch(/\bwaitlist\b/i);
    });

    it("wires supporting actions through action surface resolver and inline panel shell", () => {
        const cardSrc = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/cards/CurrentWorkCard.tsx"),
            "utf8",
        );
        const panelSrc = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/cards/CurrentWorkActionPanel.tsx"),
            "utf8",
        );
        expect(cardSrc).toContain('case "inline_form"');
        expect(cardSrc).toContain('case "header_delegate"');
        expect(cardSrc).toContain('case "communications_composer"');
        expect(cardSrc).toContain("CurrentWorkActionPanel");
        expect(panelSrc).toContain('data-work-action-panel="true"');
        expect(panelSrc).toContain('variant="embedded"');
        expect(panelSrc).toContain('data-work-action-panel-state="unsupported"');
        expect(panelSrc).not.toMatch(/\benrollment\b/i);
    });

    it("passes mutation seam into Current Work card from FocusPanelCardRenderer", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/FocusPanelCardRenderer.tsx"),
            "utf8",
        );
        expect(src).toMatch(/model\.key === "current_work"[\s\S]*mutation=\{mutation\}/);
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

    it("renders without AdminDrawerProvider (dev builder / static prerender)", async () => {
        vi.resetModules();
        vi.doUnmock("@/components/workIntent/useWorkIntentOutcomeCompletion");
        const { default: UnmockedCurrentWorkCard } = await import(
            "@/components/admin/focusPanel/cards/CurrentWorkCard"
        );
        expect(() =>
            renderToStaticMarkup(
                <UnmockedCurrentWorkCard
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
            ),
        ).not.toThrow();
    });

    it("M1 — summary omits the progress meter, keeps the obligation + primary CTA + reachability", () => {
        const html = renderToStaticMarkup(
            <CurrentWorkCard
                model={{
                    key: "current_work",
                    title: "What's Next",
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
        // Obligation preserved; no "Open workspace" competing (removed in M1).
        expect(html).toContain("Contact Family");
        expect(html).toContain('data-work-summary="true"');
        expect(html).not.toContain("Open workspace");
        // No progress meter / percentage / "N of M complete" framing.
        expect(html).not.toContain("data-work-progress");
        expect(html).not.toContain("__progress-bar");
        expect(html).not.toContain("requirements complete");
    });

    it("M1 — ReadinessSummary shows a concise Still needed summary, not the satisfied field checklist", () => {
        const surface = {
            readiness: {
                state: "in_progress",
                reasonCodes: [],
                reasonLabel: null,
                requirements: {
                    complete: 1,
                    total: 2,
                    remaining: 1,
                    items: [
                        { key: "contacted", label: "Family contacted", status: "complete" },
                        { key: "classroom", label: "Classroom", status: "missing", targetLabel: "Required information" },
                    ],
                },
            },
        } as unknown as CurrentWorkSurfaceVM;
        const html = renderToStaticMarkup(<ReadinessSummary surface={surface} onNavigate={() => {}} />);
        // Only the OUTSTANDING requirement is summarized; the satisfied field is NOT reproduced
        // (Required Information owns detailed completeness).
        expect(html).toContain("Still needed");
        expect(html).toContain("Classroom");
        expect(html).not.toContain("Ready to continue");
        expect(html).not.toContain("Family contacted");
        expect(html).toContain('data-work-readiness-group="still-needed"');
        expect(html).not.toContain('data-work-readiness-group="ready"');
        // A state, not a score — no percentage or progress meter.
        expect(html).not.toContain("%");
        expect(html).not.toContain("Progress");
    });
});
